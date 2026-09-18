import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { petsTable } from "../modules/pets/pets.table";

export const schema = { pets: petsTable };

export type Db = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

export type Database = {
  db: Db;
  /**
   * Runs a trivial query, so a bad `DATABASE_URL` fails at boot rather than on
   * the first request. `new Pool()` connects lazily and would otherwise stay
   * silent until someone hit an endpoint.
   */
  ping: () => Promise<void>;
  close: () => Promise<void>;
};

export const createDb = (url: string): Database => {
  // Without a connection timeout the pool waits forever, which turns an
  // unreachable host into a hung boot instead of a failed one.
  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: 5000,
  });
  const db = drizzle(pool, { schema });

  return {
    db,
    ping: async () => {
      await db.execute(sql`select 1`);
    },
    close: () => pool.end(),
  };
};
