import type {
  MessageDeliveredEvent,
  MessageEvent,
  MessageQueuedEvent,
  TaskCreatedEvent,
  TaskDeletedEvent,
  TaskEvent,
  TaskStatusChangedEvent,
} from "shared";
import {
  ExecutionLog,
  ExecutionLogArray,
  type ExecutionLog as ExecutionLogType,
  Task,
  TaskMessage,
  type TaskMessage as TaskMessageType,
  type Task as TaskType,
  TaskWithRepositoryArray,
  type TaskWithRepository as TaskWithRepositoryType,
} from "shared";
import { API_BASE_URL, apiDelete, apiPost, apiPut, fetcher } from "./client";

export type {
  TaskEvent,
  TaskStatusChangedEvent,
  TaskCreatedEvent,
  TaskDeletedEvent,
  MessageEvent,
  MessageQueuedEvent,
  MessageDeliveredEvent,
};

export async function getTask(taskId: string): Promise<TaskType> {
  const data = await fetcher(`/tasks/${taskId}`);
  return Task.parse(data);
}

export async function getAllTasks(): Promise<TaskWithRepositoryType[]> {
  const data = await fetcher("/tasks");
  return TaskWithRepositoryArray.parse(data);
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

// Parse SSE task event
export function parseTaskEvent(data: string): TaskEvent | null {
  try {
    return JSON.parse(data) as TaskEvent;
  } catch {
    return null;
  }
}

// Message Queue API functions
export async function queueMessage(
  taskId: string,
  content: string,
): Promise<TaskMessageType> {
  const data = await apiPost(`/tasks/${taskId}/messages`, { content });
  return TaskMessage.parse(data);
}

export async function deleteQueuedMessage(
  taskId: string,
  messageId: string,
): Promise<void> {
  await apiDelete(`/tasks/${taskId}/messages/${messageId}`);
}

// SSE stream URL for message events
export function getTaskMessagesStreamUrl(taskId: string): string {
  return `${API_BASE_URL}/tasks/${taskId}/messages/stream`;
}

// Parse SSE message event
export function parseMessageEvent(data: string): MessageEvent | null {
  try {
    return JSON.parse(data) as MessageEvent;
  } catch {
    return null;
  }
}
