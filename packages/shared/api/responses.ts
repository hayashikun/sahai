/**
 * API Response types - These represent the JSON structure returned by the backend.
 * Dates are serialized as ISO 8601 strings.
 */

export interface ProjectResponse {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryResponse {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRepositoryResponse {
  projectId: string;
  repositoryId: string;
  createdAt: string;
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

export interface ExecutionLogResponse {
  id: string;
  taskId: string;
  content: string;
  logType: string;
  createdAt: string;
}
