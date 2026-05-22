import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    tanstackStart(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "~": new URL("./src", import.meta.url).pathname,
    },
  },
});
