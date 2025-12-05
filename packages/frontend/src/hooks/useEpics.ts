import { Epic, EpicArray, TaskArray } from "shared";
import useSWR from "swr";
import { fetcher } from "../api/client";

export function useProjectEpics(projectId: string) {
  const { data, mutate } = useSWR(`/projects/${projectId}/epics`, fetcher, {
    suspense: true,
  });
  return {
    epics: EpicArray.parse(data),
    mutate,
  };
}

export function useEpic(epicId: string) {
  const { data, mutate } = useSWR(`/epics/${epicId}`, fetcher, {
    suspense: true,
  });
  return {
    epic: Epic.parse(data),
    mutate,
  };
}

export function useEpicTasks(epicId: string) {
  const { data, mutate } = useSWR(`/epics/${epicId}/tasks`, fetcher, {
    suspense: true,
  });
  return {
    tasks: TaskArray.parse(data),
    mutate,
  };
}
