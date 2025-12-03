import { useCallback, useEffect, useRef, useState } from "react";
import { type ExecutionLog, ExecutionLogArray, Task } from "shared/schemas";
import useSWR from "swr";
import { fetcher, getTaskLogsStreamUrl, parseLogEvent } from "../api";

export function useTask(taskId: string) {
  const { data, mutate } = useSWR(`/tasks/${taskId}`, fetcher, {
    suspense: true,
  });
  return {
    task: Task.parse(data),
    mutate,
  };
}

export function useTaskLogs(taskId: string) {
  const { data, mutate } = useSWR(`/tasks/${taskId}/logs`, fetcher, {
    suspense: true,
  });
  return {
    logs: ExecutionLogArray.parse(data),
    mutate,
  };
}

export function useTaskLogsStream(taskId: string, onStatusChange?: () => void) {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);

  // Keep the ref updated
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = getTaskLogsStreamUrl(taskId);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("connected", () => {
      setConnected(true);
      setError(null);
    });

    eventSource.addEventListener("log", (event) => {
      const log = parseLogEvent(event.data);
      if (log) {
        setLogs((prev) => [log, ...prev]);

        // Detect status change from system logs
        if (
          log.logType === "system" &&
          (log.content.includes("Task moved to") ||
            log.content.includes("task completed"))
        ) {
          onStatusChangeRef.current?.();
        }
      }
    });

    eventSource.addEventListener("heartbeat", () => {
      // Keep-alive, no action needed
    });

    eventSource.onerror = () => {
      setConnected(false);
      setError("Connection lost. Reconnecting...");
      // EventSource will auto-reconnect
    };
  }, [taskId]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    connected,
    error,
    clearLogs,
    reconnect: connect,
  };
}

export function useTaskWithRealtimeLogs(taskId: string) {
  const { task, mutate: mutateTask } = useTask(taskId);
  const { logs: initialLogs } = useTaskLogs(taskId);

  // Callback to refresh task when status changes via SSE
  const handleStatusChange = useCallback(() => {
    mutateTask();
  }, [mutateTask]);

  const {
    logs: streamLogs,
    connected,
    error,
    clearLogs,
    reconnect,
  } = useTaskLogsStream(taskId, handleStatusChange);

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
    task,
    mutateTask,
    logs: allLogs,
    connected,
    error,
    clearLogs,
    reconnect,
  };
}
