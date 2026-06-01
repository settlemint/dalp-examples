import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  server: { port: 4322 },
  resolve: {
    alias: { "~": path.resolve(import.meta.dirname, "./src") },
  },
  // `nitro()` turns the build into a deployable server bundle. It auto-detects
  // the host: on Vercel it emits `.vercel/output` serverless functions (full
  // SSR + server functions); locally it defaults to a Node server in `.output/`.
  plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
});
