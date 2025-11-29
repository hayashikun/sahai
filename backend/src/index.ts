import { Hono } from "hono";
import { runMigrations } from "./db/client";
import projectRepositories from "./routes/project-repositories";
import projects from "./routes/projects";
import repositories from "./routes/repositories";

runMigrations();

const app = new Hono();

app.get("/", (c) => {
  return c.json({ message: "Hello from Hono!" });
});

app.get("/v1/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/v1/projects", projects);
app.route("/v1/projects", projectRepositories);
app.route("/v1/repositories", repositories);

export default {
  port: 3001,
  fetch: app.fetch,
};
