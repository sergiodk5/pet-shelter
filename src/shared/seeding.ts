import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "../config/db";

/**
 * What a module contributes to `npm run db:seed`. Each module exports one and
 * owns everything in it, so `src/seed.ts` never learns what a pet is.
 */
export type Seeder = {
  /** The module's name, printed in the run output. */
  name: string;
  /** Emptied before anything is inserted. */
  tables: PgTable[];
  /** Returns how many rows it wrote. */
  run: (db: Db) => Promise<number>;
};

/**
 * Empties every table the seeders own, then runs them **in order** — a later
 * module may reference ids an earlier one wrote.
 */
export const runSeeders = async (
  db: Db,
  seeders: Seeder[],
): Promise<number> => {
  const tables = seeders.flatMap((seeder) => seeder.tables);

  if (tables.length > 0) {
    // One statement naming every table, so a foreign key between two of them
    // does not dictate the order they are emptied in. RESTART IDENTITY so the
    // seeded ids are 1, 2, 3 again on every run.
    await db.execute(
      sql`TRUNCATE TABLE ${sql.join(tables, sql`, `)} RESTART IDENTITY CASCADE`,
    );
  }

  let total = 0;

  for (const seeder of seeders) {
    const rows = await seeder.run(db);

    console.log(`${seeder.name}: ${rows} rows`);
    total += rows;
  }

  return total;
};
