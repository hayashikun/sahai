import {
  type CreateEpicInput,
  Epic,
  type EpicLog,
  EpicLogArray,
  type Epic as EpicType,
  TaskArray,
  type Task as TaskType,
} from "shared";
import { API_BASE_URL, apiDelete, apiPost, apiPut, fetcher } from "./client";

export async function createEpic(
  projectId: string,
  input: CreateEpicInput,
): Promise<EpicType> {
  const data = await apiPost(`/projects/${projectId}/epics`, input);
  return Epic.parse(data);
}

export async function updateEpic(
  epicId: string,
  updates: { title?: string; description?: string },
): Promise<EpicType> {
  const data = await apiPut(`/epics/${epicId}`, updates);
  return Epic.parse(data);
}

export async function deleteEpic(epicId: string): Promise<void> {
  await apiDelete(`/epics/${epicId}`);
}

export async function startEpic(
  epicId: string,
): Promise<{ message: string; isExecuting: boolean }> {
  const data = await apiPost(`/epics/${epicId}/start`, {});
  return data as { message: string; isExecuting: boolean };
}

export async function stopEpic(
  epicId: string,
): Promise<{ message: string; isExecuting: boolean }> {
  const data = await apiPost(`/epics/${epicId}/stop`, {});
  return data as { message: string; isExecuting: boolean };
}

export async function getEpicTasks(epicId: string): Promise<TaskType[]> {
  const data = await fetcher(`/epics/${epicId}/tasks`);
  return TaskArray.parse(data);
}

export async function getEpicLogs(epicId: string): Promise<EpicLog[]> {
  const data = await fetcher(`/epics/${epicId}/logs`);
  return EpicLogArray.parse(data);
}

export function getEpicLogsStreamUrl(epicId: string): string {
  return `${API_BASE_URL}/epics/${epicId}/logs/stream`;
}

// Parse epic log event from SSE
export function parseEpicLogEvent(data: string): EpicLog | null {
  try {
    const parsed = JSON.parse(data);
    // Parse the raw event, handling date conversion
    return {
      id: parsed.id,
      epicId: parsed.epicId,
      content: parsed.content,
      logType: parsed.logType,
      createdAt: new Date(parsed.createdAt),
    };
  } catch {
    return null;
  }
}
