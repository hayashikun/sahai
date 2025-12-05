import { tmpdir } from "node:os";
import { asc, eq } from "drizzle-orm";
import { isExecutorEnabled } from "../config/agent";
import { db } from "../db/client";
import { executionLogs, repositories, taskMessages, tasks } from "../db/schema";
import { ClaudeCodeExecutor } from "../executors/claude";
import { CodexExecutor } from "../executors/codex";
import { CopilotExecutor } from "../executors/copilot";
import { GeminiExecutor } from "../executors/gemini";
import type { Executor } from "../executors/interface";
import { playSuccessSound } from "../lib/sound";
import { createBranch, deleteBranch } from "./git";
import { copyFilesToWorktree, runLifecycleScript } from "./lifecycle";
import { createWorktree, deleteWorktree } from "./worktree";

// ============================================================================
// Types
// ============================================================================

export type TaskStatus = "TODO" | "InProgress" | "InReview" | "Done";
export type ExecutorType = "ClaudeCode" | "Codex" | "Copilot" | "Gemini";

export interface LogEvent {
  id: string;
  taskId: string;
  content: string;
  logType: "stdout" | "stderr" | "system";
  createdAt: string;
}

export interface TaskStatusChangeEvent {
  type: "task-status-changed";
  taskId: string;
  oldStatus: string;
  newStatus: string;
  isExecuting: boolean;
  updatedAt: string;
}

export interface TaskCreatedEvent {
  type: "task-created";
  task: TaskWithExecutingStatus;
  createdAt: string;
}

export interface TaskDeletedEvent {
  type: "task-deleted";
  taskId: string;
  deletedAt: string;
}

export type TaskEvent =
  | TaskStatusChangeEvent
  | TaskCreatedEvent
  | TaskDeletedEvent;

