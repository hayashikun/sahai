import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { db, runMigrations } from "../../db/client";
import { repositories, tasks } from "../../db/schema";
import { repositoryTasks, taskById } from "../tasks";

const TEST_DB_PATH = resolve(import.meta.dirname, "../../../data/test.db");

beforeAll(() => {
  process.env.DB_PATH = TEST_DB_PATH;
  runMigrations();
});

beforeEach(async () => {
  await db.delete(tasks);
  await db.delete(repositories);
});

afterAll(() => {
  try {
    unlinkSync(TEST_DB_PATH);
  } catch {
    // ignore if file doesn't exist
  }
});

async function createRepository(id: string, name: string) {
  const now = new Date().toISOString();
  await db.insert(repositories).values({
    id,
    name,
    path: `/path/to/${name}`,
    defaultBranch: "main",
    createdAt: now,
    updatedAt: now,
  });
}

async function createTask(
  id: string,
  repositoryId: string,
  title: string,
  status: "TODO" | "InProgress" | "InReview" | "Done" = "TODO",
) {
  const now = new Date().toISOString();
  await db.insert(tasks).values({
    id,
    repositoryId,
    title,
    description: null,
    status,
    executor: "ClaudeCode",
    branchName: `feature/${id}`,
    baseBranch: "main",
    worktreePath: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  });
}

describe("GET /:repositoryId/tasks", () => {
  test("returns empty array when no tasks exist", async () => {
    await createRepository("repo-1", "Repo 1");

    const res = await repositoryTasks.request("/repo-1/tasks");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("returns tasks for a repository", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTask("task-1", "repo-1", "Task 1");
    await createTask("task-2", "repo-1", "Task 2");

    const res = await repositoryTasks.request("/repo-1/tasks");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
  });

  test("returns 404 for non-existent repository", async () => {
    const res = await repositoryTasks.request("/non-existent/tasks");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Repository not found");
  });
});

describe("POST /:repositoryId/tasks", () => {
  test("creates a new task", async () => {
    await createRepository("repo-1", "Repo 1");

    const res = await repositoryTasks.request("/repo-1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New Task",
        description: "Task description",
        executor: "ClaudeCode",
        branchName: "feature/new-task",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe("New Task");
    expect(data.description).toBe("Task description");
    expect(data.status).toBe("TODO");
    expect(data.executor).toBe("ClaudeCode");
    expect(data.branchName).toBe("feature/new-task");
    expect(data.baseBranch).toBe("main");
    expect(data.repositoryId).toBe("repo-1");
    expect(data.id).toBeDefined();
  });

  test("creates a task with custom base branch", async () => {
    await createRepository("repo-1", "Repo 1");

    const res = await repositoryTasks.request("/repo-1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New Task",
        executor: "Codex",
        branchName: "feature/new-task",
        baseBranch: "develop",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.baseBranch).toBe("develop");
    expect(data.executor).toBe("Codex");
  });

  test("returns 404 for non-existent repository", async () => {
    const res = await repositoryTasks.request("/non-existent/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New Task",
        executor: "ClaudeCode",
        branchName: "feature/new-task",
      }),
    });

    expect(res.status).toBe(404);
  });
});

describe("GET /:id", () => {
  test("returns a task by id", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTask("task-1", "repo-1", "Task 1");

    const res = await taskById.request("/task-1");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("task-1");
    expect(data.title).toBe("Task 1");
  });

  test("returns 404 for non-existent task", async () => {
    const res = await taskById.request("/non-existent");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Task not found");
  });
});

describe("PUT /:id", () => {
  test("updates a task", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTask("task-1", "repo-1", "Original Title");

    const res = await taskById.request("/task-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Updated Title",
        description: "Updated description",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("Updated Title");
    expect(data.description).toBe("Updated description");
  });

  test("partially updates a task", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTask("task-1", "repo-1", "Original Title");

    const res = await taskById.request("/task-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("Updated Title");
  });

  test("returns 404 for non-existent task", async () => {
    const res = await taskById.request("/non-existent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });

    expect(res.status).toBe(404);
  });

  test("updates task status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTask("task-1", "repo-1", "Task 1");

    const res = await taskById.request("/task-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "InProgress" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("InProgress");
    expect(data.startedAt).toBeDefined();
  });

  test("sets completedAt when status changes to Done", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTask("task-1", "repo-1", "Task 1", "InReview");

    const res = await taskById.request("/task-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Done" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("Done");
    expect(data.completedAt).toBeDefined();
  });
});

describe("DELETE /:id", () => {
  test("deletes a task", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTask("task-1", "repo-1", "Task 1");

    const res = await taskById.request("/task-1", { method: "DELETE" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("Task deleted");

    // Verify it's deleted
    const getRes = await taskById.request("/task-1");
    expect(getRes.status).toBe(404);
  });

  test("returns 404 for non-existent task", async () => {
    const res = await taskById.request("/non-existent", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
