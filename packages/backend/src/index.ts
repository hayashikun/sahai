import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { runMigrations } from "./db/client";
import filesystem from "./routes/filesystem";
import mcp from "./routes/mcp";
import projectRepositories from "./routes/project-repositories";
import projects from "./routes/projects";
import repositories from "./routes/repositories";
import settings from "./routes/settings";
import sounds from "./routes/sounds";
import { repositoryTasks, taskById } from "./routes/tasks";

runMigrations();

const app = new Hono();
const staticDir = process.env.SAHAI_STATIC_DIR;
const isProduction = !!staticDir;

const frontendPort = process.env.PORT || "49381";
app.use(
  "*",
  cors({
    origin: isProduction ? "*" : `http://localhost:${frontendPort}`,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/v1/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/v1/projects", projects);
app.route("/v1/projects", projectRepositories);
app.route("/v1/repositories", repositories);
app.route("/v1/repositories", repositoryTasks);
app.route("/v1/tasks", taskById);
app.route("/v1/filesystem", filesystem);
app.route("/v1/settings", settings);
app.route("/v1/sounds", sounds);
app.route("/v1/mcp", mcp);

// Serve static files in production mode
if (staticDir) {
  app.use(
    "/assets/*",
    serveStatic({
      root: staticDir,
      rewriteRequestPath: (path) => path,
    }),
  );

  // SPA fallback - serve index.html for all non-API routes
  app.get("*", async (c) => {
    const indexPath = join(staticDir, "index.html");
    if (existsSync(indexPath)) {
      const html = await Bun.file(indexPath).text();
      return c.html(html);
    }
    return c.notFound();
  });
}

const port = Number.parseInt(process.env.API_PORT || "49382", 10);
const hostname = process.env.HOST || "localhost";

export const server = Bun.serve({
  port,
  hostname,
  fetch: app.fetch,
});

export default {
  port,
  fetch: app.fetch,
};
