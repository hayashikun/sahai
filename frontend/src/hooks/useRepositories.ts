import type { Repository, Task } from "shared/types";
import useSWR from "swr";
import { fetcher } from "../api/client";
import type { RepositoryResponse, TaskResponse } from "../api/repositories";

function toRepository(response: RepositoryResponse): Repository {
  return {
    ...response,
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
  };
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

export function useRepository(id: string) {
  const { data } = useSWR<RepositoryResponse>(`/repositories/${id}`, fetcher, {
    suspense: true,
  });
  return data ? toRepository(data) : null;
}

export function useRepositoryTasks(repositoryId: string) {
  const { data, mutate } = useSWR<TaskResponse[]>(
    `/repositories/${repositoryId}/tasks`,
    fetcher,
    { suspense: true },
  );
  return {
    tasks: data?.map(toTask) ?? [],
    mutate,
  };
}
