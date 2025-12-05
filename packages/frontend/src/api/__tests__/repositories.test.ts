import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createTask, updateTaskStatus } from "../repositories";

const originalFetch = globalThis.fetch;

describe("repositories API", () => {
  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("createTask", () => {
    test("creates task with required fields", async () => {
      const mockTask = {
        id: "task-1",
        repositoryId: "repo-1",
        title: "Implement feature",
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
      ) as unknown as typeof fetch;

      const task = await createTask("repo-1", {
        title: "Implement feature",
        executor: "Gemini",
        branchName: "feature-branch",
      });

      expect(task.id).toBe("task-1");
      expect(task.title).toBe("Implement feature");
      expect(task.executor).toBe("Gemini");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/repositories/repo-1/tasks",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Implement feature",
            executor: "Gemini",
            branchName: "feature-branch",
          }),
        },
      );
    });

    test("creates task with all fields", async () => {
      const mockTask = {
        id: "task-2",
        repositoryId: "repo-1",
        title: "Fix bug",
        description: "Fix the login bug",
        status: "TODO",
        executor: "Gemini",
        branchName: "fix-login",
        baseBranch: "develop",
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
      ) as unknown as typeof fetch;

      const task = await createTask("repo-1", {
        title: "Fix bug",
        description: "Fix the login bug",
        executor: "Gemini",
        branchName: "fix-login",
        baseBranch: "develop",
      });

      expect(task.id).toBe("task-2");
      expect(task.description).toBe("Fix the login bug");
      expect(task.baseBranch).toBe("develop");
    });

    test("throws error on failed request", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          json: () =>
            Promise.resolve({
              error: { code: "BAD_REQUEST", message: "Title is required" },
            }),
        } as Response),
      ) as unknown as typeof fetch;

      await expect(
        createTask("repo-1", {
          title: "",
          executor: "Gemini",
          branchName: "test",
        }),
      ).rejects.toThrow("Title is required");
    });
  });

  describe("updateTaskStatus", () => {
    test("updates task status to InProgress", async () => {
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
        updatedAt: "2024-01-01T00:01:00.000Z",
        startedAt: "2024-01-01T00:01:00.000Z",
        completedAt: null,
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTask),
        } as Response),
      ) as unknown as typeof fetch;

      const task = await updateTaskStatus("task-1", "InProgress");

      expect(task.status).toBe("InProgress");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/tasks/task-1",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "InProgress" }),
        },
      );
    });

    test("updates task status to Done", async () => {
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
        updatedAt: "2024-01-01T00:02:00.000Z",
        startedAt: "2024-01-01T00:01:00.000Z",
        completedAt: "2024-01-01T00:02:00.000Z",
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTask),
        } as Response),
      ) as unknown as typeof fetch;

      const task = await updateTaskStatus("task-1", "Done");

      expect(task.status).toBe("Done");
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
      ) as unknown as typeof fetch;

      await expect(updateTaskStatus("task-999", "Done")).rejects.toThrow(
        "Task not found",
      );
    });
  });
});
