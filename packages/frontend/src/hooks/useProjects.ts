import {
  type ProjectResponse,
  type RepositoryResponse,
  toProject,
  toRepository,
} from "shared/api";
import useSWR from "swr";
import { fetcher } from "../api/client";

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
