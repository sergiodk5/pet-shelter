import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      // Without `include`, only files the tests import are reported; setting it makes
      // untested source files show up at 0% instead of silently disappearing.
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts"],
    },
  },
});
