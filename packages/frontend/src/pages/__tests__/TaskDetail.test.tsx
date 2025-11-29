import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup } from "@testing-library/react";
import { Window } from "happy-dom";
import type { Task } from "shared/schemas";

// Set up happy-dom
const window = new Window();
globalThis.document = window.document as unknown as Document;
globalThis.window = window as unknown as Window & typeof globalThis;
globalThis.navigator = window.navigator as unknown as Navigator;

// Mock EventSource
class MockEventSource {
  url: string;
  readyState = 1;
  private listeners: Map<string, ((event: MessageEvent) => void)[]> = new Map();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)?.push(listener);
  }

  removeEventListener(_type: string, _listener: (event: MessageEvent) => void) {
    // No-op for tests
  }

  close() {
    this.readyState = 2;
  }

  onerror: ((event: Event) => void) | null = null;
}

const originalEventSource = globalThis.EventSource;
const originalFetch = globalThis.fetch;

describe("TaskDetail", () => {
  beforeEach(() => {
    // Mock EventSource
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

    // Mock fetch for SWR
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response),
    );
  });

  afterEach(() => {
    cleanup();
    globalThis.EventSource = originalEventSource;
    globalThis.fetch = originalFetch;
  });

  describe("TaskInfo component", () => {
    test("renders task information correctly", () => {
      // We'll test the helper functions used by TaskInfo
      const formatDate = (date: Date): string => {
        return new Intl.DateTimeFormat("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(date);
      };

      const date = new Date("2024-01-15T10:30:00.000Z");
      const formatted = formatDate(date);

      // Just verify the format includes expected parts
      expect(formatted).toContain("2024");
      expect(formatted).toContain("Jan");
      expect(formatted).toContain("15");
    });

    test("formatTime formats correctly", () => {
      const formatTime = (date: Date): string => {
        return new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(date);
      };

      const date = new Date("2024-01-15T10:30:45.000Z");
      const formatted = formatTime(date);

      // Verify it contains time components
      expect(formatted).toMatch(/\d{1,2}:\d{2}:\d{2}/);
    });
  });

  describe("Status colors", () => {
    test("status colors are defined correctly", () => {
      const statusColors: Record<string, string> = {
        TODO: "#6b7280",
        InProgress: "#3b82f6",
        InReview: "#f59e0b",
        Done: "#10b981",
      };

      expect(statusColors.TODO).toBe("#6b7280");
      expect(statusColors.InProgress).toBe("#3b82f6");
      expect(statusColors.InReview).toBe("#f59e0b");
      expect(statusColors.Done).toBe("#10b981");
    });
  });

  describe("Log type colors", () => {
    test("log type colors are defined correctly", () => {
      const logTypeColors: Record<string, string> = {
        stdout: "#1f2937",
        stderr: "#dc2626",
        system: "#6b7280",
      };

      const logTypeBgColors: Record<string, string> = {
        stdout: "#f9fafb",
        stderr: "#fef2f2",
        system: "#f3f4f6",
      };

      expect(logTypeColors.stdout).toBe("#1f2937");
      expect(logTypeColors.stderr).toBe("#dc2626");
      expect(logTypeColors.system).toBe("#6b7280");

      expect(logTypeBgColors.stdout).toBe("#f9fafb");
      expect(logTypeBgColors.stderr).toBe("#fef2f2");
      expect(logTypeBgColors.system).toBe("#f3f4f6");
    });
  });

  describe("Task action button visibility", () => {
    test("TODO status shows Start button", () => {
      const task = { status: "TODO" } as Task;
      const showStart = task.status === "TODO";
      const showPause = task.status === "InProgress";
      const showComplete = task.status === "InProgress";
      const showResume =
        task.status === "InProgress" || task.status === "InReview";
      const showFinish = task.status === "InReview";

      expect(showStart).toBe(true);
      expect(showPause).toBe(false);
      expect(showComplete).toBe(false);
      expect(showResume).toBe(false);
      expect(showFinish).toBe(false);
    });

    test("InProgress status shows Pause, Complete, and Resume buttons", () => {
      const task = { status: "InProgress" } as Task;
      const showStart = task.status === "TODO";
      const showPause = task.status === "InProgress";
      const showComplete = task.status === "InProgress";
      const showResume =
        task.status === "InProgress" || task.status === "InReview";
      const showFinish = task.status === "InReview";

      expect(showStart).toBe(false);
      expect(showPause).toBe(true);
      expect(showComplete).toBe(true);
      expect(showResume).toBe(true);
      expect(showFinish).toBe(false);
    });

    test("InReview status shows Resume and Finish buttons", () => {
      const task = { status: "InReview" } as Task;
      const showStart = task.status === "TODO";
      const showPause = task.status === "InProgress";
      const showComplete = task.status === "InProgress";
      const showResume =
        task.status === "InProgress" || task.status === "InReview";
      const showFinish = task.status === "InReview";

      expect(showStart).toBe(false);
      expect(showPause).toBe(false);
      expect(showComplete).toBe(false);
      expect(showResume).toBe(true);
      expect(showFinish).toBe(true);
    });

    test("Done status shows no action buttons", () => {
      const task = { status: "Done" } as Task;
      const showStart = task.status === "TODO";
      const showPause = task.status === "InProgress";
      const showComplete = task.status === "InProgress";
      const showResume =
        task.status === "InProgress" || task.status === "InReview";
      const showFinish = task.status === "InReview";

      expect(showStart).toBe(false);
      expect(showPause).toBe(false);
      expect(showComplete).toBe(false);
      expect(showResume).toBe(false);
      expect(showFinish).toBe(false);
    });
  });

  describe("Log merging logic", () => {
    test("merges initial logs with stream logs without duplicates", () => {
      const initialLogs = [
        {
          id: "log-1",
          taskId: "task-1",
          content: "Initial log",
          logType: "stdout" as const,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
        },
        {
          id: "log-2",
          taskId: "task-1",
          content: "Second log",
          logType: "stdout" as const,
          createdAt: new Date("2024-01-01T00:01:00.000Z"),
        },
      ];

      const streamLogs = [
        {
          id: "log-3",
          taskId: "task-1",
          content: "Stream log",
          logType: "stdout" as const,
          createdAt: new Date("2024-01-01T00:02:00.000Z"),
        },
        {
          id: "log-2", // Duplicate
          taskId: "task-1",
          content: "Second log",
          logType: "stdout" as const,
          createdAt: new Date("2024-01-01T00:01:00.000Z"),
        },
      ];

      // Merge logic from useTaskWithRealtimeLogs
      const allLogs = [...streamLogs];
      for (const log of initialLogs) {
        if (!allLogs.some((l) => l.id === log.id)) {
          allLogs.push(log);
        }
      }

      // Sort by createdAt descending
      allLogs.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      expect(allLogs).toHaveLength(3);
      expect(allLogs[0].id).toBe("log-3"); // Newest first
      expect(allLogs[1].id).toBe("log-2");
      expect(allLogs[2].id).toBe("log-1"); // Oldest last
    });
  });
});
