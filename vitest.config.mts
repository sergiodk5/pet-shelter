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
      exclude: [
        "src/**/*.spec.ts",
        // The entrypoint: `loadConfig()`, `createApp()` and `listen()`. Covering it
        // would mean binding a port, which is exactly what the app.ts / server.ts
        // split exists to avoid. Revisit if it ever grows real logic — graceful
        // shutdown, signal handling — since that logic would then go unmeasured.
        "src/server.ts",
        // Type-only modules compile to an empty file, so there is nothing to
        // measure. v8 records 0 of 0, which the json reporter renders as 100%
        // and the HTML reporter as 0% — noise either way. Excluding them assumes
        // `*.types.ts` really does hold only types (§2.3); put runtime code
        // somewhere else, or it goes unmeasured.
        "src/**/*.types.ts",
      ],
    },
  },
});
