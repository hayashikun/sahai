import { Project, ProjectArray, RepositoryArray } from "shared";
import useSWR from "swr";
import { fetcher } from "../api/client";

export function useProjects() {
  const { data, mutate } = useSWR("/projects", fetcher, {
    suspense: true,
  });
  return {
    projects: ProjectArray.parse(data),
    mutate,
  };
}

export function useProject(id: string) {
  const { data, mutate } = useSWR(`/projects/${id}`, fetcher, {
    suspense: true,
  });
  return {
    project: Project.parse(data),
    mutate,
  };
}

export function useProjectRepositories(projectId: string) {
  const { data, mutate } = useSWR(
    `/projects/${projectId}/repositories`,
    fetcher,
    {
      suspense: true,
    },
  );
  return {
    repositories: RepositoryArray.parse(data),
    mutate,
  };
}
