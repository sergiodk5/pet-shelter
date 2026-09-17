import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { petsTable } from "../modules/pets/pets.table";

export const schema = { pets: petsTable };

export type Db = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

export type Database = {
  db: Db;
  close: () => Promise<void>;
};

export const createDb = (url: string): Database => {
  const pool = new Pool({ connectionString: url });

  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
};
