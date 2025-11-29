import type { Task } from "shared/types";
import { apiPost } from "./client";

export interface RepositoryResponse {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskResponse {
  id: string;
  repositoryId: string;
  title: string;
  description: string | null;
  status: string;
  executor: string;
  branchName: string;
  baseBranch: string;
  worktreePath: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

function toTask(response: TaskResponse): Task {
  return {
    ...response,
    description: response.description ?? undefined,
    status: response.status as Task["status"],
    executor: response.executor as Task["executor"],
    worktreePath: response.worktreePath ?? undefined,
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
    startedAt: response.startedAt ? new Date(response.startedAt) : undefined,
    completedAt: response.completedAt
      ? new Date(response.completedAt)
      : undefined,
  };
}

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
