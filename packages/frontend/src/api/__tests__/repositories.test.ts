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
    );
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
        executor: "ClaudeCode",
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

      const task = await createTask("repo-1", {
        title: "Implement feature",
        executor: "ClaudeCode",
        branchName: "feature-branch",
      });

      expect(task.id).toBe("task-1");
      expect(task.title).toBe("Implement feature");
      expect(task.executor).toBe("ClaudeCode");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/repositories/repo-1/tasks",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Implement feature",
            executor: "ClaudeCode",
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
        executor: "ClaudeCode",
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
      );

      const task = await createTask("repo-1", {
        title: "Fix bug",
        description: "Fix the login bug",
        executor: "ClaudeCode",
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
        } as Response),
      );

      await expect(
        createTask("repo-1", {
          title: "",
          executor: "ClaudeCode",
          branchName: "test",
        }),
      ).rejects.toThrow("API error: 400");
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
        executor: "ClaudeCode",
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
      );

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
        executor: "ClaudeCode",
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
      );

      const task = await updateTaskStatus("task-1", "Done");

      expect(task.status).toBe("Done");
    });

    test("throws error on failed request", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        } as Response),
      );

      await expect(updateTaskStatus("task-999", "Done")).rejects.toThrow(
        "API error: 404",
      );
    });
  });
});
