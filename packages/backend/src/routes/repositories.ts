import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { repositories } from "../db/schema";
import { notFound } from "../lib/errors";
import {
  convertToGitHubUrl,
  getRemoteUrl,
  listBranches,
  openInFinder,
  openInTerminal,
} from "../services/git";

const app = new Hono();

// GET /v1/repositories - List all repositories
app.get("/", async (c) => {
  const result = await db.select().from(repositories);
  return c.json(result);
});

// POST /v1/repositories - Create a new repository
app.post("/", async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const newRepository = {
    id,
    name: body.name,
    description: body.description ?? null,
    path: body.path,
    defaultBranch: body.defaultBranch ?? "main",
    // Lifecycle scripts
    setupScript: body.setupScript ?? null,
    startScript: body.startScript ?? null,
    stopScript: body.stopScript ?? null,
    cleanupScript: body.cleanupScript ?? null,
    copyFiles: body.copyFiles ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(repositories).values(newRepository);
  return c.json(newRepository, 201);
});

// GET /v1/repositories/:id - Get a repository by ID
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, id));

  if (result.length === 0) {
    return notFound(c, "Repository");
  }

  return c.json(result[0]);
});

// GET /v1/repositories/:id/branches - List branches in a repository
app.get("/:id/branches", async (c) => {
  const id = c.req.param("id");
  const result = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, id));

  if (result.length === 0) {
    return notFound(c, "Repository");
  }

  const repository = result[0];

  try {
    const branches = await listBranches(repository.path);
    return c.json({ branches });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list branches",
      },
      500,
    );
  }
});

// PUT /v1/repositories/:id - Update a repository
app.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const existing = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, id));

  if (existing.length === 0) {
    return notFound(c, "Repository");
  }

  const updated = {
    name: body.name ?? existing[0].name,
    description:
      body.description !== undefined
        ? body.description
        : existing[0].description,
    path: body.path ?? existing[0].path,
    defaultBranch: body.defaultBranch ?? existing[0].defaultBranch,
    // Lifecycle scripts - allow null to clear values
    setupScript:
      body.setupScript !== undefined
        ? body.setupScript
        : existing[0].setupScript,
    startScript:
      body.startScript !== undefined
        ? body.startScript
        : existing[0].startScript,
    stopScript:
      body.stopScript !== undefined ? body.stopScript : existing[0].stopScript,
    cleanupScript:
      body.cleanupScript !== undefined
        ? body.cleanupScript
        : existing[0].cleanupScript,
    copyFiles:
      body.copyFiles !== undefined ? body.copyFiles : existing[0].copyFiles,
    updatedAt: now,
  };

  await db.update(repositories).set(updated).where(eq(repositories.id, id));

  return c.json({ ...existing[0], ...updated });
});

// DELETE /v1/repositories/:id - Delete a repository
app.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, id));

  if (existing.length === 0) {
    return notFound(c, "Repository");
  }

  await db.delete(repositories).where(eq(repositories.id, id));

  return c.json({ message: "Repository deleted" });
});

// GET /v1/repositories/:id/github-url - Get GitHub URL for the repository
app.get("/:id/github-url", async (c) => {
  const id = c.req.param("id");
  const result = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, id));

  if (result.length === 0) {
    return notFound(c, "Repository");
  }

  const repository = result[0];

  const remoteUrl = await getRemoteUrl(repository.path);
  if (!remoteUrl) {
    return c.json({ url: null });
  }

  const githubUrl = convertToGitHubUrl(remoteUrl);
  return c.json({ url: githubUrl });
});

// POST /v1/repositories/:id/open-finder - Open repository in Finder
app.post("/:id/open-finder", async (c) => {
  const id = c.req.param("id");
  const result = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, id));

  if (result.length === 0) {
    return notFound(c, "Repository");
  }

  const repository = result[0];

  try {
    await openInFinder(repository.path);
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to open Finder",
      },
      500,
    );
  }
});

// POST /v1/repositories/:id/open-terminal - Open repository in Terminal
app.post("/:id/open-terminal", async (c) => {
  const id = c.req.param("id");
  const result = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, id));

  if (result.length === 0) {
    return notFound(c, "Repository");
  }

  const repository = result[0];

  try {
    await openInTerminal(repository.path);
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to open Terminal",
      },
      500,
    );
  }
});

export default app;
