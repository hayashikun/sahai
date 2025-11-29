import type { Project, Repository } from "shared/types";
import useSWR from "swr";
import { fetcher } from "../api/client";
import type { ProjectResponse, RepositoryResponse } from "../api/projects";

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

export function useProjects() {
  const { data, mutate } = useSWR<ProjectResponse[]>("/projects", fetcher, {
    suspense: true,
  });
  return {
    projects: data?.map(toProject) ?? [],
    mutate,
  };
}

export function useProject(id: string) {
  const { data } = useSWR<ProjectResponse>(`/projects/${id}`, fetcher, {
    suspense: true,
  });
  return data ? toProject(data) : null;
}

export function useProjectRepositories(projectId: string) {
  const { data } = useSWR<RepositoryResponse[]>(
    `/projects/${projectId}/repositories`,
    fetcher,
    { suspense: true },
  );
  return data?.map(toRepository) ?? [];
}
