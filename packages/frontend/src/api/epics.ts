import {
  type CreateEpicInput,
  Epic,
  type Epic as EpicType,
  TaskArray,
  type Task as TaskType,
} from "shared";
import { apiDelete, apiPost, apiPut } from "./client";

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

export async function startEpic(epicId: string): Promise<{ message: string }> {
  const data = await apiPost(`/epics/${epicId}/start`, {});
  return data as { message: string };
}

export async function getEpicTasks(epicId: string): Promise<TaskType[]> {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL || "http://localhost:49382"}/v1/epics/${epicId}/tasks`,
  );
  if (!response.ok) {
    throw new Error("Failed to fetch epic tasks");
  }
  const data = await response.json();
  return TaskArray.parse(data);
}
