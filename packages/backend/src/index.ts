import { Hono } from "hono";
import { cors } from "hono/cors";
import { runMigrations } from "./db/client";
import projectRepositories from "./routes/project-repositories";
import projects from "./routes/projects";
import repositories from "./routes/repositories";
import { repositoryTasks, taskById } from "./routes/tasks";

runMigrations();

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "http://localhost:3000",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/", (c) => {
  return c.json({ message: "Hello from Hono!" });
});

app.get("/v1/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/v1/projects", projects);
app.route("/v1/projects", projectRepositories);
app.route("/v1/repositories", repositories);
app.route("/v1/repositories", repositoryTasks);
app.route("/v1/tasks", taskById);

export default {
  port: 3001,
  fetch: app.fetch,
};
