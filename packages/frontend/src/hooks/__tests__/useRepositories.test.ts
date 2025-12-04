import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Repository, TaskArray } from "shared";

const originalFetch = globalThis.fetch;

describe("useRepositories hooks", () => {
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

  describe("Repository schema parsing", () => {
    test("parses repository correctly", () => {
      // Repository schema doesn't include projectId - that's in ProjectRepository
      const mockRepository = {
        id: "repo-1",
        name: "my-repo",
        path: "/path/to/repo",
        defaultBranch: "main",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      const repository = Repository.parse(mockRepository);

      expect(repository.id).toBe("repo-1");
      expect(repository.name).toBe("my-repo");
      expect(repository.path).toBe("/path/to/repo");
      expect(repository.defaultBranch).toBe("main");
      expect(repository.createdAt).toBeInstanceOf(Date);
    });

    test("parses repository with master default branch", () => {
      const mockRepository = {
        id: "repo-2",
        name: "legacy-repo",
        path: "/path/to/legacy",
        defaultBranch: "master",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      const repository = Repository.parse(mockRepository);

      expect(repository.defaultBranch).toBe("master");
    });
  });

  describe("TaskArray schema parsing", () => {
    test("parses array of tasks correctly", () => {
      const mockTasks = [
        {
          id: "task-1",
          repositoryId: "repo-1",
          title: "Task 1",
          description: null,
          status: "TODO",
          executor: "Gemini",
          branchName: "feature-1",
          baseBranch: "main",
          worktreePath: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          startedAt: null,
          completedAt: null,
        },
        {
          id: "task-2",
          repositoryId: "repo-1",
          title: "Task 2",
          description: "Description",
          status: "InProgress",
          executor: "Gemini",
          branchName: "feature-2",
          baseBranch: "main",
          worktreePath: "/path/to/worktree",
          createdAt: "2024-01-02T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
          startedAt: "2024-01-02T00:01:00.000Z",
          completedAt: null,
        },
      ];

      const tasks = TaskArray.parse(mockTasks);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].title).toBe("Task 1");
      expect(tasks[0].status).toBe("TODO");
      expect(tasks[1].title).toBe("Task 2");
      expect(tasks[1].status).toBe("InProgress");
    });

    test("parses empty task array", () => {
      const tasks = TaskArray.parse([]);
      expect(tasks).toHaveLength(0);
    });

    test("parses tasks with all statuses", () => {
      const mockTasks = [
        {
          id: "task-1",
          repositoryId: "repo-1",
          title: "TODO Task",
          description: null,
          status: "TODO",
          executor: "Gemini",
          branchName: "todo-branch",
          baseBranch: "main",
          worktreePath: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          startedAt: null,
          completedAt: null,
        },
        {
          id: "task-2",
          repositoryId: "repo-1",
          title: "InProgress Task",
          description: null,
          status: "InProgress",
          executor: "Gemini",
          branchName: "progress-branch",
          baseBranch: "main",
          worktreePath: "/worktree",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          startedAt: "2024-01-01T00:01:00.000Z",
          completedAt: null,
        },
        {
          id: "task-3",
          repositoryId: "repo-1",
          title: "InReview Task",
          description: null,
          status: "InReview",
          executor: "Gemini",
          branchName: "review-branch",
          baseBranch: "main",
          worktreePath: "/worktree",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          startedAt: "2024-01-01T00:01:00.000Z",
          completedAt: null,
        },
        {
          id: "task-4",
          repositoryId: "repo-1",
          title: "Done Task",
          description: null,
          status: "Done",
          executor: "Gemini",
          branchName: "done-branch",
          baseBranch: "main",
          worktreePath: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          startedAt: "2024-01-01T00:01:00.000Z",
          completedAt: "2024-01-01T00:02:00.000Z",
        },
      ];

      const tasks = TaskArray.parse(mockTasks);

      expect(tasks).toHaveLength(4);
      expect(tasks.map((t) => t.status)).toEqual([
        "TODO",
        "InProgress",
        "InReview",
        "Done",
      ]);
    });
  });

  describe("fetcher integration", () => {
    test("fetcher returns data for useRepository", async () => {
      const mockRepository = {
        id: "repo-1",
        name: "my-repo",
        path: "/path/to/repo",
        defaultBranch: "main",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRepository),
        } as Response),
      );

      const { fetcher } = await import("../../api/client");
      const data = await fetcher("/repositories/repo-1");
      const repository = Repository.parse(data);

      expect(repository.id).toBe("repo-1");
      expect(repository.name).toBe("my-repo");
    });

    test("fetcher returns data for useRepositoryTasks", async () => {
      const mockTasks = [
        {
          id: "task-1",
          repositoryId: "repo-1",
          title: "Test Task",
          description: null,
          status: "TODO",
          executor: "Gemini",
          branchName: "test-branch",
          baseBranch: "main",
          worktreePath: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          startedAt: null,
          completedAt: null,
        },
      ];

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTasks),
        } as Response),
      );

      const { fetcher } = await import("../../api/client");
      const data = await fetcher("/repositories/repo-1/tasks");
      const tasks = TaskArray.parse(data);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].repositoryId).toBe("repo-1");
    });
  });
});
