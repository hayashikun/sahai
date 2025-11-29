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
import { repositories } from "../../db/schema";
import app from "../repositories";

const TEST_DB_PATH = resolve(import.meta.dirname, "../../../data/test.db");

beforeAll(() => {
  process.env.DB_PATH = TEST_DB_PATH;
  runMigrations();
});

beforeEach(async () => {
  await db.delete(repositories);
});

afterAll(() => {
  try {
    unlinkSync(TEST_DB_PATH);
  } catch {
    // ignore if file doesn't exist
  }
});

describe("GET /", () => {
  test("returns empty array when no repositories exist", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("returns all repositories", async () => {
    const now = new Date().toISOString();
    await db.insert(repositories).values({
      id: "test-id-1",
      name: "Repo 1",
      path: "/path/to/repo1",
      defaultBranch: "main",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(repositories).values({
      id: "test-id-2",
      name: "Repo 2",
      path: "/path/to/repo2",
      defaultBranch: "master",
      createdAt: now,
      updatedAt: now,
    });

    const res = await app.request("/");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
  });
});

describe("POST /", () => {
  test("creates a new repository", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Repo",
        path: "/path/to/new-repo",
        defaultBranch: "develop",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("New Repo");
    expect(data.path).toBe("/path/to/new-repo");
    expect(data.defaultBranch).toBe("develop");
    expect(data.id).toBeDefined();
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  test("creates a repository with default branch as main", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Default Branch Repo",
        path: "/path/to/default-branch-repo",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Default Branch Repo");
    expect(data.defaultBranch).toBe("main");
  });
});

describe("GET /:id", () => {
  test("returns a repository by id", async () => {
    const now = new Date().toISOString();
    await db.insert(repositories).values({
      id: "test-id",
      name: "Test Repo",
      path: "/path/to/test-repo",
      defaultBranch: "main",
      createdAt: now,
      updatedAt: now,
    });

    const res = await app.request("/test-id");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("test-id");
    expect(data.name).toBe("Test Repo");
    expect(data.path).toBe("/path/to/test-repo");
  });

  test("returns 404 for non-existent repository", async () => {
    const res = await app.request("/non-existent-id");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Repository not found");
  });
});

describe("PUT /:id", () => {
  test("updates a repository", async () => {
    const now = new Date().toISOString();
    await db.insert(repositories).values({
      id: "test-id",
      name: "Original Name",
      path: "/original/path",
      defaultBranch: "main",
      createdAt: now,
      updatedAt: now,
    });

    const res = await app.request("/test-id", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Updated Name",
        path: "/updated/path",
        defaultBranch: "develop",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Updated Name");
    expect(data.path).toBe("/updated/path");
    expect(data.defaultBranch).toBe("develop");
  });

  test("partially updates a repository", async () => {
    const now = new Date().toISOString();
    await db.insert(repositories).values({
      id: "test-id",
      name: "Original Name",
      path: "/original/path",
      defaultBranch: "main",
      createdAt: now,
      updatedAt: now,
    });

    const res = await app.request("/test-id", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Updated Name");
    expect(data.path).toBe("/original/path");
    expect(data.defaultBranch).toBe("main");
  });

  test("returns 404 for non-existent repository", async () => {
    const res = await app.request("/non-existent-id", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /:id", () => {
  test("deletes a repository", async () => {
    const now = new Date().toISOString();
    await db.insert(repositories).values({
      id: "test-id",
      name: "To Delete",
      path: "/path/to/delete",
      defaultBranch: "main",
      createdAt: now,
      updatedAt: now,
    });

    const res = await app.request("/test-id", { method: "DELETE" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("Repository deleted");

    // Verify it's deleted
    const getRes = await app.request("/test-id");
    expect(getRes.status).toBe(404);
  });

  test("returns 404 for non-existent repository", async () => {
    const res = await app.request("/non-existent-id", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
