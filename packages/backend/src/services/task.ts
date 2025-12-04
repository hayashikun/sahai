import { tmpdir } from "node:os";
import { eq } from "drizzle-orm";
import { isExecutorEnabled } from "../config/agent";
import { db } from "../db/client";
import { executionLogs, repositories, tasks } from "../db/schema";
import { ClaudeCodeExecutor } from "../executors/claude";
import { CodexExecutor } from "../executors/codex";
import { CopilotExecutor } from "../executors/copilot";
import { GeminiExecutor } from "../executors/gemini";
import type { Executor } from "../executors/interface";
import { createBranch } from "./git";
import { createWorktree } from "./worktree";

// In-memory store for active executors
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

// Add isExecuting field to task based on activeExecutors
export function withExecutingStatus<T extends { id: string }>(
  task: T,
): T & { isExecuting: boolean } {
  return {
    ...task,
    isExecuting: activeExecutors.has(task.id),
  };
}

export interface TaskEventHandler {
  onLog?: (log: {
    id: string;
    taskId: string;
    content: string;
    logType: string;
    createdAt: string;
  }) => void;
  onStatusChange?: (event: {
    taskId: string;
    repositoryId: string;
    oldStatus: string;
    newStatus: string;
    isExecuting: boolean;
    updatedAt: string;
  }) => void;
  onExecutorExit?: (taskId: string) => void;
}

export async function startTaskExecution(
  taskId: string,
  eventHandler?: TaskEventHandler,
): Promise<{ task: ReturnType<typeof withExecutingStatus>; error?: string }> {
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    return { task: null as never, error: "NOT_FOUND: Task not found" };
  }

  const task = taskResult[0];

  if (task.status !== "TODO") {
    return {
      task: null as never,
      error: `INVALID_STATE_TRANSITION: Cannot start task in ${task.status} status`,
    };
  }

  // Check if the executor/agent is enabled
  const isEnabled = await isExecutorEnabled(task.executor);
  if (!isEnabled) {
    return {
      task: null as never,
      error: `BAD_REQUEST: Agent "${task.executor}" is disabled in settings`,
    };
  }

  // Get repository info
  const repoResult = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, task.repositoryId));

  if (repoResult.length === 0) {
    return { task: null as never, error: "NOT_FOUND: Repository not found" };
  }

  const repo = repoResult[0];
  const worktreePath = `${tmpdir()}/sahai-worktrees/${task.id}`;

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
    .where(eq(tasks.id, taskId));

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
    eventHandler?.onLog?.(log);
  });

  executor.onExit(() => {
    eventHandler?.onExecutorExit?.(taskId);
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

  // Notify status change
  eventHandler?.onStatusChange?.({
    taskId,
    repositoryId: task.repositoryId,
    oldStatus: "TODO",
    newStatus: "InProgress",
    isExecuting: true,
    updatedAt: now,
  });

  const updatedTask = await db.select().from(tasks).where(eq(tasks.id, taskId));
  return { task: withExecutingStatus(updatedTask[0]) };
}

export async function resumeTaskExecution(
  taskId: string,
  message?: string,
  eventHandler?: TaskEventHandler,
): Promise<{ task: ReturnType<typeof withExecutingStatus>; error?: string }> {
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskResult.length === 0) {
    return { task: null as never, error: "NOT_FOUND: Task not found" };
  }

  const task = taskResult[0];

  if (task.status !== "InProgress" && task.status !== "InReview") {
    return {
      task: null as never,
      error: `INVALID_STATE_TRANSITION: Cannot resume task in ${task.status} status`,
    };
  }

  if (!task.worktreePath) {
    return { task: null as never, error: "BAD_REQUEST: Task has no worktree" };
  }

  // Check if the executor/agent is enabled
  const isEnabled = await isExecutorEnabled(task.executor);
  if (!isEnabled) {
    return {
      task: null as never,
      error: `BAD_REQUEST: Agent "${task.executor}" is disabled in settings`,
    };
  }

  // Stop existing executor if running
  const existingExecutor = activeExecutors.get(taskId);
  if (existingExecutor) {
    await existingExecutor.stop();
    activeExecutors.delete(taskId);
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
    eventHandler?.onLog?.(log);
  });

  executor.onExit(() => {
    eventHandler?.onExecutorExit?.(taskId);
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

  // Update status to InProgress if it was InReview
  if (task.status === "InReview") {
    await db
      .update(tasks)
      .set({
        status: "InProgress",
        updatedAt: now,
      })
      .where(eq(tasks.id, taskId));

    // Notify status change
    eventHandler?.onStatusChange?.({
      taskId,
      repositoryId: task.repositoryId,
      oldStatus: "InReview",
      newStatus: "InProgress",
      isExecuting: true,
      updatedAt: now,
    });
  }

  const updatedTask = await db.select().from(tasks).where(eq(tasks.id, taskId));
  return { task: withExecutingStatus(updatedTask[0]) };
}
