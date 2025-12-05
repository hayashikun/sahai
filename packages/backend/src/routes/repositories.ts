import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { repositories } from "../db/schema";
import { notFound } from "../lib/errors";
import { listBranches } from "../services/git";

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

export default app;
