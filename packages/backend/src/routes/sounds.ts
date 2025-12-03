import { Hono } from "hono";
import { getAvailableSounds, playSound } from "../config/sounds";

const app = new Hono();

// GET /v1/sounds - Get available system sounds
app.get("/", async (c) => {
  const sounds = await getAvailableSounds();
  return c.json({
    sounds,
    platform: process.platform,
  });
});

// POST /v1/sounds/play - Play a sound
app.post("/play", async (c) => {
  const body = await c.req.json();
  const { sound } = body as { sound: string };

  if (!sound) {
    return c.json({ success: false, error: "Sound name is required" }, 400);
  }

  try {
    await playSound(sound);
    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

export default app;
