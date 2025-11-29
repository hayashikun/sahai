import { Repository, TaskArray } from "shared/schemas";
import useSWR from "swr";
import { fetcher } from "../api/client";

export function useRepository(id: string) {
  const { data, mutate } = useSWR(`/repositories/${id}`, fetcher, {
    suspense: true,
  });
  return {
    repository: Repository.parse(data),
    mutate,
  };
}

export function useRepositoryTasks(repositoryId: string) {
  const { data, mutate } = useSWR(
    `/repositories/${repositoryId}/tasks`,
    fetcher,
    { suspense: true },
  );
  return {
    tasks: TaskArray.parse(data),
    mutate,
  };
}
