import {
  ExecutionLog,
  ExecutionLogArray,
  type ExecutionLog as ExecutionLogType,
  Task,
  type Task as TaskType,
} from "shared/schemas";
import { API_BASE_URL, apiDelete, apiPost, apiPut, fetcher } from "./client";

export async function getTask(taskId: string): Promise<TaskType> {
  const data = await fetcher(`/tasks/${taskId}`);
  return Task.parse(data);
}

export async function getTaskLogs(taskId: string): Promise<ExecutionLogType[]> {
  const data = await fetcher(`/tasks/${taskId}/logs`);
  return ExecutionLogArray.parse(data);
}

export async function startTask(taskId: string): Promise<TaskType> {
  const data = await apiPost(`/tasks/${taskId}/start`, {});
  return Task.parse(data);
}

export async function pauseTask(taskId: string): Promise<TaskType> {
  const data = await apiPost(`/tasks/${taskId}/pause`, {});
  return Task.parse(data);
}

export async function completeTask(taskId: string): Promise<TaskType> {
  const data = await apiPost(`/tasks/${taskId}/complete`, {});
  return Task.parse(data);
}

export async function resumeTask(
  taskId: string,
  message?: string,
): Promise<TaskType> {
  const data = await apiPost(`/tasks/${taskId}/resume`, { message });
  return Task.parse(data);
}

export async function finishTask(taskId: string): Promise<TaskType> {
  const data = await apiPost(`/tasks/${taskId}/finish`, {});
  return Task.parse(data);
}

export async function recreateTask(
  taskId: string,
  options?: {
    title?: string;
    description?: string;
    branchName?: string;
  },
): Promise<TaskType> {
  const data = await apiPost(`/tasks/${taskId}/recreate`, options ?? {});
  return Task.parse(data);
}

export async function getTaskDiff(taskId: string): Promise<string> {
  const data = (await fetcher(`/tasks/${taskId}/diff`)) as { diff: string };
  return data.diff;
}

export async function updateTask(
  taskId: string,
  updates: { title?: string; description?: string },
): Promise<TaskType> {
  const data = await apiPut(`/tasks/${taskId}`, updates);
  return Task.parse(data);
}

export async function deleteTask(taskId: string): Promise<void> {
  await apiDelete(`/tasks/${taskId}`);
}

export async function openWorktreeInExplorer(taskId: string): Promise<void> {
  await apiPost(`/tasks/${taskId}/worktree/open-explorer`, {});
}

export async function openWorktreeInTerminal(taskId: string): Promise<void> {
  await apiPost(`/tasks/${taskId}/worktree/open-terminal`, {});
}

// SSE stream URL for logs
export function getTaskLogsStreamUrl(taskId: string): string {
  return `${API_BASE_URL}/tasks/${taskId}/logs/stream`;
}

// SSE stream URL for repository task events
export function getRepositoryTasksStreamUrl(repositoryId: string): string {
  return `${API_BASE_URL}/repositories/${repositoryId}/tasks/stream`;
}

// Parse SSE log event
export function parseLogEvent(data: string): ExecutionLogType | null {
  try {
    const parsed = JSON.parse(data);
    return ExecutionLog.parse(parsed);
  } catch {
    return null;
  }
}

// Task event types for SSE
export type TaskStatusChangedEvent = {
  type: "task-status-changed";
  taskId: string;
  oldStatus: string;
  newStatus: string;
  isExecuting: boolean;
  updatedAt: string;
};

export type TaskCreatedEvent = {
  type: "task-created";
  task: TaskType;
  createdAt: string;
};

export type TaskDeletedEvent = {
  type: "task-deleted";
  taskId: string;
  deletedAt: string;
};

export type TaskEvent =
  | TaskStatusChangedEvent
  | TaskCreatedEvent
  | TaskDeletedEvent;

// Parse SSE task event
export function parseTaskEvent(data: string): TaskEvent | null {
  try {
    return JSON.parse(data) as TaskEvent;
  } catch {
    return null;
  }
}
