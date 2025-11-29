import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { repositories } from "../db/schema";

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
    return c.json({ error: "Repository not found" }, 404);
  }

  return c.json(result[0]);
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
    return c.json({ error: "Repository not found" }, 404);
  }

  const updated = {
    name: body.name ?? existing[0].name,
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
    return c.json({ error: "Repository not found" }, 404);
  }

  await db.delete(repositories).where(eq(repositories.id, id));

  return c.json({ message: "Repository deleted" });
});

export default app;
