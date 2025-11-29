import { Repository, TaskArray } from "shared/schemas";
import useSWR from "swr";
import { fetcher } from "../api/client";

export function useRepository(id: string) {
  const { data } = useSWR(`/repositories/${id}`, fetcher, {
    suspense: true,
  });
  return Repository.parse(data);
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
