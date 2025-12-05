import { tmpdir } from "node:os";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import {
  epics,
  projectRepositories,
  projects,
  repositories,
  tasks,
} from "../db/schema";
import { badRequest, internalError, notFound } from "../lib/errors";
import { startEpicExecution } from "../services/epic";
import { withExecutingStatus } from "../services/task";

// Routes for /v1/projects/:projectId/epics
export const projectEpics = new Hono();

// GET /v1/projects/:projectId/epics - List epics for a project
projectEpics.get("/:projectId/epics", async (c) => {
  const projectId = c.req.param("projectId");

  // Check if project exists
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (project.length === 0) {
    return notFound(c, "Project");
  }

  const result = await db
    .select()
    .from(epics)
    .where(eq(epics.projectId, projectId));

  return c.json(result);
});

// POST /v1/projects/:projectId/epics - Create a new epic
projectEpics.post("/:projectId/epics", async (c) => {
  const projectId = c.req.param("projectId");

  // Check if project exists
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (project.length === 0) {
    return notFound(c, "Project");
  }

  const body = await c.req.json();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const directoryPath = `${tmpdir()}/sahai-epics/${id}`;

  const newEpic = {
    id,
    projectId,
    title: body.title,
    description: body.description ?? null,
    executor: body.executor,
    directoryPath,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(epics).values(newEpic);
  return c.json(newEpic, 201);
});

// Routes for /v1/epics/:id
export const epicById = new Hono();

// GET /v1/epics/:id - Get an epic by ID
epicById.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.select().from(epics).where(eq(epics.id, id));

  if (result.length === 0) {
    return notFound(c, "Epic");
  }

  return c.json(result[0]);
});

// PUT /v1/epics/:id - Update an epic
epicById.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const existing = await db.select().from(epics).where(eq(epics.id, id));

  if (existing.length === 0) {
    return notFound(c, "Epic");
  }

  const updated = {
    title: body.title ?? existing[0].title,
    description: body.description ?? existing[0].description,
    updatedAt: now,
  };

  await db.update(epics).set(updated).where(eq(epics.id, id));

  return c.json({ ...existing[0], ...updated });
});

// DELETE /v1/epics/:id - Delete an epic
epicById.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db.select().from(epics).where(eq(epics.id, id));

  if (existing.length === 0) {
    return notFound(c, "Epic");
  }

  await db.delete(epics).where(eq(epics.id, id));

  return c.json({ message: "Epic deleted" });
});

// GET /v1/epics/:id/tasks - Get tasks related to an epic
epicById.get("/:id/tasks", async (c) => {
  const id = c.req.param("id");

  // Check if epic exists
  const epicResult = await db.select().from(epics).where(eq(epics.id, id));

  if (epicResult.length === 0) {
    return notFound(c, "Epic");
  }

  // Get all tasks with this epicId
  const result = await db.select().from(tasks).where(eq(tasks.epicId, id));

  return c.json(result.map(withExecutingStatus));
});

// GET /v1/epics/:id/repositories - Get repositories available for the epic's project
epicById.get("/:id/repositories", async (c) => {
  const id = c.req.param("id");

  // Check if epic exists and get project ID
  const epicResult = await db.select().from(epics).where(eq(epics.id, id));

  if (epicResult.length === 0) {
    return notFound(c, "Epic");
  }

  const projectId = epicResult[0].projectId;

  // Get repositories associated with this project
  const projectRepos = await db
    .select({
      repository: repositories,
    })
    .from(projectRepositories)
    .innerJoin(
      repositories,
      eq(projectRepositories.repositoryId, repositories.id),
    )
    .where(eq(projectRepositories.projectId, projectId));

  return c.json(projectRepos.map((pr) => pr.repository));
});

// POST /v1/epics/:id/start - Start epic execution
epicById.post("/:id/start", async (c) => {
  const id = c.req.param("id");

  // Check if epic exists
  const epicResult = await db.select().from(epics).where(eq(epics.id, id));

  if (epicResult.length === 0) {
    return notFound(c, "Epic");
  }

  const result = await startEpicExecution(id);

  if (!result.success) {
    if (result.error?.includes("disabled")) {
      return badRequest(c, result.error);
    }
    return internalError(c, result.error || "Failed to start epic execution");
  }

  return c.json({ message: "Epic execution started" });
});