export interface MessageQueuedEvent {
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

export interface MessageDeliveredEvent {
  type: "message-delivered";
  taskId: string;
  messageId: string;
  deliveredAt: string;
}

export type MessageEvent = MessageQueuedEvent | MessageDeliveredEvent;

export interface TaskEventHandler {
  onLog?: (log: LogEvent) => void;
  onTaskEvent?: (repositoryId: string, event: TaskEvent) => void;
  onMessageEvent?: (taskId: string, event: MessageEvent) => void;
}

export interface TaskCreateInput {
  repositoryId: string;
  epicId?: string | null;
  title: string;
  description?: string | null;
  executor: ExecutorType;
  branchName: string;
  baseBranch?: string;
}

export interface Task {
  id: string;
  repositoryId: string;
  epicId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  executor: ExecutorType;
  branchName: string;
  baseBranch: string;
  worktreePath: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export type TaskWithExecutingStatus = Task & { isExecuting: boolean };

export interface ServiceResult<T> {
  data?: T;
  error?: {
    type:
      | "NOT_FOUND"
      | "BAD_REQUEST"
      | "INVALID_STATE_TRANSITION"
      | "INTERNAL_ERROR";
    message: string;
    allowedStates?: string[];
    operation?: string;
  };
}

// ============================================================================
// Active Executors Management
// ============================================================================

const activeExecutors = new Map<string, Executor>();

export function getActiveExecutors(): Map<string, Executor> {
  return activeExecutors;
}

export function isExecutorActive(taskId: string): boolean {
  return activeExecutors.has(taskId);
}

export function getExecutor(taskId: string): Executor | undefined {
  return activeExecutors.get(taskId);
}

export function setExecutor(taskId: string, executor: Executor): void {
  activeExecutors.set(taskId, executor);
}

export function removeExecutor(taskId: string): void {
  activeExecutors.delete(taskId);
}

export function createExecutor(type: string): Executor {
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

export function withExecutingStatus<T extends { id: string }>(
  task: T,
): T & { isExecuting: boolean } {
  return {
    ...task,
    isExecuting: activeExecutors.has(task.id),
  };
}

// ============================================================================
// Internal Helper: Start executor with message
// ============================================================================

async function startExecutorWithMessageInternal(
  taskId: string,
  message: string,
  eventHandler?: TaskEventHandler,
): Promise<void> {
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    throw new Error("Task not found");
  }

  const task = taskResult[0];

  if (!task.worktreePath) {
    throw new Error("Task has no worktree");
  }

  const isEnabled = await isExecutorEnabled(task.executor);
  if (!isEnabled) {
    throw new Error(`Agent "${task.executor}" is disabled in settings`);
  }

  const executor = createExecutor(task.executor);

  executor.onOutput(async (output) => {
    const log: LogEvent = {
      id: crypto.randomUUID(),
      taskId,
      content: output.content,
      logType: output.logType,
      createdAt: new Date().toISOString(),
    };
    await db.insert(executionLogs).values(log);
    eventHandler?.onLog?.(log);
  });

  executor.onExit(() => {
    handleExecutorExitInternal(taskId, eventHandler);
  });

  executor.onSessionId(async (sessionId) => {
    console.log(
      `[task-service] Saving session ID ${sessionId} for task ${taskId}`,
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
}

// ============================================================================
// Internal Helper: Transition to InReview
// ============================================================================

async function transitionToInReviewInternal(
  taskId: string,
  repositoryId: string,
  now: string,
  eventHandler?: TaskEventHandler,
): Promise<void> {
  console.log(`[task-service] Transitioning task ${taskId} to InReview`);

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const task = taskResult[0];

  const repoResult = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId));

  if (repoResult.length > 0) {
    const repo = repoResult[0];
    if (repo.completeScript && task?.worktreePath) {
      console.log(`[task-service] Running complete script for task ${taskId}`);
      runLifecycleScript(repo.completeScript, task.worktreePath)
        .then(() =>
          console.log(
            `[task-service] Complete script completed for task ${taskId}`,
          ),
        )
        .catch((e) =>
          console.error(
            `[task-service] Complete script failed for task ${taskId}:`,
            e instanceof Error ? e.message : e,
          ),
        );
    }
  }

  await db
    .update(tasks)
    .set({
      status: "InReview",
      updatedAt: now,
    })
    .where(eq(tasks.id, taskId));

  const log: LogEvent = {
    id: crypto.randomUUID(),
    taskId,
    content: "[system] Executor completed. Task moved to InReview.",
    logType: "system",
    createdAt: now,
  };
  await db.insert(executionLogs).values(log);
  eventHandler?.onLog?.(log);

  eventHandler?.onTaskEvent?.(repositoryId, {
    type: "task-status-changed",
    taskId,
    oldStatus: "InProgress",
    newStatus: "InReview",
    isExecuting: false,
    updatedAt: now,
  });

  playSuccessSound();
  console.log(`[task-service] Transition to InReview complete`);
}

// ============================================================================
// Internal Helper: Handle executor exit
// ============================================================================

async function handleExecutorExitInternal(
  taskId: string,
  eventHandler?: TaskEventHandler,
): Promise<void> {
  console.log(`[task-service] handleExecutorExit called for task ${taskId}`);
  const now = new Date().toISOString();

  removeExecutor(taskId);
  console.log(`[task-service] Removed task from activeExecutors`);

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    console.log(`[task-service] Task not found`);
    return;
  }

  const task = taskResult[0];
  console.log(`[task-service] Task status: ${task.status}`);

  if (task.status !== "InProgress") {
    console.log(`[task-service] Not processing - status is not InProgress`);
    return;
  }

  const pendingMessages = await db
    .select()
    .from(taskMessages)
    .where(eq(taskMessages.taskId, taskId))
    .orderBy(asc(taskMessages.createdAt));

  const nextMessage = pendingMessages.find((m) => m.status === "pending");

  if (nextMessage) {
    console.log(
      `[task-service] Found pending message ${nextMessage.id}, processing...`,
    );

    await db
      .update(taskMessages)
      .set({
        status: "delivered",
        deliveredAt: now,
      })
      .where(eq(taskMessages.id, nextMessage.id));

    eventHandler?.onMessageEvent?.(taskId, {
      type: "message-delivered",
      taskId,
      messageId: nextMessage.id,
      deliveredAt: now,
    });

    const log: LogEvent = {
      id: crypto.randomUUID(),
      taskId,
      content: `[system] Processing queued message: ${nextMessage.content.substring(0, 100)}${nextMessage.content.length > 100 ? "..." : ""}`,
      logType: "system",
      createdAt: now,
    };
    await db.insert(executionLogs).values(log);
    eventHandler?.onLog?.(log);

    try {
      await startExecutorWithMessageInternal(
        taskId,
        nextMessage.content,
        eventHandler,
      );
    } catch (error) {
      console.error(
        `[task-service] Failed to start executor with message: ${error}`,
      );
      await db
        .update(taskMessages)
        .set({ status: "failed" })
        .where(eq(taskMessages.id, nextMessage.id));

      await transitionToInReviewInternal(
        taskId,
        task.repositoryId,
        now,
        eventHandler,
      );
    }
  } else {
    await transitionToInReviewInternal(
      taskId,
      task.repositoryId,
      now,
      eventHandler,
    );
  }
}

// ============================================================================
// Task Service Functions
// ============================================================================

/**
 * Create a new task
 */
export async function createTask(
  input: TaskCreateInput,
  eventHandler?: TaskEventHandler,
): Promise<ServiceResult<TaskWithExecutingStatus>> {
  const repoResult = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, input.repositoryId));

