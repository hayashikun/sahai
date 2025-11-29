import { Task, type Task as TaskType } from "shared/schemas";
import { apiPost } from "./client";

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
