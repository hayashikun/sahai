import { existsSync } from "node:fs";
import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { db } from "../db/client";
import { executionLogs, repositories, tasks } from "../db/schema";
import {
  badRequest,
  internalError,
  invalidStateTransition,
  notFound,
} from "../lib/errors";
import { openInFileExplorer, openInTerminal } from "../lib/shell";
import {
  createEventBus,
  createSimpleSSEStream,
  createSSEStream,
} from "../lib/sse";
import { getDiff } from "../services/git";
import {
  createTask,
  deleteMessage,
  deleteTask,
  finishTask,
  getAllTasks,
  getMessages,
  getPendingMessageCount,
  getTaskById,
  getTasksByRepositoryId,
  type LogEvent,
  type MessageEvent,
  pauseTask,
  queueMessage,
  resumeTask,
  startTask,
  type TaskEvent,
  type TaskEventHandler,
  updateTask,
} from "../services/task";

// ============================================================================
// SSE Event Buses
// ============================================================================

const logEventBus = createEventBus<LogEvent>();
const taskEventBus = createEventBus<TaskEvent>();
const messageEventBus = createEventBus<MessageEvent>();

function broadcastLog(log: LogEvent): void {
  logEventBus.broadcast(log.taskId, log);
}

function broadcastTaskEvent(repositoryId: string, event: TaskEvent): void {
  taskEventBus.broadcast(repositoryId, event);
}

function broadcastMessageEvent(taskId: string, event: MessageEvent): void {
  messageEventBus.broadcast(taskId, event);
}

const eventHandler: TaskEventHandler = {
  onLog: broadcastLog,
  onTaskEvent: broadcastTaskEvent,
  onMessageEvent: broadcastMessageEvent,
};

// ============================================================================
// Helper: Convert service error to HTTP response
// ============================================================================

function handleServiceError(
  c: Context,
  error: NonNullable<Awaited<ReturnType<typeof getTaskById>>["error"]>,
) {
  switch (error.type) {
    case "NOT_FOUND":
      return notFound(c, error.message.replace(" not found", ""));
    case "BAD_REQUEST":
      return badRequest(c, error.message);
    case "INVALID_STATE_TRANSITION":
      return invalidStateTransition(
        c,
        error.message.split(" ")[4] ?? "unknown",
        error.allowedStates ?? [],
        error.operation ?? "unknown",
      );
    case "INTERNAL_ERROR":
      return internalError(c, error.message);
  }
}

// ============================================================================
// Routes for /v1/repositories/:repositoryId/tasks
// ============================================================================

export const repositoryTasks = new Hono();

// GET /v1/repositories/:repositoryId/tasks - List tasks for a repository
repositoryTasks.get("/:repositoryId/tasks", async (c) => {
  const repositoryId = c.req.param("repositoryId");
  const result = await getTasksByRepositoryId(repositoryId);

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data);
});

// POST /v1/repositories/:repositoryId/tasks - Create a new task
repositoryTasks.post("/:repositoryId/tasks", async (c) => {
  const repositoryId = c.req.param("repositoryId");
  const body = await c.req.json();

  const result = await createTask(
    {
      repositoryId,
      epicId: body.epicId,
      title: body.title,
      description: body.description,
      executor: body.executor,
      branchName: body.branchName,
      baseBranch: body.baseBranch,
    },
    eventHandler,
  );

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data, 201);
});

// GET /v1/repositories/:repositoryId/tasks/stream - Stream task events via SSE
repositoryTasks.get("/:repositoryId/tasks/stream", async (c) => {
  const repositoryId = c.req.param("repositoryId");

  const repository = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId));

  if (repository.length === 0) {
    return notFound(c, "Repository");
  }

  return createSSEStream<TaskEvent>(c, {
    subscriptionKey: repositoryId,
    subscribe: taskEventBus.subscribe,
    getEventType: (event) => event.type,
    connectedData: { repositoryId },
  });
});

// ============================================================================
// Routes for /v1/tasks
// ============================================================================

export const taskById = new Hono();

// GET /v1/tasks - Get all tasks across all repositories
taskById.get("/", async (c) => {
  const result = await getAllTasks();

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data);
});

// GET /v1/tasks/:id - Get a task by ID
taskById.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await getTaskById(id);

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data);
});

// PUT /v1/tasks/:id - Update a task
taskById.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const result = await updateTask(
    id,
    {
      title: body.title,
      description: body.description,
      status: body.status,
    },
    eventHandler,
  );

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data);
});

// DELETE /v1/tasks/:id - Delete a task
taskById.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await deleteTask(id, eventHandler);

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data);
});

// GET /v1/tasks/:id/logs - Get execution logs for a task
taskById.get("/:id/logs", async (c) => {
  const id = c.req.param("id");

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

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

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  const task = taskResult[0];

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

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  return createSimpleSSEStream<LogEvent>(c, {
    subscriptionKey: id,
    subscribe: logEventBus.subscribe,
    eventType: "log",
    connectedData: { taskId: id },
  });
});

// POST /v1/tasks/:id/start - Create worktree, start executor
taskById.post("/:id/start", async (c) => {
  const id = c.req.param("id");
  const result = await startTask(id, eventHandler);

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data);
});

// POST /v1/tasks/:id/pause - Stop executor
taskById.post("/:id/pause", async (c) => {
  const id = c.req.param("id");
  const result = await pauseTask(id);

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data);
});

// POST /v1/tasks/:id/resume - Restart executor
taskById.post("/:id/resume", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const result = await resumeTask(id, body.message, eventHandler);

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data);
});

// POST /v1/tasks/:id/finish - Delete worktree and branch, mark as Done
taskById.post("/:id/finish", async (c) => {
  const id = c.req.param("id");
  const result = await finishTask(id, eventHandler);

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data);
});

// GET /v1/tasks/:id/messages - Get message queue for a task
taskById.get("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const result = await getMessages(id);

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data);
});

// POST /v1/tasks/:id/messages - Queue a new message for a task
taskById.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const result = await queueMessage(id, body.content, eventHandler);

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data, 201);
});

// DELETE /v1/tasks/:id/messages/:messageId - Delete a pending message
taskById.delete("/:id/messages/:messageId", async (c) => {
  const id = c.req.param("id");
  const messageId = c.req.param("messageId");

  const result = await deleteMessage(id, messageId);

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data);
});

// GET /v1/tasks/:id/messages/stream - Stream message events via SSE
taskById.get("/:id/messages/stream", async (c) => {
  const id = c.req.param("id");

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return notFound(c, "Task");
  }

  return createSSEStream<MessageEvent>(c, {
    subscriptionKey: id,
    subscribe: messageEventBus.subscribe,
    getEventType: (event) => event.type,
    connectedData: { taskId: id },
  });
});

// GET /v1/tasks/:id/messages/pending/count - Get count of pending messages
taskById.get("/:id/messages/pending/count", async (c) => {
  const id = c.req.param("id");
  const result = await getPendingMessageCount(id);

  if (result.error) {
    return handleServiceError(c, result.error);
  }

  return c.json(result.data);
});