  if (repoResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Repository not found" } };
  }

  const repo = repoResult[0];
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const newTask: Task = {
    id,
    repositoryId: input.repositoryId,
    epicId: input.epicId ?? null,
    title: input.title,
    description: input.description ?? null,
    status: "TODO",
    executor: input.executor,
    branchName: input.branchName,
    baseBranch: input.baseBranch ?? repo.defaultBranch,
    worktreePath: null,
    sessionId: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };

  await db.insert(tasks).values(newTask);

  const taskWithStatus = withExecutingStatus(newTask);

  eventHandler?.onTaskEvent?.(input.repositoryId, {
    type: "task-created",
    task: taskWithStatus,
    createdAt: now,
  });

  return { data: taskWithStatus };
}

/**
 * Get a task by ID
 */
export async function getTaskById(
  taskId: string,
): Promise<ServiceResult<TaskWithExecutingStatus>> {
  const result = await db.select().from(tasks).where(eq(tasks.id, taskId));

  if (result.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Task not found" } };
  }

  return { data: withExecutingStatus(result[0]) as TaskWithExecutingStatus };
}

/**
 * Get tasks by repository ID
 */
export async function getTasksByRepositoryId(
  repositoryId: string,
): Promise<ServiceResult<TaskWithExecutingStatus[]>> {
  const repoResult = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId));

  if (repoResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Repository not found" } };
  }

  const result = await db
    .select()
    .from(tasks)
    .where(eq(tasks.repositoryId, repositoryId));

  return { data: result.map(withExecutingStatus) as TaskWithExecutingStatus[] };
}

/**
 * Update a task
 */
export async function updateTask(
  taskId: string,
  updates: {
    title?: string;
    description?: string | null;
    status?: TaskStatus;
  },
  eventHandler?: TaskEventHandler,
): Promise<ServiceResult<TaskWithExecutingStatus>> {
  const existing = await db.select().from(tasks).where(eq(tasks.id, taskId));

  if (existing.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Task not found" } };
  }

  const now = new Date().toISOString();
  const updated: Record<string, unknown> = {
    title: updates.title ?? existing[0].title,
    description: updates.description ?? existing[0].description,
    status: updates.status ?? existing[0].status,
    updatedAt: now,
  };

  if (updates.status === "InProgress" && !existing[0].startedAt) {
    updated.startedAt = now;
  }

  if (updates.status === "Done" && !existing[0].completedAt) {
    updated.completedAt = now;
  }

  await db.update(tasks).set(updated).where(eq(tasks.id, taskId));

  const oldStatus = existing[0].status;
  const newStatus = updated.status as string;
  if (oldStatus !== newStatus) {
    eventHandler?.onTaskEvent?.(existing[0].repositoryId, {
      type: "task-status-changed",
      taskId,
      oldStatus,
      newStatus,
      isExecuting: isExecutorActive(taskId),
      updatedAt: now,
    });
  }

  return {
    data: withExecutingStatus({
      ...existing[0],
      ...updated,
    }) as TaskWithExecutingStatus,
  };
}

