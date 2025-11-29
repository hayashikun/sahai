import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ message: "Hello from Hono!" });
});

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

export default {
  port: 3001,
  fetch: app.fetch,
};
