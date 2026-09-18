import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "../config/db";

export type Seeder = {
  name: string;
  tables: PgTable[];
  run: (db: Db) => Promise<number>;
};

export const runSeeders = async (
  db: Db,
  seeders: Seeder[],
): Promise<number> => {
  const tables = seeders.flatMap((seeder) => seeder.tables);

  if (tables.length > 0) {
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