/**
 * Delete a task
 */
export async function deleteTask(
  taskId: string,
  eventHandler?: TaskEventHandler,
): Promise<ServiceResult<{ message: string }>> {
  const existing = await db.select().from(tasks).where(eq(tasks.id, taskId));

  if (existing.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Task not found" } };
  }

  const repositoryId = existing[0].repositoryId;
  await db.delete(tasks).where(eq(tasks.id, taskId));

  eventHandler?.onTaskEvent?.(repositoryId, {
    type: "task-deleted",
    taskId,
    deletedAt: new Date().toISOString(),
  });

  return { data: { message: "Task deleted" } };
}

/**
 * Start a task (create worktree, start executor)
 */
export async function startTask(
  taskId: string,
  eventHandler?: TaskEventHandler,
): Promise<ServiceResult<TaskWithExecutingStatus>> {
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Task not found" } };
  }

  const task = taskResult[0];

  if (task.status !== "TODO") {
    return {
      error: {
        type: "INVALID_STATE_TRANSITION",
        message: `Cannot start task in ${task.status} status`,
        allowedStates: ["TODO"],
        operation: "start",
      },
    };
  }

  const isEnabled = await isExecutorEnabled(task.executor);
  if (!isEnabled) {
    return {
      error: {
        type: "BAD_REQUEST",
        message: `Agent "${task.executor}" is disabled in settings`,
      },
    };
  }

  const repoResult = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, task.repositoryId));

  if (repoResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Repository not found" } };
  }

  const repo = repoResult[0];
  const worktreePath = `${tmpdir()}/sahai-worktrees/${task.id}`;

  try {
    await createBranch(repo.path, task.branchName, task.baseBranch);
    await createWorktree(repo.path, worktreePath, task.branchName);

    if (repo.copyFiles) {
      console.log(
        `[task-service] Copying files to worktree for task ${taskId}`,
      );
      const { copied, errors } = await copyFilesToWorktree(
        repo.copyFiles,
        repo.path,
        worktreePath,
      );
      if (copied.length > 0) {
        console.log(`[task-service] Copied files: ${copied.join(", ")}`);
      }
      if (errors.length > 0) {
        console.warn(`[task-service] Copy errors: ${errors.join("; ")}`);
      }
    }

    if (repo.setupScript) {
      console.log(
        `[task-service] Running setup script for task ${taskId} (async)`,
      );
      runLifecycleScript(repo.setupScript, worktreePath)
        .then(() =>
          console.log(
            `[task-service] Setup script completed for task ${taskId}`,
          ),
        )
        .catch((e) =>
          console.error(
            `[task-service] Setup script failed for task ${taskId}:`,
            e instanceof Error ? e.message : e,
          ),
        );
    }

    if (repo.startScript) {
      console.log(
        `[task-service] Running start script for task ${taskId} (async)`,
      );
      runLifecycleScript(repo.startScript, worktreePath)
        .then(() =>
          console.log(
            `[task-service] Start script completed for task ${taskId}`,
          ),
        )
        .catch((e) =>
          console.error(
            `[task-service] Start script failed for task ${taskId}:`,
            e instanceof Error ? e.message : e,
          ),
        );
    }

    await db
      .update(tasks)
      .set({
        status: "InProgress",
        worktreePath,
        startedAt: now,
        updatedAt: now,
      })
      .where(eq(tasks.id, taskId));

    let executor: Executor;
    try {
      executor = createExecutor(task.executor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: { type: "BAD_REQUEST", message } };
    }

    executor.onOutput(async (output) => {
      const log: LogEvent = {
        id: crypto.randomUUID(),
        taskId,
        content: output.content,
        logType: output.logType,
        createdAt: new Date().toISOString(),
      };
      await db.insert(executionLogs).values(log);
      eventHandler?.onLog?.(log);
    });

    executor.onExit(() => {
      handleExecutorExitInternal(taskId, eventHandler);
    });

    executor.onSessionId(async (sessionId) => {
      console.log(
        `[task-service] Saving session ID ${sessionId} for task ${taskId}`,
      );
      await db
        .update(tasks)
        .set({ sessionId, updatedAt: new Date().toISOString() })
        .where(eq(tasks.id, taskId));
    });

    await executor.start({
      taskId,
      workingDirectory: worktreePath,
      prompt: task.description ?? task.title,
    });

    activeExecutors.set(taskId, executor);

    eventHandler?.onTaskEvent?.(task.repositoryId, {
      type: "task-status-changed",
      taskId,
      oldStatus: "TODO",
      newStatus: "InProgress",
      isExecuting: true,
      updatedAt: now,
    });

    const updatedTask = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));
    return {
      data: withExecutingStatus(updatedTask[0]) as TaskWithExecutingStatus,
    };
  } catch (error) {
    return {
      error: {
        type: "INTERNAL_ERROR",
        message: `Failed to start task: ${error}`,
      },
    };
  }
}

