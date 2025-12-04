import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { isExecutorEnabled } from "../config/agent";
import { getTerminalConfig } from "../config/terminal";
import { db } from "../db/client";
import { executionLogs, repositories, taskMessages, tasks } from "../db/schema";
import { ClaudeCodeExecutor } from "../executors/claude";
import { CodexExecutor } from "../executors/codex";
import { CopilotExecutor } from "../executors/copilot";
import { GeminiExecutor } from "../executors/gemini";
import type { Executor } from "../executors/interface";
import {
  badRequest,
  internalError,
  invalidStateTransition,
  notFound,
} from "../lib/errors";
import { playSuccessSound } from "../lib/sound";
import { createBranch, deleteBranch, getDiff } from "../services/git";
import { createWorktree, deleteWorktree } from "../services/worktree";

// In-memory store for active executors
const activeExecutors = new Map<string, Executor>();

function createExecutor(type: string): Executor {
  switch (type) {
    case "ClaudeCode":
      return new ClaudeCodeExecutor();
    case "Codex":
      return new CodexExecutor();
    case "Copilot":
      return new CopilotExecutor();
    case "Gemini":
      return new GeminiExecutor();
    default:
      throw new Error(`Unsupported executor type: ${type}`);
  }
}

// Add isExecuting field to task based on activeExecutors
function withExecutingStatus<T extends { id: string }>(
  task: T,
): T & { isExecuting: boolean } {
  return {
    ...task,
    isExecuting: activeExecutors.has(task.id),
  };
}

// Forward declaration for circular dependency
let startExecutorWithMessage: (
  taskId: string,
  message: string,
) => Promise<void>;

// Handle executor completion: process pending messages or update task status to InReview
async function handleExecutorExit(taskId: string): Promise<void> {
  console.log(`[handleExecutorExit] Called for task ${taskId}`);
  const now = new Date().toISOString();

  // Remove from active executors
  activeExecutors.delete(taskId);
  console.log(`[handleExecutorExit] Removed task from activeExecutors`);

  // Get current task status
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    console.log(`[handleExecutorExit] Task not found`);
    return;
  }

  const task = taskResult[0];
  console.log(`[handleExecutorExit] Task status: ${task.status}`);

  // Only process if currently InProgress
  if (task.status !== "InProgress") {
    console.log(
      `[handleExecutorExit] Not processing - status is not InProgress`,
    );
    return;
  }

  // Check for pending messages in the queue
  const pendingMessages = await db
    .select()
    .from(taskMessages)
    .where(eq(taskMessages.taskId, taskId))
    .orderBy(asc(taskMessages.createdAt));

  const nextMessage = pendingMessages.find((m) => m.status === "pending");

  if (nextMessage) {
    console.log(
      `[handleExecutorExit] Found pending message ${nextMessage.id}, processing...`,
    );

    // Mark message as delivered
    await db
      .update(taskMessages)
      .set({
        status: "delivered",
        deliveredAt: now,
      })
      .where(eq(taskMessages.id, nextMessage.id));

    // Broadcast message delivered event
    broadcastMessageEvent(taskId, {
      type: "message-delivered",
      taskId,
      messageId: nextMessage.id,
      deliveredAt: now,
    });

    // Log the message delivery
    const log = {
      id: crypto.randomUUID(),
      taskId,
      content: `[system] Processing queued message: ${nextMessage.content.substring(0, 100)}${nextMessage.content.length > 100 ? "..." : ""}`,
      logType: "system",
      createdAt: now,
    };
    await db.insert(executionLogs).values(log);
    broadcastLog(log);

    // Start executor with the next message
    try {
      await startExecutorWithMessage(taskId, nextMessage.content);
    } catch (error) {
      console.error(
        `[handleExecutorExit] Failed to start executor with message: ${error}`,
      );
      // Mark message as failed
      await db
        .update(taskMessages)
        .set({ status: "failed" })
        .where(eq(taskMessages.id, nextMessage.id));

      // Fall through to transition to InReview
      await transitionToInReview(taskId, task.repositoryId, now);
    }
  } else {
    // No pending messages, transition to InReview
    await transitionToInReview(taskId, task.repositoryId, now);
  }
}

