import {
  Project,
  ProjectRepository,
  type ProjectRepository as ProjectRepositoryType,
  type Project as ProjectType,
} from "shared/schemas";
import { apiDelete, apiPost, apiPut } from "./client";

export async function createProject(
  name: string,
  description?: string,
): Promise<ProjectType> {
  const data = await apiPost("/projects", {
    name,
    description,
  });
  return Project.parse(data);
}

export async function updateProject(
  projectId: string,
  updates: { name?: string; description?: string },
): Promise<ProjectType> {
  const data = await apiPut(`/projects/${projectId}`, updates);
  return Project.parse(data);
}

export async function deleteProject(projectId: string): Promise<void> {
  await apiDelete(`/projects/${projectId}`);
}

export async function associateRepositoryWithProject(
  projectId: string,
  repositoryId: string,
): Promise<ProjectRepositoryType> {
  const data = await apiPost(
    `/projects/${projectId}/repositories/${repositoryId}`,
    {},
  );
  return ProjectRepository.parse(data);
}

export async function disassociateRepositoryFromProject(
  projectId: string,
  repositoryId: string,
): Promise<void> {
  await apiDelete(`/projects/${projectId}/repositories/${repositoryId}`);
}
