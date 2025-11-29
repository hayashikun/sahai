import type { Project } from "shared/types";
import { apiPost } from "./client";

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

function toProject(response: ProjectResponse): Project {
  return {
    ...response,
    description: response.description ?? undefined,
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
  };
}

export async function createProject(
  name: string,
  description?: string,
): Promise<Project> {
  const data = await apiPost<ProjectResponse>("/projects", {
    name,
    description,
  });
  return toProject(data);
}
