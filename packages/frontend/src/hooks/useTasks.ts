import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ExecutionLog,
  ExecutionLogArray,
  Task,
  type TaskMessage,
  TaskMessageArray,
  TaskWithRepositoryArray,
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
import { type EventHandler, useEventSource } from "./useEventSource";

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
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const handleLog = useCallback((data: string) => {
    const log = parseLogEvent(data);
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
  }, []);

  const eventHandlers: EventHandler[] = useMemo(
    () => [{ event: "log", handler: handleLog }],
    [handleLog],
  );

  const { connected, error, reconnect } = useEventSource(
    { url: getTaskLogsStreamUrl(taskId) },
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
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const handleTaskEvent = useCallback((data: string) => {
    const taskEvent = parseTaskEvent(data);
    if (taskEvent) {
      onEventRef.current?.(taskEvent);
    }
  }, []);

  const eventHandlers: EventHandler[] = useMemo(
    () => [
      { event: "task-status-changed", handler: handleTaskEvent },
      { event: "task-created", handler: handleTaskEvent },
      { event: "task-deleted", handler: handleTaskEvent },
    ],
    [handleTaskEvent],
  );

  const { connected, error, reconnect } = useEventSource(
    { url: getRepositoryTasksStreamUrl(repositoryId) },
    eventHandlers,
  );

  return {
    connected,
    error,
    reconnect,
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
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const handleMessageQueued = useCallback((data: string) => {
    const messageEvent = parseMessageEvent(data);
    if (messageEvent && messageEvent.type === "message-queued") {
      setMessages((prev) => [...prev, messageEvent.message]);
      onEventRef.current?.(messageEvent);
    }
  }, []);

  const handleMessageDelivered = useCallback((data: string) => {
    const messageEvent = parseMessageEvent(data);
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
  }, []);

  const eventHandlers: EventHandler[] = useMemo(
    () => [
      { event: "message-queued", handler: handleMessageQueued },
      { event: "message-delivered", handler: handleMessageDelivered },
    ],
    [handleMessageQueued, handleMessageDelivered],
  );

  const { connected, error, reconnect } = useEventSource(
    { url: getTaskMessagesStreamUrl(taskId) },
    eventHandlers,
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    connected,
    error,
    clearMessages,
    reconnect,
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
    if (allMessages.some((m) => m.id === msg.id)) {
      // Update existing message with stream data (e.g., status change)
      const index = allMessages.findIndex((m) => m.id === msg.id);
      if (index !== -1) {
        allMessages[index] = msg;
      }
    } else {
      allMessages.push(msg);
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

export function useAllTasks() {
  const { data, mutate } = useSWR("/tasks", fetcher, {
    suspense: true,
  });
  return {
    tasks: TaskWithRepositoryArray.parse(data),
    mutate,
  };
}
