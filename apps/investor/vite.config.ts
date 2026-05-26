import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  server: { port: 4322 },
  resolve: {
    alias: { "~": path.resolve(import.meta.dirname, "./src") },
  },
  plugins: [tailwindcss(), TanStackRouterVite({ target: "react" }), tanstackStart(), viteReact()],
});
