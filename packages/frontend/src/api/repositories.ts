import { type Status, Task, type Task as TaskType } from "shared/schemas";
import { apiPost, apiPut } from "./client";

export interface CreateTaskInput {
  title: string;
  description?: string;
  executor: string;
  branchName: string;
  baseBranch?: string;
}

export async function createTask(
  repositoryId: string,
  input: CreateTaskInput,
): Promise<TaskType> {
  const data = await apiPost(`/repositories/${repositoryId}/tasks`, input);
  return Task.parse(data);
}

export async function updateTaskStatus(
  taskId: string,
  status: Status,
): Promise<TaskType> {
  const data = await apiPut(`/tasks/${taskId}`, { status });
  return Task.parse(data);
}
