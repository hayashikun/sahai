import type { Context } from "hono";
import { type SSEStreamingApi, streamSSE } from "hono/streaming";

/**
 * Generic EventBus for pub/sub pattern
 * Creates subscribe/broadcast functions for a specific key type
 */
export function createEventBus<T>() {
  const subscribers = new Map<string, Set<(event: T) => void>>();

  function subscribe(key: string, callback: (event: T) => void): () => void {
    if (!subscribers.has(key)) {
      subscribers.set(key, new Set());
    }
    subscribers.get(key)?.add(callback);

    // Return unsubscribe function
    return () => {
      const keySubscribers = subscribers.get(key);
      if (keySubscribers) {
        keySubscribers.delete(callback);
        if (keySubscribers.size === 0) {
          subscribers.delete(key);
        }
      }
    };
  }

  function broadcast(key: string, event: T): void {
    const keySubscribers = subscribers.get(key);
    if (keySubscribers) {
      for (const callback of keySubscribers) {
        callback(event);
      }
    }
  }

  return { subscribe, broadcast };
}

/**
 * Options for SSE stream handler
 */
interface SSEStreamOptions<T> {
  /** Key to subscribe to (e.g., taskId, repositoryId) */
  subscriptionKey: string;
  /** Subscribe function from EventBus */
  subscribe: (key: string, callback: (event: T) => void) => () => void;
  /** Get event type from the event data */
  getEventType: (event: T) => string;
  /** Initial connection data to send */
  connectedData: Record<string, unknown>;
  /** Heartbeat interval in milliseconds (default: 30000) */
  heartbeatInterval?: number;
}

/**
 * Create an SSE stream handler with common patterns:
 * - Subscribe to events
 * - Send connected event
 * - Periodic heartbeat
 * - Cleanup on disconnect
 */
export function createSSEStream<T>(
  c: Context,
  options: SSEStreamOptions<T>,
): Response {
  const {
    subscriptionKey,
    subscribe,
    getEventType,
    connectedData,
    heartbeatInterval = 30000,
  } = options;

  return streamSSE(c, async (stream: SSEStreamingApi) => {
    let eventId = 0;

    const unsubscribe = subscribe(subscriptionKey, (event: T) => {
      stream.writeSSE({
        data: JSON.stringify(event),
        event: getEventType(event),
        id: String(eventId++),
      });
    });

    // Send initial connection event
    await stream.writeSSE({
      data: JSON.stringify({ ...connectedData, status: "connected" }),
      event: "connected",
      id: String(eventId++),
    });

    // Keep connection alive with periodic heartbeats
    const heartbeat = setInterval(() => {
      stream.writeSSE({
        data: "",
        event: "heartbeat",
        id: String(eventId++),
      });
    }, heartbeatInterval);

    // Clean up on disconnect
    stream.onAbort(() => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    // Keep the stream open
    await new Promise(() => {});
  });
}

/**
 * Simplified SSE stream for single event type (e.g., logs)
 */
interface SimpleSSEStreamOptions<T> {
  /** Key to subscribe to */
  subscriptionKey: string;
  /** Subscribe function from EventBus */
  subscribe: (key: string, callback: (event: T) => void) => () => void;
  /** Event type name */
  eventType: string;
  /** Initial connection data to send */
  connectedData: Record<string, unknown>;
  /** Heartbeat interval in milliseconds (default: 30000) */
  heartbeatInterval?: number;
}

/**
 * Create an SSE stream handler for single event type
 */
export function createSimpleSSEStream<T>(
  c: Context,
  options: SimpleSSEStreamOptions<T>,
): Response {
  const {
    subscriptionKey,
    subscribe,
    eventType,
    connectedData,
    heartbeatInterval = 30000,
  } = options;

  return streamSSE(c, async (stream: SSEStreamingApi) => {
    let eventId = 0;

    const unsubscribe = subscribe(subscriptionKey, (event: T) => {
      stream.writeSSE({
        data: JSON.stringify(event),
        event: eventType,
        id: String(eventId++),
      });
    });

    // Send initial connection event
    await stream.writeSSE({
      data: JSON.stringify({ ...connectedData, status: "connected" }),
      event: "connected",
      id: String(eventId++),
    });

    // Keep connection alive with periodic heartbeats
    const heartbeat = setInterval(() => {
      stream.writeSSE({
        data: "",
        event: "heartbeat",
        id: String(eventId++),
      });
    }, heartbeatInterval);

    // Clean up on disconnect
    stream.onAbort(() => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    // Keep the stream open
    await new Promise(() => {});
  });
}
