import { useCallback, useEffect, useRef, useState } from "react";

export interface EventSourceState {
  connected: boolean;
  error: string | null;
}

export interface UseEventSourceOptions {
  /** URL to connect to */
  url: string;
  /** Whether to connect on mount (default: true) */
  enabled?: boolean;
}

export interface EventHandler {
  event: string;
  handler: (data: string) => void;
}

/**
 * Generic hook for managing EventSource connections
 * Handles connection state, reconnection, and cleanup
 */
export function useEventSource(
  options: UseEventSourceOptions,
  eventHandlers: EventHandler[],
) {
  const { url, enabled = true } = options;
  const [state, setState] = useState<EventSourceState>({
    connected: false,
    error: null,
  });
  const eventSourceRef = useRef<EventSource | null>(null);
  const eventHandlersRef = useRef(eventHandlers);

  // Keep handlers ref updated
  useEffect(() => {
    eventHandlersRef.current = eventHandlers;
  }, [eventHandlers]);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("connected", () => {
      setState({ connected: true, error: null });
    });

    eventSource.addEventListener("heartbeat", () => {
      // Keep-alive, no action needed
    });

    // Register all event handlers
    for (const { event, handler } of eventHandlersRef.current) {
      eventSource.addEventListener(event, (e) => {
        handler(e.data);
      });
    }

    eventSource.onerror = () => {
      setState((prev) => ({
        ...prev,
        connected: false,
        error: "Connection lost. Reconnecting...",
      }));
      // EventSource will auto-reconnect
    };
  }, [url]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setState({ connected: false, error: null });
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    ...state,
    reconnect: connect,
    disconnect,
  };
}
