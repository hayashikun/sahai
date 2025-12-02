import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "../db/client";
import { executionLogs, repositories, tasks } from "../db/schema";
import { ClaudeCodeExecutor } from "../executors/claude";
import { CodexExecutor } from "../executors/codex";
import { GeminiExecutor } from "../executors/gemini";
import type { Executor } from "../executors/interface";
import {
  badRequest,
  internalError,
  invalidStateTransition,
  notFound,
} from "../lib/errors";
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

// Handle executor completion: update task status to InReview
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

  // Only transition to InReview if currently InProgress
  if (task.status === "InProgress") {
    console.log(`[handleExecutorExit] Transitioning to InReview`);
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
    console.log(`[handleExecutorExit] Transition complete`);
  } else {
    console.log(
      `[handleExecutorExit] Not transitioning - status is not InProgress`,
    );
  }
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

  if (platform === "darwin") {
    const terminalApp = process.env.SAHAI_TERMINAL_APP || "Terminal";
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

  const customCommand = process.env.SAHAI_TERMINAL_COMMAND;
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
      "No supported terminal launcher found. Set SAHAI_TERMINAL_COMMAND to override.",
  );
}

// SSE subscribers per task
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
  return c.json(withExecutingStatus(newTask), 201);
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

  return c.json(withExecutingStatus({ ...existing[0], ...updated }));
});

// DELETE /v1/tasks/:id - Delete a task
taskById.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db.select().from(tasks).where(eq(tasks.id, id));

  if (existing.length === 0) {
    return notFound(c, "Task");
  }

  await db.delete(tasks).where(eq(tasks.id, id));

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
  return c.json(withExecutingStatus(newTask), 201);
});
