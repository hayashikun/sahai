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
import { projectRepositories, projects, repositories } from "../../db/schema";
import app from "../project-repositories";

const TEST_DB_PATH = resolve(import.meta.dirname, "../../../data/test.db");

beforeAll(() => {
  process.env.DB_PATH = TEST_DB_PATH;
  runMigrations();
});

beforeEach(async () => {
  await db.delete(projectRepositories);
  await db.delete(projects);
  await db.delete(repositories);
});

afterAll(() => {
  try {
    unlinkSync(TEST_DB_PATH);
  } catch {
    // ignore if file doesn't exist
  }
});

async function createProject(id: string, name: string) {
  const now = new Date().toISOString();
  await db.insert(projects).values({
    id,
    name,
    description: null,
    createdAt: now,
    updatedAt: now,
  });
}

async function createRepository(id: string, name: string, path: string) {
  const now = new Date().toISOString();
  await db.insert(repositories).values({
    id,
    name,
    path,
    defaultBranch: "main",
    createdAt: now,
    updatedAt: now,
  });
}

describe("GET /:projectId/repositories", () => {
  test("returns empty array when no associations exist", async () => {
    await createProject("project-1", "Project 1");

    const res = await app.request("/project-1/repositories");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("returns associated repositories", async () => {
    await createProject("project-1", "Project 1");
    await createRepository("repo-1", "Repo 1", "/path/to/repo1");
    await createRepository("repo-2", "Repo 2", "/path/to/repo2");

    const now = new Date().toISOString();
    await db.insert(projectRepositories).values({
      projectId: "project-1",
      repositoryId: "repo-1",
      createdAt: now,
    });
    await db.insert(projectRepositories).values({
      projectId: "project-1",
      repositoryId: "repo-2",
      createdAt: now,
    });

    const res = await app.request("/project-1/repositories");
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ name: string }>;
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe("Repo 1");
    expect(data[1].name).toBe("Repo 2");
  });

  test("returns 404 for non-existent project", async () => {
    const res = await app.request("/non-existent/repositories");
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: { message: string } };
    expect(data.error.message).toBe("Project not found");
  });
});

describe("POST /:projectId/repositories/:repositoryId", () => {
  test("creates association between project and repository", async () => {
    await createProject("project-1", "Project 1");
    await createRepository("repo-1", "Repo 1", "/path/to/repo1");

    const res = await app.request("/project-1/repositories/repo-1", {
      method: "POST",
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      projectId: string;
      repositoryId: string;
      createdAt: string;
    };
    expect(data.projectId).toBe("project-1");
    expect(data.repositoryId).toBe("repo-1");
    expect(data.createdAt).toBeDefined();
  });

  test("returns 404 for non-existent project", async () => {
    await createRepository("repo-1", "Repo 1", "/path/to/repo1");

    const res = await app.request("/non-existent/repositories/repo-1", {
      method: "POST",
    });

    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: { message: string } };
    expect(data.error.message).toBe("Project not found");
  });

  test("returns 404 for non-existent repository", async () => {
    await createProject("project-1", "Project 1");

    const res = await app.request("/project-1/repositories/non-existent", {
      method: "POST",
    });

    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: { message: string } };
    expect(data.error.message).toBe("Repository not found");
  });

  test("returns 409 for duplicate association", async () => {
    await createProject("project-1", "Project 1");
    await createRepository("repo-1", "Repo 1", "/path/to/repo1");

    const now = new Date().toISOString();
    await db.insert(projectRepositories).values({
      projectId: "project-1",
      repositoryId: "repo-1",
      createdAt: now,
    });

    const res = await app.request("/project-1/repositories/repo-1", {
      method: "POST",
    });

    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: { message: string } };
    expect(data.error.message).toBe("Association already exists");
  });
});

describe("DELETE /:projectId/repositories/:repositoryId", () => {
  test("deletes association", async () => {
    await createProject("project-1", "Project 1");
    await createRepository("repo-1", "Repo 1", "/path/to/repo1");

    const now = new Date().toISOString();
    await db.insert(projectRepositories).values({
      projectId: "project-1",
      repositoryId: "repo-1",
      createdAt: now,
    });

    const res = await app.request("/project-1/repositories/repo-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { message: string };
    expect(data.message).toBe("Association deleted");

    // Verify it's deleted
    const getRes = await app.request("/project-1/repositories");
    expect(getRes.status).toBe(200);
    const repos = await getRes.json();
    expect(repos).toHaveLength(0);
  });

  test("returns 404 for non-existent association", async () => {
    await createProject("project-1", "Project 1");
    await createRepository("repo-1", "Repo 1", "/path/to/repo1");

    const res = await app.request("/project-1/repositories/repo-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: { message: string } };
    expect(data.error.message).toBe("Association not found");
  });
});
