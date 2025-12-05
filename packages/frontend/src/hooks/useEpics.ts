import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Epic, EpicArray, type EpicLog, EpicLogArray, TaskArray } from "shared";
import useSWR from "swr";
import { fetcher, getEpicLogsStreamUrl, parseEpicLogEvent } from "../api";
import { type EventHandler, useEventSource } from "./useEventSource";

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

export function useEpicLogs(epicId: string) {
  const { data, mutate } = useSWR(`/epics/${epicId}/logs`, fetcher, {
    suspense: true,
  });
  return {
    logs: EpicLogArray.parse(data),
    mutate,
  };
}

export function useEpicLogsStream(
  epicId: string,
  onExecutionChange?: () => void,
) {
  const [logs, setLogs] = useState<EpicLog[]>([]);
  const onExecutionChangeRef = useRef(onExecutionChange);

  useEffect(() => {
    onExecutionChangeRef.current = onExecutionChange;
  }, [onExecutionChange]);

  const handleLog = useCallback((data: string) => {
    const log = parseEpicLogEvent(data);
    if (log) {
      setLogs((prev) => [log, ...prev]);

      // Detect execution state change from system logs
      if (
        log.logType === "system" &&
        (log.content.includes("execution started") ||
          log.content.includes("execution completed") ||
          log.content.includes("execution stopped"))
      ) {
        onExecutionChangeRef.current?.();
      }
    }
  }, []);

  const eventHandlers: EventHandler[] = useMemo(
    () => [{ event: "log", handler: handleLog }],
    [handleLog],
  );

  const { connected, error, reconnect } = useEventSource(
    { url: getEpicLogsStreamUrl(epicId) },
    eventHandlers,
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    connected,
    error,
    clearLogs,
    reconnect,
  };
}

export function useEpicWithRealtimeLogs(epicId: string) {
  const { epic, mutate: mutateEpic } = useEpic(epicId);
  const { logs: initialLogs } = useEpicLogs(epicId);

  // Callback to refresh epic when execution state changes via SSE
  const handleExecutionChange = useCallback(() => {
    mutateEpic();
  }, [mutateEpic]);

  const {
    logs: streamLogs,
    connected,
    error,
    clearLogs,
    reconnect,
  } = useEpicLogsStream(epicId, handleExecutionChange);

  // Merge initial logs with stream logs, removing duplicates
  const allLogs = [...streamLogs];
  for (const log of initialLogs) {
    if (!allLogs.some((l) => l.id === log.id)) {
      allLogs.push(log);
    }
  }

  // Sort by createdAt ascending (oldest first)
  allLogs.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return {
    epic,
    mutateEpic,
    logs: allLogs,
    connected,
    error,
    clearLogs,
    reconnect,
  };
}
