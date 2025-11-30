import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Mock EventSource
class MockEventSource {
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  private listeners: Map<string, ((event: MessageEvent) => void)[]> = new Map();

  constructor(url: string) {
    this.url = url;
    this.readyState = 1; // OPEN
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)?.push(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  close() {
    this.readyState = 2; // CLOSED
  }

  // Helper for tests to simulate events
  simulateEvent(type: string, data: string) {
    const event = { data } as MessageEvent;
    const listeners = this.listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }
}

// Store the original EventSource
const originalEventSource = globalThis.EventSource;
const originalFetch = globalThis.fetch;

describe("useTasks hooks", () => {
  beforeEach(() => {
    // Mock EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

    // Mock fetch
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response),
    );
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
    globalThis.fetch = originalFetch;
  });

  describe("EventSource mock", () => {
    test("EventSource mock works correctly", () => {
      const es = new MockEventSource("http://test.com/stream");

      let receivedData: string | null = null;
      es.addEventListener("message", (event) => {
        receivedData = event.data;
      });

      es.simulateEvent("message", "test data");

      expect(receivedData).toBe("test data");
    });

    test("EventSource mock can simulate connected event", () => {
      const es = new MockEventSource("http://test.com/stream");

      let connected = false;
      es.addEventListener("connected", () => {
        connected = true;
      });

      es.simulateEvent("connected", JSON.stringify({ status: "connected" }));

      expect(connected).toBe(true);
    });

    test("EventSource mock can simulate log event", () => {
      const es = new MockEventSource("http://test.com/stream");

      let logData: string | null = null;
      es.addEventListener("log", (event) => {
        logData = event.data;
      });

      const mockLog = {
        id: "log-1",
        taskId: "task-1",
        content: "Test log",
        logType: "stdout",
        createdAt: "2024-01-01T00:00:00.000Z",
      };
      es.simulateEvent("log", JSON.stringify(mockLog));

      expect(logData).toBe(JSON.stringify(mockLog));
    });

    test("EventSource mock can be closed", () => {
      const es = new MockEventSource("http://test.com/stream");

      expect(es.readyState).toBe(1); // OPEN
      es.close();
      expect(es.readyState).toBe(2); // CLOSED
    });
  });

  describe("parseLogEvent integration", () => {
    test("can parse log event data", async () => {
      // Import the function directly
      const { parseLogEvent } = await import("../../api/tasks");

      const mockLog = {
        id: "log-1",
        taskId: "task-1",
        content: "Test content",
        logType: "stdout",
        createdAt: "2024-01-01T00:00:00.000Z",
      };

      const log = parseLogEvent(JSON.stringify(mockLog));

      expect(log).not.toBeNull();
      expect(log?.id).toBe("log-1");
      expect(log?.content).toBe("Test content");
    });
  });

  describe("getTaskLogsStreamUrl integration", () => {
    test("generates correct URL", async () => {
      const { getTaskLogsStreamUrl } = await import("../../api/tasks");

      const url = getTaskLogsStreamUrl("task-abc-123");

      expect(url).toBe(
        "http://localhost:49382/v1/tasks/task-abc-123/logs/stream",
      );
    });
  });
});
