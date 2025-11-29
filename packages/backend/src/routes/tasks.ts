import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { repositories, tasks } from "../db/schema";

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
