import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const Dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT) || 49381,
    host: process.env.HOST || "localhost",
  },
  resolve: {
    alias: {
      shared: resolve(Dirname, "../shared"),
      "@": resolve(Dirname, "./src"),
    },
  },
});
