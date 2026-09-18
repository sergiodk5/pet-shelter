import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./db";
import { schema } from "./db";

/**
 * A real Postgres for one spec file: in-process, migrated, nothing running.
 * Each file gets its own, so the per-file isolation the suite already depends
 * on survives the move off the in-memory array.
 */
export const createTestDb = async (): Promise<Database> => {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: "migrations" });

  return {
    db,
    ping: async () => {
      await db.execute(sql`select 1`);
    },
    close: () => client.close(),
  };
};