/**
 * Pause a task (stop executor)
 */
export async function pauseTask(
  taskId: string,
): Promise<ServiceResult<TaskWithExecutingStatus>> {
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Task not found" } };
  }

  const task = taskResult[0];

  if (task.status !== "InProgress") {
    return {
      error: {
        type: "INVALID_STATE_TRANSITION",
        message: `Cannot pause task in ${task.status} status`,
        allowedStates: ["InProgress"],
        operation: "pause",
      },
    };
  }

  const executor = activeExecutors.get(taskId);
  if (executor) {
    await executor.stop();
    activeExecutors.delete(taskId);
  }

  await db.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, taskId));

  const updatedTask = await db.select().from(tasks).where(eq(tasks.id, taskId));
  return {
    data: withExecutingStatus(updatedTask[0]) as TaskWithExecutingStatus,
  };
}

/**
 * Resume a task (restart executor)
 */
export async function resumeTask(
  taskId: string,
  message?: string,
  eventHandler?: TaskEventHandler,
): Promise<ServiceResult<TaskWithExecutingStatus>> {
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Task not found" } };
  }

  const task = taskResult[0];

  if (task.status !== "InProgress" && task.status !== "InReview") {
    return {
      error: {
        type: "INVALID_STATE_TRANSITION",
        message: `Cannot resume task in ${task.status} status`,
        allowedStates: ["InProgress", "InReview"],
        operation: "resume",
      },
    };
  }

  if (!task.worktreePath) {
    return { error: { type: "BAD_REQUEST", message: "Task has no worktree" } };
  }

  const isEnabled = await isExecutorEnabled(task.executor);
  if (!isEnabled) {
    return {
      error: {
        type: "BAD_REQUEST",
        message: `Agent "${task.executor}" is disabled in settings`,
      },
    };
  }

  const existingExecutor = activeExecutors.get(taskId);
  if (existingExecutor) {
    await existingExecutor.stop();
    activeExecutors.delete(taskId);
  }

  const repoResult = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, task.repositoryId));

  if (repoResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Repository not found" } };
  }

  const repo = repoResult[0];

  try {
    if (repo.startScript && task.worktreePath) {
      console.log(
        `[task-service] Running start script for task ${taskId} (resume, async)`,
      );
      runLifecycleScript(repo.startScript, task.worktreePath)
        .then(() =>
          console.log(
            `[task-service] Start script completed for task ${taskId}`,
          ),
        )
        .catch((e) =>
          console.error(
            `[task-service] Start script failed for task ${taskId}:`,
            e instanceof Error ? e.message : e,
          ),
        );
    }

    let executor: Executor;
    try {
      executor = createExecutor(task.executor);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      return { error: { type: "BAD_REQUEST", message: errMessage } };
    }

    executor.onOutput(async (output) => {
      const log: LogEvent = {
        id: crypto.randomUUID(),
        taskId,
        content: output.content,
        logType: output.logType,
        createdAt: new Date().toISOString(),
      };
      await db.insert(executionLogs).values(log);
      eventHandler?.onLog?.(log);
    });

    executor.onExit(() => {
      handleExecutorExitInternal(taskId, eventHandler);
    });

    executor.onSessionId(async (sessionId) => {
      console.log(
        `[task-service] Saving session ID ${sessionId} for task ${taskId}`,
      );
      await db
        .update(tasks)
        .set({ sessionId, updatedAt: new Date().toISOString() })
        .where(eq(tasks.id, taskId));
    });

    const prompt = message ?? task.description ?? task.title;

    await executor.start({
      taskId,
      workingDirectory: task.worktreePath,
      prompt,
      sessionId: task.sessionId ?? undefined,
    });

    activeExecutors.set(taskId, executor);

    if (task.status === "InReview") {
      await db
        .update(tasks)
        .set({
          status: "InProgress",
          updatedAt: now,
        })
        .where(eq(tasks.id, taskId));

      eventHandler?.onTaskEvent?.(task.repositoryId, {
        type: "task-status-changed",
        taskId,
        oldStatus: "InReview",
        newStatus: "InProgress",
        isExecuting: true,
        updatedAt: now,
      });
    }

    const updatedTask = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));
    return {
      data: withExecutingStatus(updatedTask[0]) as TaskWithExecutingStatus,
    };
  } catch (error) {
    return {
      error: {
        type: "INTERNAL_ERROR",
        message: `Failed to resume task: ${error}`,
      },
    };
  }
}

