import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Playwright owns `e2e/`; vitest's default include would otherwise match its .spec.ts files.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
