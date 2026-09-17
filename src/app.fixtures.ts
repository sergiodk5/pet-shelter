import type { Express } from "express";
import { createApp } from "./app";
import type { Db } from "./config/db";
import { createTestDb } from "./config/db.fixtures";
import { loadConfig } from "./config/env";
import { seedPets } from "./modules/pets/pets.fixtures";

export type TestApp = {
  /** Builds an app on this database. Pass env vars to vary the configuration. */
  appWith: (env?: NodeJS.ProcessEnv) => Express;
  db: Db;
  close: () => Promise<void>;
};

/**
 * One migrated, seeded database for a spec file, plus a factory for apps that
 * use it. Call this in `beforeAll` and `close()` in `afterAll`.
 *
 * Database and app are separate because `app.spec.ts` needs several apps with
 * different CORS settings sharing one database. Every spec file gets its own
 * instance, which is what preserves the per-file isolation the suite relies on.
 */
export const createTestApp = async (): Promise<TestApp> => {
  const { db, close } = await createTestDb();

  await seedPets(db);

  return {
    appWith: (env: NodeJS.ProcessEnv = {}) => createApp(loadConfig(env), db),
    db,
    close,
  };
};
