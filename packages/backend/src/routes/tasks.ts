import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { executionLogs, repositories, tasks } from "../db/schema";
import { ClaudeCodeExecutor } from "../executors/claude";
import type { Executor } from "../executors/interface";
import { createBranch, deleteBranch } from "../services/git";
import { createWorktree, deleteWorktree } from "../services/worktree";

// In-memory store for active executors
const activeExecutors = new Map<string, Executor>();

// Routes for /v1/repositories/:repositoryId/tasks
export const repositoryTasks = new Hono();

// GET /v1/repositories/:repositoryId/tasks - List tasks for a repository
repositoryTasks.get("/:repositoryId/tasks", async (c) => {
  const repositoryId = c.req.param("repositoryId");

  // Check if repository exists
  const repository = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId));

  if (repository.length === 0) {
    return c.json({ error: "Repository not found" }, 404);
  }

  const result = await db
    .select()
    .from(tasks)
    .where(eq(tasks.repositoryId, repositoryId));

  return c.json(result);
});

// POST /v1/repositories/:repositoryId/tasks - Create a new task
repositoryTasks.post("/:repositoryId/tasks", async (c) => {
  const repositoryId = c.req.param("repositoryId");

  // Check if repository exists
  const repository = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId));

  if (repository.length === 0) {
    return c.json({ error: "Repository not found" }, 404);
  }

  const body = await c.req.json();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const newTask = {
    id,
    repositoryId,
    title: body.title,
    description: body.description ?? null,
    status: "TODO" as const,
    executor: body.executor,
    branchName: body.branchName,
    baseBranch: body.baseBranch ?? repository[0].defaultBranch,
    worktreePath: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };

  await db.insert(tasks).values(newTask);
  return c.json(newTask, 201);
});

// Routes for /v1/tasks/:id
export const taskById = new Hono();

// GET /v1/tasks/:id - Get a task by ID
taskById.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.select().from(tasks).where(eq(tasks.id, id));

  if (result.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }

  return c.json(result[0]);
});

// PUT /v1/tasks/:id - Update a task
taskById.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const existing = await db.select().from(tasks).where(eq(tasks.id, id));

  if (existing.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }

  const updated: Record<string, unknown> = {
    title: body.title ?? existing[0].title,
    description: body.description ?? existing[0].description,
    status: body.status ?? existing[0].status,
    updatedAt: now,
  };

  // Set startedAt when transitioning to InProgress
  if (body.status === "InProgress" && !existing[0].startedAt) {
    updated.startedAt = now;
  }

  // Set completedAt when transitioning to Done
  if (body.status === "Done" && !existing[0].completedAt) {
    updated.completedAt = now;
  }

  await db.update(tasks).set(updated).where(eq(tasks.id, id));

  return c.json({ ...existing[0], ...updated });
});

// DELETE /v1/tasks/:id - Delete a task
taskById.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db.select().from(tasks).where(eq(tasks.id, id));

  if (existing.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }

  await db.delete(tasks).where(eq(tasks.id, id));

  return c.json({ message: "Task deleted" });
});

// POST /v1/tasks/:id/start - Create worktree, start executor
taskById.post("/:id/start", async (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }

  const task = taskResult[0];

  if (task.status !== "TODO") {
    return c.json({ error: "Task must be in TODO status to start" }, 400);
  }

  // Get repository info
  const repoResult = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, task.repositoryId));

  if (repoResult.length === 0) {
    return c.json({ error: "Repository not found" }, 404);
  }

  const repo = repoResult[0];
  const worktreePath = `${repo.path}/.worktrees/${task.branchName}`;

  try {
    // Create branch from base branch
    await createBranch(repo.path, task.branchName, task.baseBranch);

    // Create worktree
    await createWorktree(repo.path, worktreePath, task.branchName);

    // Update task status
    await db
      .update(tasks)
      .set({
        status: "InProgress",
        worktreePath,
        startedAt: now,
        updatedAt: now,
      })
      .where(eq(tasks.id, id));

    // Create and start executor
    const executor = new ClaudeCodeExecutor();

    executor.onOutput(async (output) => {
      // Save output to execution_logs
      await db.insert(executionLogs).values({
        id: crypto.randomUUID(),
        taskId: id,
        content: output.content,
        logType: output.logType,
        createdAt: new Date().toISOString(),
      });
    });

    await executor.start({
      taskId: id,
      workingDirectory: worktreePath,
      prompt: task.description ?? task.title,
    });

    activeExecutors.set(id, executor);

    const updatedTask = await db.select().from(tasks).where(eq(tasks.id, id));

    return c.json(updatedTask[0]);
  } catch (error) {
    return c.json({ error: `Failed to start task: ${error}` }, 500);
  }
});

