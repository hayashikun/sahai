import {
  type RepositoryResponse,
  type TaskResponse,
  toRepository,
  toTask,
} from "shared/api";
import useSWR from "swr";
import { fetcher } from "../api/client";

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
