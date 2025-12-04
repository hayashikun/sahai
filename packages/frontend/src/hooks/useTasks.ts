import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ExecutionLog,
  ExecutionLogArray,
  Task,
  type TaskMessage,
  TaskMessageArray,
} from "shared";
import useSWR from "swr";
import {
  fetcher,
  getRepositoryTasksStreamUrl,
  getTaskLogsStreamUrl,
  getTaskMessagesStreamUrl,
  type MessageEvent,
  parseLogEvent,
  parseMessageEvent,
  parseTaskEvent,
  type TaskEvent,
} from "../api";

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

export function useRepositoryTasksStream(
  repositoryId: string,
  onEvent?: (event: TaskEvent) => void,
) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);

  // Keep the ref updated
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = getRepositoryTasksStreamUrl(repositoryId);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("connected", () => {
      setConnected(true);
      setError(null);
    });

    eventSource.addEventListener("task-status-changed", (event) => {
      const taskEvent = parseTaskEvent(event.data);
      if (taskEvent) {
        onEventRef.current?.(taskEvent);
      }
    });

    eventSource.addEventListener("task-created", (event) => {
      const taskEvent = parseTaskEvent(event.data);
      if (taskEvent) {
        onEventRef.current?.(taskEvent);
      }
    });

    eventSource.addEventListener("task-deleted", (event) => {
      const taskEvent = parseTaskEvent(event.data);
      if (taskEvent) {
        onEventRef.current?.(taskEvent);
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
  }, [repositoryId]);

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

  return {
    connected,
    error,
    reconnect: connect,
  };
}

// Message queue hooks
export function useTaskMessages(taskId: string) {
  const { data, mutate } = useSWR(`/tasks/${taskId}/messages`, fetcher, {
    suspense: true,
  });
  return {
    messages: TaskMessageArray.parse(data),
    mutate,
  };
}

export function usePendingMessageCount(taskId: string) {
  const { data, mutate } = useSWR(
    `/tasks/${taskId}/messages/pending/count`,
    fetcher,
    {
      refreshInterval: 5000, // Refresh every 5 seconds
    },
  );
  return {
    count: (data as { count: number })?.count ?? 0,
    mutate,
  };
}

export function useTaskMessagesStream(
  taskId: string,
  onEvent?: (event: MessageEvent) => void,
) {
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);

  // Keep the ref updated
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = getTaskMessagesStreamUrl(taskId);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("connected", () => {
      setConnected(true);
      setError(null);
    });

    eventSource.addEventListener("message-queued", (event) => {
      const messageEvent = parseMessageEvent(event.data);
      if (messageEvent && messageEvent.type === "message-queued") {
        setMessages((prev) => [...prev, messageEvent.message]);
        onEventRef.current?.(messageEvent);
      }
    });

    eventSource.addEventListener("message-delivered", (event) => {
      const messageEvent = parseMessageEvent(event.data);
      if (messageEvent && messageEvent.type === "message-delivered") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageEvent.messageId
              ? {
                  ...m,
                  status: "delivered" as const,
                  deliveredAt: new Date(messageEvent.deliveredAt),
                }
              : m,
          ),
        );
        onEventRef.current?.(messageEvent);
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

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    connected,
    error,
    clearMessages,
    reconnect: connect,
  };
}

export function useTaskMessagesWithStream(taskId: string) {
  const { messages: initialMessages, mutate: mutateMessages } =
    useTaskMessages(taskId);
  const {
    messages: streamMessages,
    connected,
    error,
  } = useTaskMessagesStream(taskId);

  // Merge initial messages with stream messages, removing duplicates
  const allMessages = [...initialMessages];
  for (const msg of streamMessages) {
    if (!allMessages.some((m) => m.id === msg.id)) {
      allMessages.push(msg);
    } else {
      // Update existing message with stream data (e.g., status change)
      const index = allMessages.findIndex((m) => m.id === msg.id);
      if (index !== -1) {
        allMessages[index] = msg;
      }
    }
  }

  // Sort by createdAt ascending (oldest first)
  allMessages.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return {
    messages: allMessages,
    mutateMessages,
    connected,
    error,
  };
}
