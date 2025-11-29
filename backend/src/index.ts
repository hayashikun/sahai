import { Hono } from "hono";
import { runMigrations } from "./db/client";
import projects from "./routes/projects";

runMigrations();

const app = new Hono();

app.get("/", (c) => {
  return c.json({ message: "Hello from Hono!" });
});

app.get("/v1/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/v1/projects", projects);

export default {
  port: 3001,
  fetch: app.fetch,
};
