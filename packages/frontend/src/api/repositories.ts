import {
  Repository,
  RepositoryArray,
  type Repository as RepositoryType,
  type Status,
  Task,
  type Task as TaskType,
} from "shared/schemas";
import { apiDelete, apiPost, apiPut, fetcher } from "./client";

// Repository CRUD operations

export async function getRepositories(): Promise<RepositoryType[]> {
  const data = await fetcher("/repositories");
  return RepositoryArray.parse(data);
}

export async function getRepository(
  repositoryId: string,
): Promise<RepositoryType> {
  const data = await fetcher(`/repositories/${repositoryId}`);
  return Repository.parse(data);
}

export interface CreateRepositoryInput {
  name: string;
  path: string;
  defaultBranch?: string;
}

export async function createRepository(
  input: CreateRepositoryInput,
): Promise<RepositoryType> {
  const data = await apiPost("/repositories", input);
  return Repository.parse(data);
}

export async function updateRepository(
  repositoryId: string,
  updates: { name?: string; path?: string; defaultBranch?: string },
): Promise<RepositoryType> {
  const data = await apiPut(`/repositories/${repositoryId}`, updates);
  return Repository.parse(data);
}

export async function deleteRepository(repositoryId: string): Promise<void> {
  await apiDelete(`/repositories/${repositoryId}`);
}

export async function getRepositoryBranches(
  repositoryId: string,
): Promise<string[]> {
  const data = await fetcher(`/repositories/${repositoryId}/branches`);
  if (typeof data === "object" && data !== null && "branches" in data) {
    return data.branches as string[];
  }
  return [];
}

// Task operations for repositories

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
