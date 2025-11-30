import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { projectRepositories, projects, repositories } from "../db/schema";
import { conflict, notFound } from "../lib/errors";

const app = new Hono();

// GET /v1/projects/:projectId/repositories - List repositories for a project
app.get("/:projectId/repositories", async (c) => {
  const projectId = c.req.param("projectId");

  // Check if project exists
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (project.length === 0) {
    return notFound(c, "Project");
  }

  // Get associated repositories
  const result = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      path: repositories.path,
      defaultBranch: repositories.defaultBranch,
      createdAt: repositories.createdAt,
      updatedAt: repositories.updatedAt,
    })
    .from(projectRepositories)
    .innerJoin(
      repositories,
      eq(projectRepositories.repositoryId, repositories.id),
    )
    .where(eq(projectRepositories.projectId, projectId));

  return c.json(result);
});

// POST /v1/projects/:projectId/repositories/:repositoryId - Associate repository with project
app.post("/:projectId/repositories/:repositoryId", async (c) => {
  const projectId = c.req.param("projectId");
  const repositoryId = c.req.param("repositoryId");

  // Check if project exists
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (project.length === 0) {
    return notFound(c, "Project");
  }

  // Check if repository exists
  const repository = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId));

  if (repository.length === 0) {
    return notFound(c, "Repository");
  }

  // Check if association already exists
  const existing = await db
    .select()
    .from(projectRepositories)
    .where(
      and(
        eq(projectRepositories.projectId, projectId),
        eq(projectRepositories.repositoryId, repositoryId),
      ),
    );

  if (existing.length > 0) {
    return conflict(c, "Association already exists");
  }

  const now = new Date().toISOString();
  const newAssociation = {
    projectId,
    repositoryId,
    createdAt: now,
  };

  await db.insert(projectRepositories).values(newAssociation);
  return c.json(newAssociation, 201);
});

// DELETE /v1/projects/:projectId/repositories/:repositoryId - Remove association
app.delete("/:projectId/repositories/:repositoryId", async (c) => {
  const projectId = c.req.param("projectId");
  const repositoryId = c.req.param("repositoryId");

  // Check if association exists
  const existing = await db
    .select()
    .from(projectRepositories)
    .where(
      and(
        eq(projectRepositories.projectId, projectId),
        eq(projectRepositories.repositoryId, repositoryId),
      ),
    );

  if (existing.length === 0) {
    return notFound(c, "Association");
  }

  await db
    .delete(projectRepositories)
    .where(
      and(
        eq(projectRepositories.projectId, projectId),
        eq(projectRepositories.repositoryId, repositoryId),
      ),
    );

  return c.json({ message: "Association deleted" });
});

export default app;
