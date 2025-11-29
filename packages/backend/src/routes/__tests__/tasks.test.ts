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
import { executionLogs, repositories, tasks } from "../../db/schema";
import { repositoryTasks, taskById } from "../tasks";

const TEST_DB_PATH = resolve(import.meta.dirname, "../../../data/test.db");

beforeAll(() => {
  process.env.DB_PATH = TEST_DB_PATH;
  runMigrations();
});

beforeEach(async () => {
  await db.delete(executionLogs);
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

async function createExecutionLog(
  id: string,
  taskId: string,
  content: string,
  logType: "stdout" | "stderr" | "system" = "stdout",
) {
  const now = new Date().toISOString();
  await db.insert(executionLogs).values({
    id,
    taskId,
    content,
    logType,
    createdAt: now,
  });
}

async function createTaskWithStatus(
  id: string,
  repositoryId: string,
  title: string,
  status: "TODO" | "InProgress" | "InReview" | "Done",
  worktreePath: string | null = null,
) {
  const now = new Date().toISOString();
  await db.insert(tasks).values({
    id,
    repositoryId,
    title,
    description: "Test description",
    status,
    executor: "ClaudeCode",
    branchName: `feature/${id}`,
    baseBranch: "main",
    worktreePath,
    createdAt: now,
    updatedAt: now,
    startedAt: status !== "TODO" ? now : null,
    completedAt: status === "Done" ? now : null,
  });
}

describe("GET /:id/logs", () => {
  test("returns empty array when no logs exist", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTask("task-1", "repo-1", "Task 1");

    const res = await taskById.request("/task-1/logs");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("returns logs for a task", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTask("task-1", "repo-1", "Task 1");
    await createExecutionLog("log-1", "task-1", "Log content 1");
    await createExecutionLog("log-2", "task-1", "Log content 2", "stderr");

    const res = await taskById.request("/task-1/logs");
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ id: string; content: string }>;
    expect(data).toHaveLength(2);
  });

  test("returns 404 for non-existent task", async () => {
    const res = await taskById.request("/non-existent/logs");
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task not found");
  });
});

describe("POST /:id/start", () => {
  test("returns 404 for non-existent task", async () => {
    const res = await taskById.request("/non-existent/start", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task not found");
  });

  test("returns 400 if task is not in TODO status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Task 1", "InProgress");

    const res = await taskById.request("/task-1/start", { method: "POST" });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task must be in TODO status to start");
  });

  test("returns 400 if task is in InReview status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Task 1", "InReview");

    const res = await taskById.request("/task-1/start", { method: "POST" });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task must be in TODO status to start");
  });

  test("returns 400 if task is in Done status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Task 1", "Done");

    const res = await taskById.request("/task-1/start", { method: "POST" });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task must be in TODO status to start");
  });
});

describe("POST /:id/pause", () => {
  test("returns 404 for non-existent task", async () => {
    const res = await taskById.request("/non-existent/pause", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task not found");
  });

  test("returns 400 if task is not in InProgress status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Task 1", "TODO");

    const res = await taskById.request("/task-1/pause", { method: "POST" });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task must be in InProgress status to pause");
  });

  test("pauses a task in InProgress status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Task 1", "InProgress");

    const res = await taskById.request("/task-1/pause", { method: "POST" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe("InProgress");
  });
});

describe("POST /:id/complete", () => {
  test("returns 404 for non-existent task", async () => {
    const res = await taskById.request("/non-existent/complete", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task not found");
  });

  test("returns 400 if task is not in InProgress status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Task 1", "TODO");

    const res = await taskById.request("/task-1/complete", { method: "POST" });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task must be in InProgress status to complete");
  });

  test("completes a task in InProgress status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Task 1", "InProgress");

    const res = await taskById.request("/task-1/complete", { method: "POST" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe("InReview");
  });
});

describe("POST /:id/resume", () => {
  test("returns 404 for non-existent task", async () => {
    const res = await taskById.request("/non-existent/resume", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task not found");
  });

  test("returns 400 if task is in TODO status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Task 1", "TODO");

    const res = await taskById.request("/task-1/resume", { method: "POST" });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe(
      "Task must be in InProgress or InReview status to resume",
    );
  });

  test("returns 400 if task is in Done status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Task 1", "Done");

    const res = await taskById.request("/task-1/resume", { method: "POST" });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe(
      "Task must be in InProgress or InReview status to resume",
    );
  });

  test("returns 400 if task has no worktree", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus(
      "task-1",
      "repo-1",
      "Task 1",
      "InProgress",
      null,
    );

    const res = await taskById.request("/task-1/resume", { method: "POST" });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task has no worktree");
  });
});

describe("POST /:id/finish", () => {
  test("returns 404 for non-existent task", async () => {
    const res = await taskById.request("/non-existent/finish", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task not found");
  });

  test("returns 400 if task is not in InReview status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Task 1", "InProgress");

    const res = await taskById.request("/task-1/finish", { method: "POST" });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task must be in InReview status to finish");
  });

  test("returns 400 if task is in TODO status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Task 1", "TODO");

    const res = await taskById.request("/task-1/finish", { method: "POST" });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task must be in InReview status to finish");
  });
});

describe("GET /:id/diff", () => {
  test("returns 404 for non-existent task", async () => {
    const res = await taskById.request("/non-existent/diff");
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task not found");
  });

  test("returns 404 if repository not found", async () => {
    // Create a task with a non-existent repository ID
    const now = new Date().toISOString();
    await db.insert(tasks).values({
      id: "orphan-task",
      repositoryId: "non-existent-repo",
      title: "Orphan Task",
      description: null,
      status: "InProgress",
      executor: "ClaudeCode",
      branchName: "feature/orphan",
      baseBranch: "main",
      worktreePath: null,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      completedAt: null,
    });

    const res = await taskById.request("/orphan-task/diff");
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Repository not found");
  });

  test("returns 500 if git diff fails", async () => {
    // Create repository with invalid path (will cause git command to fail)
    await createRepository("repo-1", "Repo 1");
    await createTask("task-1", "repo-1", "Task 1");

    const res = await taskById.request("/task-1/diff");
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("Failed to get diff");
  });
});

describe("POST /:id/recreate", () => {
  test("returns 404 for non-existent task", async () => {
    const res = await taskById.request("/non-existent/recreate", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Task not found");
  });

  test("creates a new task from existing task", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Original Task", "Done");

    const res = await taskById.request("/task-1/recreate", { method: "POST" });
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      id: string;
      title: string;
      status: string;
      branchName: string;
    };
    expect(data.id).not.toBe("task-1");
    expect(data.title).toBe("Original Task");
    expect(data.status).toBe("TODO");
    expect(data.branchName).toBe("feature/task-1-retry");
  });

  test("creates a new task with custom properties", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Original Task", "Done");

    const res = await taskById.request("/task-1/recreate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New Title",
        branchName: "feature/new-branch",
      }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      title: string;
      branchName: string;
    };
    expect(data.title).toBe("New Title");
    expect(data.branchName).toBe("feature/new-branch");
  });

  test("can recreate from any status", async () => {
    await createRepository("repo-1", "Repo 1");
    await createTaskWithStatus("task-1", "repo-1", "Task 1", "InProgress");

    const res = await taskById.request("/task-1/recreate", { method: "POST" });
    expect(res.status).toBe(201);
  });
});