/**
 * Finish a task (delete worktree and branch, mark as Done)
 */
export async function finishTask(
  taskId: string,
  eventHandler?: TaskEventHandler,
): Promise<ServiceResult<TaskWithExecutingStatus>> {
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Task not found" } };
  }

  const task = taskResult[0];

  if (task.status !== "InReview") {
    return {
      error: {
        type: "INVALID_STATE_TRANSITION",
        message: `Cannot finish task in ${task.status} status`,
        allowedStates: ["InReview"],
        operation: "finish",
      },
    };
  }

  const repoResult = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, task.repositoryId));

  if (repoResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Repository not found" } };
  }

  const repo = repoResult[0];

  await db
    .update(tasks)
    .set({
      status: "Done",
      worktreePath: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(tasks.id, taskId));

  eventHandler?.onTaskEvent?.(task.repositoryId, {
    type: "task-status-changed",
    taskId,
    oldStatus: "InReview",
    newStatus: "Done",
    isExecuting: false,
    updatedAt: now,
  });

  const cleanupAsync = async () => {
    try {
      if (repo.cleanupScript && task.worktreePath) {
        console.log(
          `[task-service] Running cleanup script for task ${taskId} (async)`,
        );
        try {
          await runLifecycleScript(repo.cleanupScript, task.worktreePath);
          console.log(
            `[task-service] Cleanup script completed for task ${taskId}`,
          );
        } catch (e) {
          console.error(
            `[task-service] Cleanup script failed for task ${taskId}:`,
            e instanceof Error ? e.message : e,
          );
        }
      }

      if (task.worktreePath) {
        await deleteWorktree(repo.path, task.worktreePath, true);
        console.log(`[task-service] Worktree deleted for task ${taskId}`);
      }

      await deleteBranch(repo.path, task.branchName, true);
      console.log(`[task-service] Branch deleted for task ${taskId}`);
    } catch (error) {
      console.error(`[task-service] Cleanup failed for task ${taskId}:`, error);
    }
  };

  cleanupAsync();

  const updatedTask = await db.select().from(tasks).where(eq(tasks.id, taskId));
  return {
    data: withExecutingStatus(updatedTask[0]) as TaskWithExecutingStatus,
  };
}

/**
 * Queue a message for a task
 */
export async function queueMessage(
  taskId: string,
  content: string,
  eventHandler?: TaskEventHandler,
): Promise<
  ServiceResult<{
    id: string;
    taskId: string;
    content: string;
    status: string;
    createdAt: string;
    deliveredAt: string | null;
  }>
