import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Component render tests (.test.tsx): tsconfig keeps "jsx": "preserve" for Next.js.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
