import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  completeTask,
  finishTask,
  getTask,
  getTaskLogs,
  getTaskLogsStreamUrl,
  openWorktreeInExplorer,
  openWorktreeInTerminal,
  parseLogEvent,
  pauseTask,
  recreateTask,
  resumeTask,
  startTask,
} from "../tasks";

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe("tasks API", () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getTask", () => {
    test("fetches task by ID", async () => {
      const mockTask = {
        id: "task-1",
        repositoryId: "repo-1",
        title: "Test Task",
        description: null,
        status: "TODO",
        executor: "Gemini",
        branchName: "feature-branch",
        baseBranch: "main",
        worktreePath: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        startedAt: null,
        completedAt: null,
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTask),
        } as Response),
      );

      const task = await getTask("task-1");

      expect(task.id).toBe("task-1");
      expect(task.title).toBe("Test Task");
      expect(task.status).toBe("TODO");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1",
      );
    });

    test("throws error on failed request", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: () =>
            Promise.resolve({
              error: { code: "NOT_FOUND", message: "Task not found" },
            }),
        } as Response),
      );

      await expect(getTask("non-existent")).rejects.toThrow("Task not found");
    });
  });

  describe("getTaskLogs", () => {
    test("fetches logs for a task", async () => {
      const mockLogs = [
        {
          id: "log-1",
          taskId: "task-1",
          content: "Test log",
          logType: "stdout",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ];

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockLogs),
        } as Response),
      );

      const logs = await getTaskLogs("task-1");

      expect(logs).toHaveLength(1);
      expect(logs[0].content).toBe("Test log");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1/logs",
      );
    });
  });

  describe("startTask", () => {
    test("sends POST request to start task", async () => {
      const mockTask = {
        id: "task-1",
        repositoryId: "repo-1",
        title: "Test Task",
        description: null,
        status: "InProgress",
        executor: "Gemini",
        branchName: "feature-branch",
        baseBranch: "main",
        worktreePath: "/path/to/worktree",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        startedAt: "2024-01-01T00:01:00.000Z",
        completedAt: null,
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTask),
        } as Response),
      );

      const task = await startTask("task-1");

      expect(task.status).toBe("InProgress");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
    });
  });

  describe("pauseTask", () => {
    test("sends POST request to pause task", async () => {
      const mockTask = {
        id: "task-1",
        repositoryId: "repo-1",
        title: "Test Task",
        description: null,
        status: "InProgress",
        executor: "Gemini",
        branchName: "feature-branch",
        baseBranch: "main",
        worktreePath: "/path/to/worktree",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        startedAt: "2024-01-01T00:01:00.000Z",
        completedAt: null,
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTask),
        } as Response),
      );

      await pauseTask("task-1");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1/pause",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
    });
  });

  describe("openWorktreeInExplorer", () => {
    test("sends POST request to open worktree in explorer", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response),
      );

      await openWorktreeInExplorer("task-1");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1/worktree/open-explorer",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
    });
  });

  describe("openWorktreeInTerminal", () => {
    test("sends POST request to open worktree in terminal", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response),
      );

      await openWorktreeInTerminal("task-1");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1/worktree/open-terminal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
    });
  });

  describe("completeTask", () => {
    test("sends POST request to complete task", async () => {
      const mockTask = {
        id: "task-1",
        repositoryId: "repo-1",
        title: "Test Task",
        description: null,
        status: "InReview",
        executor: "Gemini",
        branchName: "feature-branch",
        baseBranch: "main",
        worktreePath: "/path/to/worktree",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        startedAt: "2024-01-01T00:01:00.000Z",
        completedAt: null,
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTask),
        } as Response),
      );

      const task = await completeTask("task-1");

      expect(task.status).toBe("InReview");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1/complete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
    });
  });

  describe("resumeTask", () => {
    test("sends POST request with optional message", async () => {
      const mockTask = {
        id: "task-1",
        repositoryId: "repo-1",
        title: "Test Task",
        description: null,
        status: "InProgress",
        executor: "Gemini",
        branchName: "feature-branch",
        baseBranch: "main",
        worktreePath: "/path/to/worktree",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        startedAt: "2024-01-01T00:01:00.000Z",
        completedAt: null,
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTask),
        } as Response),
      );

      await resumeTask("task-1", "Please continue with tests");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1/resume",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Please continue with tests" }),
        },
      );
    });

    test("sends POST request without message", async () => {
      const mockTask = {
        id: "task-1",
        repositoryId: "repo-1",
        title: "Test Task",
        description: null,
        status: "InProgress",
        executor: "Gemini",
        branchName: "feature-branch",
        baseBranch: "main",
        worktreePath: "/path/to/worktree",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        startedAt: "2024-01-01T00:01:00.000Z",
        completedAt: null,
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTask),
        } as Response),
      );

      await resumeTask("task-1");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1/resume",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: undefined }),
        },
      );
    });
  });

  describe("finishTask", () => {
    test("sends POST request to finish task", async () => {
      const mockTask = {
        id: "task-1",
        repositoryId: "repo-1",
        title: "Test Task",
        description: null,
        status: "Done",
        executor: "Gemini",
        branchName: "feature-branch",
        baseBranch: "main",
        worktreePath: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        startedAt: "2024-01-01T00:01:00.000Z",
        completedAt: "2024-01-01T00:02:00.000Z",
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTask),
        } as Response),
      );

      const task = await finishTask("task-1");

      expect(task.status).toBe("Done");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1/finish",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
    });
  });

  describe("recreateTask", () => {
    test("sends POST request with options", async () => {
      const mockTask = {
        id: "task-2",
        repositoryId: "repo-1",
        title: "New Title",
        description: null,
        status: "TODO",
        executor: "Gemini",
        branchName: "feature-branch-retry",
        baseBranch: "main",
        worktreePath: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        startedAt: null,
        completedAt: null,
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTask),
        } as Response),
      );

      const task = await recreateTask("task-1", {
        title: "New Title",
        branchName: "feature-branch-retry",
      });

      expect(task.title).toBe("New Title");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1/recreate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "New Title",
            branchName: "feature-branch-retry",
          }),
        },
      );
    });
  });

  describe("getTaskDiff", () => {
    test("fetches diff for a task", async () => {
      const mockDiff = { diff: "diff --git a/test.txt b/test.txt\n..." };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDiff),
        } as Response),
      );

      const { getTaskDiff } = await import("../tasks");
      const diff = await getTaskDiff("task-1");

      expect(diff).toBe("diff --git a/test.txt b/test.txt\n...");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1/diff",
      );
    });

    test("throws error on failed request", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: () =>
            Promise.resolve({
              error: { code: "NOT_FOUND", message: "Task not found" },
            }),
        } as Response),
      );

      const { getTaskDiff } = await import("../tasks");
      await expect(getTaskDiff("non-existent")).rejects.toThrow(
        "Task not found",
      );
    });
  });

  describe("getTaskLogsStreamUrl", () => {
    test("returns correct SSE URL", () => {
      const url = getTaskLogsStreamUrl("task-123");
      expect(url).toBe("http://localhost:49382/v1/tasks/task-123/logs/stream");
    });
  });

  describe("parseLogEvent", () => {
    test("parses valid log event", () => {
      const data = JSON.stringify({
        id: "log-1",
        taskId: "task-1",
        content: "Test content",
        logType: "stdout",
        createdAt: "2024-01-01T00:00:00.000Z",
      });

      const log = parseLogEvent(data);

      expect(log).not.toBeNull();
      expect(log?.id).toBe("log-1");
      expect(log?.content).toBe("Test content");
      expect(log?.logType).toBe("stdout");
    });

    test("returns null for invalid JSON", () => {
      const log = parseLogEvent("not valid json");
      expect(log).toBeNull();
    });

    test("returns null for invalid log structure", () => {
      const log = parseLogEvent(JSON.stringify({ invalid: "structure" }));
      expect(log).toBeNull();
    });
  });
});
