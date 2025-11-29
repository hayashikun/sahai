import type { Project, Repository } from "shared/types";
import { apiGet, apiPost } from "./client";

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

function toRepository(response: RepositoryResponse): Repository {
  return {
    ...response,
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
  };
}

export async function getProjects(): Promise<Project[]> {
  const data = await apiGet<ProjectResponse[]>("/projects");
  return data.map(toProject);
}

export async function getProject(id: string): Promise<Project> {
  const data = await apiGet<ProjectResponse>(`/projects/${id}`);
  return toProject(data);
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

export async function getProjectRepositories(
  projectId: string,
): Promise<Repository[]> {
  const data = await apiGet<RepositoryResponse[]>(
    `/projects/${projectId}/repositories`,
  );
  return data.map(toRepository);
}