// Helper function to transition task to InReview
async function transitionToInReview(
  taskId: string,
  repositoryId: string,
  now: string,
): Promise<void> {
  console.log(
    `[transitionToInReview] Transitioning task ${taskId} to InReview`,
  );
  await db
    .update(tasks)
    .set({
      status: "InReview",
      updatedAt: now,
    })
    .where(eq(tasks.id, taskId));

  // Broadcast status change via logs
  const log = {
    id: crypto.randomUUID(),
    taskId,
    content: "[system] Executor completed. Task moved to InReview.",
    logType: "system",
    createdAt: now,
  };
  await db.insert(executionLogs).values(log);
  broadcastLog(log);

  // Broadcast task status changed event for Kanban real-time updates
  broadcastTaskEvent(repositoryId, {
    type: "task-status-changed",
    taskId,
    oldStatus: "InProgress",
    newStatus: "InReview",
    isExecuting: false,
    updatedAt: now,
  });

  // Play success sound notification
  playSuccessSound();

  console.log(`[transitionToInReview] Transition complete`);
}

async function runCommand(
  command: string[],
  errorMessage: string,
): Promise<void> {
  try {
    const process = Bun.spawn(command, {
      stdout: "ignore",
      stderr: "pipe",
    });
    const exitCode = await process.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(process.stderr).text();
      throw new Error(stderr || `Command exited with code ${exitCode}`);
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Unknown error: ${String(error)}`;
    throw new Error(`${errorMessage}: ${message}`);
  }
}

async function openInFileExplorer(path: string): Promise<void> {
  const normalizedPath = resolve(path);
  const platform = process.platform;

  if (platform === "darwin") {
    await runCommand(
      ["open", normalizedPath],
      "Failed to open worktree in Finder",
    );
    return;
  }

  if (platform === "win32") {
    await runCommand(
      ["explorer", normalizedPath],
      "Failed to open worktree in Explorer",
    );
    return;
  }

  await runCommand(
    ["xdg-open", normalizedPath],
    "Failed to open worktree in file explorer",
  );
}

function escapeShellPath(path: string): string {
  return path.replace(/'/g, "'\\''");
}

async function openInTerminal(path: string): Promise<void> {
  const normalizedPath = resolve(path);
  const platform = process.platform;
  const terminalConfig = await getTerminalConfig();

  if (platform === "darwin") {
    // Use terminal app from settings, fallback to default
    const terminalApp = terminalConfig.macosApp || "Terminal";
    await runCommand(
      ["open", "-a", terminalApp, normalizedPath],
      `Failed to open ${terminalApp} at worktree`,
    );
    return;
  }

  if (platform === "win32") {
    const escapedPath = normalizedPath.replace(/'/g, "''");
    await runCommand(
      [
        "powershell",
        "-NoProfile",
        "-Command",
        `Start-Process powershell -WorkingDirectory '${escapedPath}'`,
      ],
      "Failed to open terminal at worktree",
    );
    return;
  }

  // Linux: Use custom command from settings
  const customCommand = terminalConfig.linuxCommand;
  if (customCommand) {
    const escapedPath = escapeShellPath(normalizedPath);
    const rendered = customCommand.replaceAll("{path}", `'${escapedPath}'`);
    await runCommand(
      ["bash", "-lc", rendered],
      "Failed to open terminal at worktree",
    );
    return;
  }

  const candidates: string[][] = [
    ["gnome-terminal", "--working-directory", normalizedPath],
    ["konsole", "--workdir", normalizedPath],
    ["xfce4-terminal", "--working-directory", normalizedPath],
    ["x-terminal-emulator", "--working-directory", normalizedPath],
    ["alacritty", "--working-directory", normalizedPath],
  ];

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      await runCommand(candidate, "Failed to open terminal at worktree");
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(
    lastError?.message ??
      "No supported terminal launcher found. Configure in Settings.",
  );
}

// SSE subscribers per task (for execution logs)
type LogSubscriber = (log: {
  id: string;
  taskId: string;
  content: string;
  logType: string;
  createdAt: string;
}) => void;
const logSubscribers = new Map<string, Set<LogSubscriber>>();

function subscribeToLogs(taskId: string, callback: LogSubscriber): () => void {
  if (!logSubscribers.has(taskId)) {
    logSubscribers.set(taskId, new Set());
  }
  logSubscribers.get(taskId)?.add(callback);

  // Return unsubscribe function
  return () => {
    const subscribers = logSubscribers.get(taskId);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        logSubscribers.delete(taskId);
      }
    }
  };
}

function broadcastLog(log: {
  id: string;
  taskId: string;
  content: string;
  logType: string;
  createdAt: string;
}): void {
  const subscribers = logSubscribers.get(log.taskId);
  if (subscribers) {
    for (const callback of subscribers) {
      callback(log);
    }
  }
}

// SSE subscribers per repository (for task events)
type TaskEvent =
  | {
      type: "task-status-changed";
      taskId: string;
      oldStatus: string;
      newStatus: string;
      isExecuting: boolean;
      updatedAt: string;
    }
  | {
      type: "task-created";
      task: ReturnType<typeof withExecutingStatus>;
      createdAt: string;
    }
  | {
      type: "task-deleted";
      taskId: string;
      deletedAt: string;
    };

type TaskEventSubscriber = (event: TaskEvent) => void;
const repositoryTaskSubscribers = new Map<string, Set<TaskEventSubscriber>>();

function subscribeToRepositoryTasks(
  repositoryId: string,
  callback: TaskEventSubscriber,
): () => void {
  if (!repositoryTaskSubscribers.has(repositoryId)) {
    repositoryTaskSubscribers.set(repositoryId, new Set());
  }
  repositoryTaskSubscribers.get(repositoryId)?.add(callback);

  return () => {
    const subscribers = repositoryTaskSubscribers.get(repositoryId);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        repositoryTaskSubscribers.delete(repositoryId);
      }
    }
  };
}

function broadcastTaskEvent(repositoryId: string, event: TaskEvent): void {
  const subscribers = repositoryTaskSubscribers.get(repositoryId);
  if (subscribers) {
    for (const callback of subscribers) {
      callback(event);
    }
  }
}

// SSE subscribers per task (for message events)
type MessageEvent =
  | {
      type: "message-queued";
      taskId: string;
      message: {
        id: string;
        taskId: string;
        content: string;
        status: string;
        createdAt: string;
        deliveredAt: string | null;
      };
    }
  | {
      type: "message-delivered";
      taskId: string;
      messageId: string;
      deliveredAt: string;
    };

type MessageEventSubscriber = (event: MessageEvent) => void;
const messageSubscribers = new Map<string, Set<MessageEventSubscriber>>();

function subscribeToMessages(
  taskId: string,
  callback: MessageEventSubscriber,
): () => void {
  if (!messageSubscribers.has(taskId)) {
    messageSubscribers.set(taskId, new Set());
  }
  messageSubscribers.get(taskId)?.add(callback);

  return () => {
    const subscribers = messageSubscribers.get(taskId);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        messageSubscribers.delete(taskId);
      }
    }
  };
}

function broadcastMessageEvent(taskId: string, event: MessageEvent): void {
  const subscribers = messageSubscribers.get(taskId);
  if (subscribers) {
    for (const callback of subscribers) {
      callback(event);
    }
  }
}

// Routes for /v1/repositories/:repositoryId/tasks
export const repositoryTasks = new Hono();

// GET /v1/repositories/:repositoryId/tasks - List tasks for a repository
repositoryTasks.get("/:repositoryId/tasks", async (c) => {
  const repositoryId = c.req.param("repositoryId");

  // Check if repository exists
  const repository = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId));

  if (repository.length === 0) {
    return notFound(c, "Repository");
  }

  const result = await db
    .select()
    .from(tasks)
    .where(eq(tasks.repositoryId, repositoryId));

  return c.json(result.map(withExecutingStatus));
});

// POST /v1/repositories/:repositoryId/tasks - Create a new task
repositoryTasks.post("/:repositoryId/tasks", async (c) => {
  const repositoryId = c.req.param("repositoryId");

  // Check if repository exists
  const repository = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId));

  if (repository.length === 0) {
    return notFound(c, "Repository");
  }

  const body = await c.req.json();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const newTask = {
    id,
    repositoryId,
    title: body.title,
    description: body.description ?? null,
    status: "TODO" as const,
    executor: body.executor,
    branchName: body.branchName,
    baseBranch: body.baseBranch ?? repository[0].defaultBranch,
    worktreePath: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };

  await db.insert(tasks).values(newTask);

  // Broadcast task created event
  broadcastTaskEvent(repositoryId, {
    type: "task-created",
    task: withExecutingStatus(newTask),
    createdAt: now,
  });

  return c.json(withExecutingStatus(newTask), 201);
});

// GET /v1/repositories/:repositoryId/tasks/stream - Stream task events via SSE
repositoryTasks.get("/:repositoryId/tasks/stream", async (c) => {
  const repositoryId = c.req.param("repositoryId");

  // Check if repository exists
  const repository = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId));

  if (repository.length === 0) {
    return notFound(c, "Repository");
  }

  return streamSSE(c, async (stream) => {
    let eventId = 0;

    const unsubscribe = subscribeToRepositoryTasks(repositoryId, (event) => {
      stream.writeSSE({
        data: JSON.stringify(event),
        event: event.type,
        id: String(eventId++),
      });
    });

    // Send initial connection event
    await stream.writeSSE({
      data: JSON.stringify({ repositoryId, status: "connected" }),
      event: "connected",
      id: String(eventId++),
    });

    // Keep connection alive with periodic heartbeats
    const heartbeat = setInterval(() => {
      stream.writeSSE({
        data: "",
        event: "heartbeat",
        id: String(eventId++),
      });
    }, 30000);

    // Clean up on disconnect
    stream.onAbort(() => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    // Keep the stream open
    await new Promise(() => {});
  });
});

// Routes for /v1/tasks/:id
export const taskById = new Hono();

// GET /v1/tasks/:id - Get a task by ID
taskById.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.select().from(tasks).where(eq(tasks.id, id));

  if (result.length === 0) {
    return notFound(c, "Task");
  }

  return c.json(withExecutingStatus(result[0]));
});

// PUT /v1/tasks/:id - Update a task
taskById.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const existing = await db.select().from(tasks).where(eq(tasks.id, id));

  if (existing.length === 0) {
    return notFound(c, "Task");
  }

  const updated: Record<string, unknown> = {
    title: body.title ?? existing[0].title,
    description: body.description ?? existing[0].description,
    status: body.status ?? existing[0].status,
    updatedAt: now,
  };

  // Set startedAt when transitioning to InProgress
  if (body.status === "InProgress" && !existing[0].startedAt) {
    updated.startedAt = now;
  }

  // Set completedAt when transitioning to Done
  if (body.status === "Done" && !existing[0].completedAt) {
    updated.completedAt = now;
  }

  await db.update(tasks).set(updated).where(eq(tasks.id, id));

  // Broadcast task status changed event if status actually changed
  const oldStatus = existing[0].status;
  const newStatus = updated.status as string;
  if (oldStatus !== newStatus) {
    broadcastTaskEvent(existing[0].repositoryId, {
      type: "task-status-changed",
      taskId: id,
      oldStatus,
      newStatus,
      isExecuting: activeExecutors.has(id),
      updatedAt: now,
    });
  }

  return c.json(withExecutingStatus({ ...existing[0], ...updated }));
});

// DELETE /v1/tasks/:id - Delete a task
taskById.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db.select().from(tasks).where(eq(tasks.id, id));

  if (existing.length === 0) {
    return notFound(c, "Task");
  }

  const repositoryId = existing[0].repositoryId;
  await db.delete(tasks).where(eq(tasks.id, id));

  // Broadcast task deleted event
  broadcastTaskEvent(repositoryId, {
    type: "task-deleted",
    taskId: id,
    deletedAt: new Date().toISOString(),
  });

  return c.json({ message: "Task deleted" });
});

// GET /v1/tasks/:id/logs - Get execution logs for a task
taskById.get("/:id/logs", async (c) => {
  const id = c.req.param("id");

  // Check if task exists
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  // Get logs ordered by createdAt descending (newest first)
  const logs = await db
    .select()
    .from(executionLogs)
    .where(eq(executionLogs.taskId, id))
    .orderBy(desc(executionLogs.createdAt));

  return c.json(logs);
});

// GET /v1/tasks/:id/diff - Get diff from base branch
taskById.get("/:id/diff", async (c) => {
  const id = c.req.param("id");

  // Get task
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  const task = taskResult[0];

  // Get repository info
  const repoResult = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, task.repositoryId));

  if (repoResult.length === 0) {
    return notFound(c, "Repository");
  }

  const repo = repoResult[0];

  try {
    const diff = await getDiff(repo.path, task.baseBranch, task.branchName, {
      worktreePath: task.worktreePath ?? undefined,
    });
    return c.json({ diff });
  } catch (error) {
    return internalError(c, `Failed to get diff: ${error}`);
  }
});

// POST /v1/tasks/:id/worktree/open-explorer - Open worktree path in file explorer
taskById.post("/:id/worktree/open-explorer", async (c) => {
  const id = c.req.param("id");

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  const task = taskResult[0];
  if (!task.worktreePath) {
    return badRequest(c, "Task has no worktree");
  }
  if (!existsSync(task.worktreePath)) {
    return badRequest(c, "Worktree path does not exist");
  }

  try {
    await openInFileExplorer(task.worktreePath);
    return c.json({ message: "Opened worktree in file explorer" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    return internalError(
      c,
      `Failed to open worktree in file explorer: ${message}`,
    );
  }
});

// POST /v1/tasks/:id/worktree/open-terminal - Open worktree path in terminal
taskById.post("/:id/worktree/open-terminal", async (c) => {
  const id = c.req.param("id");

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  const task = taskResult[0];
  if (!task.worktreePath) {
    return badRequest(c, "Task has no worktree");
  }
  if (!existsSync(task.worktreePath)) {
    return badRequest(c, "Worktree path does not exist");
  }

  try {
    await openInTerminal(task.worktreePath);
    return c.json({ message: "Opened worktree in terminal" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    return internalError(c, `Failed to open worktree in terminal: ${message}`);
  }
});

// GET /v1/tasks/:id/logs/stream - Stream execution logs via SSE
taskById.get("/:id/logs/stream", async (c) => {
  const id = c.req.param("id");

  // Check if task exists
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  return streamSSE(c, async (stream) => {
    let eventId = 0;

    const unsubscribe = subscribeToLogs(id, (log) => {
      stream.writeSSE({
        data: JSON.stringify(log),
        event: "log",
        id: String(eventId++),
      });
    });

    // Send initial connection event
    await stream.writeSSE({
      data: JSON.stringify({ taskId: id, status: "connected" }),
      event: "connected",
      id: String(eventId++),
    });

    // Keep connection alive with periodic heartbeats
    const heartbeat = setInterval(() => {
      stream.writeSSE({
        data: "",
        event: "heartbeat",
        id: String(eventId++),
      });
    }, 30000);

    // Clean up on disconnect
    stream.onAbort(() => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    // Keep the stream open
    await new Promise(() => {});
  });
});

// POST /v1/tasks/:id/start - Create worktree, start executor
taskById.post("/:id/start", async (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  const task = taskResult[0];

  if (task.status !== "TODO") {
    return invalidStateTransition(c, task.status, ["TODO"], "start");
  }

  // Check if the executor/agent is enabled
  const isEnabled = await isExecutorEnabled(task.executor);
  if (!isEnabled) {
    return badRequest(c, `Agent "${task.executor}" is disabled in settings`);
  }

  // Get repository info
  const repoResult = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, task.repositoryId));

  if (repoResult.length === 0) {
    return notFound(c, "Repository");
  }

  const repo = repoResult[0];
  const worktreePath = `${tmpdir()}/sahai-worktrees/${task.id}`;

  try {
    // Create branch from base branch
    await createBranch(repo.path, task.branchName, task.baseBranch);

    // Create worktree
    await createWorktree(repo.path, worktreePath, task.branchName);

    // Update task status
    await db
      .update(tasks)
      .set({
        status: "InProgress",
        worktreePath,
        startedAt: now,
        updatedAt: now,
      })
      .where(eq(tasks.id, id));

    // Create and start executor
    let executor: Executor;
    try {
      executor = createExecutor(task.executor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return badRequest(c, message);
    }

    executor.onOutput(async (output) => {
      // Save output to execution_logs
      const log = {
        id: crypto.randomUUID(),
        taskId: id,
        content: output.content,
        logType: output.logType,
        createdAt: new Date().toISOString(),
      };
      await db.insert(executionLogs).values(log);
      // Broadcast to SSE subscribers
      broadcastLog(log);
    });

    executor.onExit(() => {
      handleExecutorExit(id);
    });

    executor.onSessionId(async (sessionId) => {
      // Save session ID to task for later resume
      console.log(`[tasks] Saving session ID ${sessionId} for task ${id}`);
      await db
        .update(tasks)
        .set({ sessionId, updatedAt: new Date().toISOString() })
        .where(eq(tasks.id, id));
    });

    await executor.start({
      taskId: id,
      workingDirectory: worktreePath,
      prompt: task.description ?? task.title,
    });

    activeExecutors.set(id, executor);

    // Broadcast task status changed event
    broadcastTaskEvent(task.repositoryId, {
      type: "task-status-changed",
      taskId: id,
      oldStatus: "TODO",
      newStatus: "InProgress",
      isExecuting: true,
      updatedAt: now,
    });

    const updatedTask = await db.select().from(tasks).where(eq(tasks.id, id));

    return c.json(withExecutingStatus(updatedTask[0]));
  } catch (error) {
    return internalError(c, `Failed to start task: ${error}`);
  }
});

// POST /v1/tasks/:id/pause - Stop executor
taskById.post("/:id/pause", async (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  const task = taskResult[0];

  if (task.status !== "InProgress") {
    return invalidStateTransition(c, task.status, ["InProgress"], "pause");
  }

  const executor = activeExecutors.get(id);
  if (executor) {
    await executor.stop();
    activeExecutors.delete(id);
  }

  await db.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, id));

  const updatedTask = await db.select().from(tasks).where(eq(tasks.id, id));
  return c.json(withExecutingStatus(updatedTask[0]));
});

// POST /v1/tasks/:id/complete - Transition to InReview
taskById.post("/:id/complete", async (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  const task = taskResult[0];

  if (task.status !== "InProgress") {
    return invalidStateTransition(c, task.status, ["InProgress"], "complete");
  }

  // Stop executor if running
  const executor = activeExecutors.get(id);
  if (executor) {
    await executor.stop();
    activeExecutors.delete(id);
  }

  await db
    .update(tasks)
    .set({
      status: "InReview",
      updatedAt: now,
    })
    .where(eq(tasks.id, id));

  // Broadcast task status changed event
  broadcastTaskEvent(task.repositoryId, {
    type: "task-status-changed",
    taskId: id,
    oldStatus: "InProgress",
    newStatus: "InReview",
    isExecuting: false,
    updatedAt: now,
  });

  const updatedTask = await db.select().from(tasks).where(eq(tasks.id, id));
  return c.json(withExecutingStatus(updatedTask[0]));
});

// POST /v1/tasks/:id/resume - Restart executor
taskById.post("/:id/resume", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  const task = taskResult[0];

  if (task.status !== "InProgress" && task.status !== "InReview") {
    return invalidStateTransition(
      c,
      task.status,
      ["InProgress", "InReview"],
      "resume",
    );
  }

  if (!task.worktreePath) {
    return badRequest(c, "Task has no worktree");
  }

  // Check if the executor/agent is enabled
  const isEnabled = await isExecutorEnabled(task.executor);
  if (!isEnabled) {
    return badRequest(c, `Agent "${task.executor}" is disabled in settings`);
  }

  // Stop existing executor if running
  const existingExecutor = activeExecutors.get(id);
  if (existingExecutor) {
    await existingExecutor.stop();
    activeExecutors.delete(id);
  }

  try {
    // Create and start executor
    let executor: Executor;
    try {
      executor = createExecutor(task.executor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return badRequest(c, message);
    }

    executor.onOutput(async (output) => {
      const log = {
        id: crypto.randomUUID(),
        taskId: id,
        content: output.content,
        logType: output.logType,
        createdAt: new Date().toISOString(),
      };
      await db.insert(executionLogs).values(log);
      // Broadcast to SSE subscribers
      broadcastLog(log);
    });

    executor.onExit(() => {
      handleExecutorExit(id);
    });

    executor.onSessionId(async (sessionId) => {
      // Save session ID to task for later resume
      console.log(`[tasks] Saving session ID ${sessionId} for task ${id}`);
      await db
        .update(tasks)
        .set({ sessionId, updatedAt: new Date().toISOString() })
        .where(eq(tasks.id, id));
    });

    const prompt = body.message ?? task.description ?? task.title;

    await executor.start({
      taskId: id,
      workingDirectory: task.worktreePath,
      prompt,
      sessionId: task.sessionId ?? undefined,
    });

    activeExecutors.set(id, executor);

    // Update status to InProgress if it was InReview
    if (task.status === "InReview") {
      await db
        .update(tasks)
        .set({
          status: "InProgress",
          updatedAt: now,
        })
        .where(eq(tasks.id, id));

      // Broadcast task status changed event
      broadcastTaskEvent(task.repositoryId, {
        type: "task-status-changed",
        taskId: id,
        oldStatus: "InReview",
        newStatus: "InProgress",
        isExecuting: true,
        updatedAt: now,
      });
    }

    const updatedTask = await db.select().from(tasks).where(eq(tasks.id, id));
    return c.json(withExecutingStatus(updatedTask[0]));
  } catch (error) {
    return internalError(c, `Failed to resume task: ${error}`);
  }
});

// POST /v1/tasks/:id/finish - Delete worktree and branch, mark as Done
taskById.post("/:id/finish", async (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  const task = taskResult[0];

  if (task.status !== "InReview") {
    return invalidStateTransition(c, task.status, ["InReview"], "finish");
  }

  // Get repository info
  const repoResult = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, task.repositoryId));

  if (repoResult.length === 0) {
    return notFound(c, "Repository");
  }

  const repo = repoResult[0];

  try {
    // Delete worktree if exists
    if (task.worktreePath) {
      await deleteWorktree(repo.path, task.worktreePath, true);
    }

    // Delete branch
    await deleteBranch(repo.path, task.branchName, true);

    // Update task status
    await db
      .update(tasks)
      .set({
        status: "Done",
        worktreePath: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(tasks.id, id));

    // Broadcast task status changed event
    broadcastTaskEvent(task.repositoryId, {
      type: "task-status-changed",
      taskId: id,
      oldStatus: "InReview",
      newStatus: "Done",
      isExecuting: false,
      updatedAt: now,
    });

    const updatedTask = await db.select().from(tasks).where(eq(tasks.id, id));
    return c.json(withExecutingStatus(updatedTask[0]));
  } catch (error) {
    return internalError(c, `Failed to finish task: ${error}`);
  }
});

// POST /v1/tasks/:id/recreate - Create new task from existing one
taskById.post("/:id/recreate", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  const task = taskResult[0];
  const newId = crypto.randomUUID();

  const newTask = {
    id: newId,
    repositoryId: task.repositoryId,
    title: body.title ?? task.title,
    description: body.description ?? task.description,
    status: "TODO" as const,
    executor: body.executor ?? task.executor,
    branchName: body.branchName ?? `${task.branchName}-retry`,
    baseBranch: body.baseBranch ?? task.baseBranch,
    worktreePath: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };

  await db.insert(tasks).values(newTask);

  // Broadcast task created event
  broadcastTaskEvent(task.repositoryId, {
    type: "task-created",
    task: withExecutingStatus(newTask),
    createdAt: now,
  });

  return c.json(withExecutingStatus(newTask), 201);
});

// Initialize startExecutorWithMessage function
startExecutorWithMessage = async (
  taskId: string,
  message: string,
): Promise<void> => {
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    throw new Error("Task not found");
  }

  const task = taskResult[0];

  if (!task.worktreePath) {
    throw new Error("Task has no worktree");
  }

  // Check if the executor/agent is enabled
  const isEnabled = await isExecutorEnabled(task.executor);
  if (!isEnabled) {
    throw new Error(`Agent "${task.executor}" is disabled in settings`);
  }

  // Create and start executor
  const executor = createExecutor(task.executor);

  executor.onOutput(async (output) => {
    const log = {
      id: crypto.randomUUID(),
      taskId,
      content: output.content,
      logType: output.logType,
      createdAt: new Date().toISOString(),
    };
    await db.insert(executionLogs).values(log);
    broadcastLog(log);
  });

  executor.onExit(() => {
    handleExecutorExit(taskId);
  });

  executor.onSessionId(async (sessionId) => {
    console.log(
      `[startExecutorWithMessage] Saving session ID ${sessionId} for task ${taskId}`,
    );
    await db
      .update(tasks)
      .set({ sessionId, updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, taskId));
  });

  await executor.start({
    taskId,
    workingDirectory: task.worktreePath,
    prompt: message,
    sessionId: task.sessionId ?? undefined,
  });

  activeExecutors.set(taskId, executor);
};

// GET /v1/tasks/:id/messages - Get message queue for a task
taskById.get("/:id/messages", async (c) => {
  const id = c.req.param("id");

  // Check if task exists
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  // Get messages ordered by createdAt ascending (oldest first)
  const messages = await db
    .select()
    .from(taskMessages)
    .where(eq(taskMessages.taskId, id))
    .orderBy(asc(taskMessages.createdAt));

  return c.json(messages);
});

// POST /v1/tasks/:id/messages - Queue a new message for a task
taskById.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const now = new Date().toISOString();

  // Validate content
  if (
    !body.content ||
    typeof body.content !== "string" ||
    body.content.trim() === ""
  ) {
    return badRequest(c, "Message content is required");
  }

  // Check if task exists
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  const task = taskResult[0];

  // Only allow queueing messages for InProgress or InReview tasks
  if (task.status !== "InProgress" && task.status !== "InReview") {
    return badRequest(
      c,
      "Messages can only be queued for tasks that are InProgress or InReview",
    );
  }

  const messageId = crypto.randomUUID();
  const newMessage = {
    id: messageId,
    taskId: id,
    content: body.content.trim(),
    status: "pending" as const,
    createdAt: now,
    deliveredAt: null,
  };

  await db.insert(taskMessages).values(newMessage);

  // Broadcast message queued event
  broadcastMessageEvent(id, {
    type: "message-queued",
    taskId: id,
    message: newMessage,
  });

  // If the executor is not currently running (InReview state), start it with the message
  if (!activeExecutors.has(id) && task.status === "InReview") {
    try {
      // Mark message as delivered
      await db
        .update(taskMessages)
        .set({
          status: "delivered",
          deliveredAt: now,
        })
        .where(eq(taskMessages.id, messageId));

      // Update task status to InProgress
      await db
        .update(tasks)
        .set({
          status: "InProgress",
          updatedAt: now,
        })
        .where(eq(tasks.id, id));

      // Broadcast message delivered event
      broadcastMessageEvent(id, {
        type: "message-delivered",
        taskId: id,
        messageId,
        deliveredAt: now,
      });

      // Broadcast task status changed event
      broadcastTaskEvent(task.repositoryId, {
        type: "task-status-changed",
        taskId: id,
        oldStatus: "InReview",
        newStatus: "InProgress",
        isExecuting: true,
        updatedAt: now,
      });

      // Start the executor
      await startExecutorWithMessage(id, body.content.trim());

      // Return the updated message
      const updatedMessage = await db
        .select()
        .from(taskMessages)
        .where(eq(taskMessages.id, messageId));

      return c.json(updatedMessage[0], 201);
    } catch (error) {
      console.error(`Failed to start executor with message: ${error}`);
      // Mark message as failed
      await db
        .update(taskMessages)
        .set({ status: "failed" })
        .where(eq(taskMessages.id, messageId));

      return internalError(
        c,
        `Failed to start executor with message: ${error}`,
      );
    }
  }

  return c.json(newMessage, 201);
});

// DELETE /v1/tasks/:id/messages/:messageId - Delete a pending message
taskById.delete("/:id/messages/:messageId", async (c) => {
  const id = c.req.param("id");
  const messageId = c.req.param("messageId");

  // Check if task exists
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  // Check if message exists
  const messageResult = await db
    .select()
    .from(taskMessages)
    .where(eq(taskMessages.id, messageId));

  if (messageResult.length === 0) {
    return notFound(c, "Message");
  }

  const message = messageResult[0];

  // Only allow deleting pending messages
  if (message.status !== "pending") {
    return badRequest(c, "Only pending messages can be deleted");
  }

  // Verify the message belongs to this task
  if (message.taskId !== id) {
    return notFound(c, "Message");
  }

  await db.delete(taskMessages).where(eq(taskMessages.id, messageId));

  return c.json({ message: "Message deleted" });
});

// GET /v1/tasks/:id/messages/stream - Stream message events via SSE
taskById.get("/:id/messages/stream", async (c) => {
  const id = c.req.param("id");

  // Check if task exists
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  return streamSSE(c, async (stream) => {
    let eventId = 0;

    const unsubscribe = subscribeToMessages(id, (event) => {
      stream.writeSSE({
        data: JSON.stringify(event),
        event: event.type,
        id: String(eventId++),
      });
    });

    // Send initial connection event
    await stream.writeSSE({
      data: JSON.stringify({ taskId: id, status: "connected" }),
      event: "connected",
      id: String(eventId++),
    });

    // Keep connection alive with periodic heartbeats
    const heartbeat = setInterval(() => {
      stream.writeSSE({
        data: "",
        event: "heartbeat",
        id: String(eventId++),
      });
    }, 30000);

    // Clean up on disconnect
    stream.onAbort(() => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    // Keep the stream open
    await new Promise(() => {});
  });
});

// GET /v1/tasks/:id/messages/pending/count - Get count of pending messages
taskById.get("/:id/messages/pending/count", async (c) => {
  const id = c.req.param("id");

  // Check if task exists
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  // Get pending message count
  const messages = await db
    .select()
    .from(taskMessages)
    .where(eq(taskMessages.taskId, id));

  const pendingCount = messages.filter((m) => m.status === "pending").length;

  return c.json({ count: pendingCount });
});