// POST /v1/tasks/:id/pause - Stop executor
taskById.post("/:id/pause", async (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }

  const task = taskResult[0];

  if (task.status !== "InProgress") {
    return c.json({ error: "Task must be in InProgress status to pause" }, 400);
  }

  const executor = activeExecutors.get(id);
  if (executor) {
    await executor.stop();
    activeExecutors.delete(id);
  }

  await db.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, id));

  const updatedTask = await db.select().from(tasks).where(eq(tasks.id, id));
  return c.json(updatedTask[0]);
});

// POST /v1/tasks/:id/complete - Transition to InReview
taskById.post("/:id/complete", async (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }

  const task = taskResult[0];

  if (task.status !== "InProgress") {
    return c.json(
      { error: "Task must be in InProgress status to complete" },
      400,
    );
  }

  // Stop executor if running
  const executor = activeExecutors.get(id);
  if (executor) {
    await executor.stop();
    activeExecutors.delete(id);
  }

  await db
    .update(tasks)
    .set({
      status: "InReview",
      updatedAt: now,
    })
    .where(eq(tasks.id, id));

  const updatedTask = await db.select().from(tasks).where(eq(tasks.id, id));
  return c.json(updatedTask[0]);
});

// POST /v1/tasks/:id/resume - Restart executor
taskById.post("/:id/resume", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }

  const task = taskResult[0];

  if (task.status !== "InProgress" && task.status !== "InReview") {
    return c.json(
      { error: "Task must be in InProgress or InReview status to resume" },
      400,
    );
  }

  if (!task.worktreePath) {
    return c.json({ error: "Task has no worktree" }, 400);
  }

  // Stop existing executor if running
  const existingExecutor = activeExecutors.get(id);
  if (existingExecutor) {
    await existingExecutor.stop();
    activeExecutors.delete(id);
  }

  try {
    // Create and start executor
    const executor = new ClaudeCodeExecutor();

    executor.onOutput(async (output) => {
      await db.insert(executionLogs).values({
        id: crypto.randomUUID(),
        taskId: id,
        content: output.content,
        logType: output.logType,
        createdAt: new Date().toISOString(),
      });
    });

    const prompt = body.message ?? task.description ?? task.title;

    await executor.start({
      taskId: id,
      workingDirectory: task.worktreePath,
      prompt,
    });

    activeExecutors.set(id, executor);

    // Update status to InProgress if it was InReview
    if (task.status === "InReview") {
      await db
        .update(tasks)
        .set({
          status: "InProgress",
          updatedAt: now,
        })
        .where(eq(tasks.id, id));
    }

    const updatedTask = await db.select().from(tasks).where(eq(tasks.id, id));
    return c.json(updatedTask[0]);
  } catch (error) {
    return c.json({ error: `Failed to resume task: ${error}` }, 500);
  }
});

// POST /v1/tasks/:id/finish - Delete worktree and branch, mark as Done
taskById.post("/:id/finish", async (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }

  const task = taskResult[0];

  if (task.status !== "InReview") {
    return c.json({ error: "Task must be in InReview status to finish" }, 400);
  }

  // Get repository info
  const repoResult = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, task.repositoryId));

  if (repoResult.length === 0) {
    return c.json({ error: "Repository not found" }, 404);
  }

  const repo = repoResult[0];

  try {
    // Delete worktree if exists
    if (task.worktreePath) {
      await deleteWorktree(repo.path, task.worktreePath, true);
    }

    // Delete branch
    await deleteBranch(repo.path, task.branchName, true);

    // Update task status
    await db
      .update(tasks)
      .set({
        status: "Done",
        worktreePath: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(tasks.id, id));

    const updatedTask = await db.select().from(tasks).where(eq(tasks.id, id));
    return c.json(updatedTask[0]);
  } catch (error) {
    return c.json({ error: `Failed to finish task: ${error}` }, 500);
  }
});

// POST /v1/tasks/:id/recreate - Create new task from existing one
taskById.post("/:id/recreate", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();

  const taskResult = await db.select().from(tasks).where(eq(tasks.id, id));
  if (taskResult.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }

  const task = taskResult[0];
  const newId = crypto.randomUUID();

  const newTask = {
    id: newId,
    repositoryId: task.repositoryId,
    title: body.title ?? task.title,
    description: body.description ?? task.description,
    status: "TODO" as const,
    executor: body.executor ?? task.executor,
    branchName: body.branchName ?? `${task.branchName}-retry`,
    baseBranch: body.baseBranch ?? task.baseBranch,
    worktreePath: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };

  await db.insert(tasks).values(newTask);
  return c.json(newTask, 201);
});