> {
  if (!content || typeof content !== "string" || content.trim() === "") {
    return {
      error: { type: "BAD_REQUEST", message: "Message content is required" },
    };
  }

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Task not found" } };
  }

  const task = taskResult[0];

  if (task.status !== "InProgress" && task.status !== "InReview") {
    return {
      error: {
        type: "BAD_REQUEST",
        message:
          "Messages can only be queued for tasks that are InProgress or InReview",
      },
    };
  }

  const now = new Date().toISOString();
  const messageId = crypto.randomUUID();
  const newMessage = {
    id: messageId,
    taskId,
    content: content.trim(),
    status: "pending" as const,
    createdAt: now,
    deliveredAt: null,
  };

  await db.insert(taskMessages).values(newMessage);

  eventHandler?.onMessageEvent?.(taskId, {
    type: "message-queued",
    taskId,
    message: newMessage,
  });

  if (!isExecutorActive(taskId) && task.status === "InReview") {
    try {
      await db
        .update(taskMessages)
        .set({
          status: "delivered",
          deliveredAt: now,
        })
        .where(eq(taskMessages.id, messageId));

      await db
        .update(tasks)
        .set({
          status: "InProgress",
          updatedAt: now,
        })
        .where(eq(tasks.id, taskId));

      eventHandler?.onMessageEvent?.(taskId, {
        type: "message-delivered",
        taskId,
        messageId,
        deliveredAt: now,
      });

      eventHandler?.onTaskEvent?.(task.repositoryId, {
        type: "task-status-changed",
        taskId,
        oldStatus: "InReview",
        newStatus: "InProgress",
        isExecuting: true,
        updatedAt: now,
      });

      await startExecutorWithMessageInternal(
        taskId,
        content.trim(),
        eventHandler,
      );

      const updatedMessage = await db
        .select()
        .from(taskMessages)
        .where(eq(taskMessages.id, messageId));

      return { data: updatedMessage[0] };
    } catch (error) {
      console.error(
        `[task-service] Failed to start executor with message: ${error}`,
      );
      await db
        .update(taskMessages)
        .set({ status: "failed" })
        .where(eq(taskMessages.id, messageId));

      return {
        error: {
          type: "INTERNAL_ERROR",
          message: `Failed to start executor with message: ${error}`,
        },
      };
    }
  }

  return { data: newMessage };
}

/**
 * Get messages for a task
 */
export async function getMessages(taskId: string): Promise<
  ServiceResult<
    Array<{
      id: string;
      taskId: string;
      content: string;
      status: string;
      createdAt: string;
      deliveredAt: string | null;
    }>
  >
> {
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Task not found" } };
  }

  const messages = await db
    .select()
    .from(taskMessages)
    .where(eq(taskMessages.taskId, taskId))
    .orderBy(asc(taskMessages.createdAt));

  return { data: messages };
}

/**
 * Delete a pending message
 */
export async function deleteMessage(
  taskId: string,
  messageId: string,
): Promise<ServiceResult<{ message: string }>> {
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Task not found" } };
  }

  const messageResult = await db
    .select()
    .from(taskMessages)
    .where(eq(taskMessages.id, messageId));

  if (messageResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Message not found" } };
  }

  const message = messageResult[0];

  if (message.status !== "pending") {
    return {
      error: {
        type: "BAD_REQUEST",
        message: "Only pending messages can be deleted",
      },
    };
  }

  if (message.taskId !== taskId) {
    return { error: { type: "NOT_FOUND", message: "Message not found" } };
  }

  await db.delete(taskMessages).where(eq(taskMessages.id, messageId));

  return { data: { message: "Message deleted" } };
}

/**
 * Get pending message count for a task
 */
export async function getPendingMessageCount(
  taskId: string,
): Promise<ServiceResult<{ count: number }>> {
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    return { error: { type: "NOT_FOUND", message: "Task not found" } };
  }

  const messages = await db
    .select()
    .from(taskMessages)
    .where(eq(taskMessages.taskId, taskId));

  const pendingCount = messages.filter((m) => m.status === "pending").length;

  return { data: { count: pendingCount } };
}

// ============================================================================
// Exported for routes/tasks.ts handleExecutorExit compatibility
// ============================================================================

let globalEventHandler: TaskEventHandler | undefined;

export function setGlobalEventHandler(handler: TaskEventHandler): void {
  globalEventHandler = handler;
}

export async function handleExecutorExit(taskId: string): Promise<void> {
  await handleExecutorExitInternal(taskId, globalEventHandler);
}
