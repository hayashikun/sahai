import {
  ExecutionLog,
  ExecutionLogArray,
  type ExecutionLog as ExecutionLogType,
  Task,
  type Task as TaskType,
} from "shared/schemas";
import { apiDelete, apiPost, apiPut, fetcher } from "./client";

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

// SSE stream URL for logs
export function getTaskLogsStreamUrl(taskId: string): string {
  return `http://localhost:3001/v1/tasks/${taskId}/logs/stream`;
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
