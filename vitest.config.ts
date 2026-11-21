import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// "@/" mirrors tsconfig paths so route handlers can be imported by the all-routes privacy test
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
