/**
 * Transformation functions to convert API responses to domain types.
 */

import type {
  ExecutionLog,
  Project,
  ProjectRepository,
  Repository,
  Task,
} from "../types";
import type {
  ExecutionLogResponse,
  ProjectRepositoryResponse,
  ProjectResponse,
  RepositoryResponse,
  TaskResponse,
} from "./responses";

export function toProject(response: ProjectResponse): Project {
  return {
    ...response,
    description: response.description ?? undefined,
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
  };
}

export function toRepository(response: RepositoryResponse): Repository {
  return {
    ...response,
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
  };
}

export function toProjectRepository(
  response: ProjectRepositoryResponse,
): ProjectRepository {
  return {
    ...response,
    createdAt: new Date(response.createdAt),
  };
}

export function toTask(response: TaskResponse): Task {
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

export function toExecutionLog(response: ExecutionLogResponse): ExecutionLog {
  return {
    ...response,
    logType: response.logType as ExecutionLog["logType"],
    createdAt: new Date(response.createdAt),
  };
}
