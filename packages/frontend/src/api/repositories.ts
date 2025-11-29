import { type TaskResponse, toTask } from "shared/api";
import type { Task } from "shared/types";
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
): Promise<Task> {
  const data = await apiPost<TaskResponse>(
    `/repositories/${repositoryId}/tasks`,
    input,
  );
  return toTask(data);
}
