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
        // The entrypoint: `loadConfig()`, `createApp()`, `listen()` and the signal
        // handlers. Covering it would mean binding a port, which is exactly what the
        // app.ts / server.ts split exists to avoid. The rule this exclusion depends
        // on: `server.ts` stays wiring. When graceful shutdown arrived it went to
        // `shared/shutdown.ts` precisely so it would stay measured — put the next
        // piece of real logic there too, not here.
        "src/server.ts",
        // The dev seed script and every module's seed data, for the same reason:
        // they are a command and its input, not part of the API. What they
        // produce is demo content, and a break is loud - `npm run db:seed` fails
        // on the spot. The machinery they share, `shared/seeding.ts`, is *not*
        // excluded: it issues SQL the application never issues (a multi-table
        // TRUNCATE) and its failure arrives later, when a second module lands.
        "src/seed.ts",
        "src/**/*.seed.ts",
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
