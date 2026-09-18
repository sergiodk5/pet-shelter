import { sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Database } from "../config/db";
import { createTestDb } from "../config/db.fixtures";
import type { Seeder } from "./seeding";
import { runSeeders } from "./seeding";

const owners = pgTable("seeding_spec_owners", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull(),
});

const toys = pgTable("seeding_spec_toys", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => owners.id),
});

let database: Database;

beforeAll(async () => {
  database = await createTestDb();

  await database.db.execute(sql`
    create table seeding_spec_owners (
      id integer primary key generated always as identity,
      name text not null
    )
  `);
  await database.db.execute(sql`
    create table seeding_spec_toys (
      id integer primary key generated always as identity,
      owner_id integer not null references seeding_spec_owners(id)
    )
  `);
});

afterAll(() => database.close());

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

const ownerSeeder = (names: string[]): Seeder => ({
  name: "owners",
  tables: [owners],
  run: async (db) => {
    await db.insert(owners).values(names.map((name) => ({ name })));

    return names.length;
  },
});

const toySeeder: Seeder = {
  name: "toys",
  tables: [toys],
  run: async (db) => {
    const rows = await db.select().from(owners);

    if (rows.length === 0) {
      return 0;
    }
    await db.insert(toys).values(rows.map((row) => ({ ownerId: row.id })));

    return rows.length;
  },
};

describe("runSeeders", () => {
  it("returns the total number of rows written", async () => {
    const total = await runSeeders(database.db, [
      ownerSeeder(["Ada", "Grace"]),
      toySeeder,
    ]);

    expect(total).toBe(4);
  });

  it("empties the tables first, so a second run does not stack up", async () => {
    await runSeeders(database.db, [ownerSeeder(["Ada", "Grace"])]);
    await runSeeders(database.db, [ownerSeeder(["Ada", "Grace"])]);

    const rows = await database.db.select().from(owners);

    expect(rows).toHaveLength(2);
  });

  it("restarts the identity, so ids are stable between runs", async () => {
    await runSeeders(database.db, [ownerSeeder(["Ada"])]);
    const first = await database.db.select().from(owners);

    await runSeeders(database.db, [ownerSeeder(["Ada"])]);
    const second = await database.db.select().from(owners);

    expect(second.map((row) => row.id)).toEqual(first.map((row) => row.id));
    expect(second[0]?.id).toBe(1);
  });

  it("empties every table in one statement, so foreign keys allow it", async () => {
    await runSeeders(database.db, [ownerSeeder(["Ada"]), toySeeder]);

    await expect(
      runSeeders(database.db, [ownerSeeder(["Ada"]), toySeeder]),
    ).resolves.toBe(2);
  });

  it("runs the seeders in the order they are listed", async () => {
    await runSeeders(database.db, [toySeeder, ownerSeeder(["Ada"])]);

    expect(await database.db.select().from(toys)).toHaveLength(0);

    await runSeeders(database.db, [ownerSeeder(["Ada"]), toySeeder]);

    expect(await database.db.select().from(toys)).toHaveLength(1);
  });

  it("does nothing at all when handed no seeders", async () => {
    await runSeeders(database.db, [ownerSeeder(["Ada"])]);

    await expect(runSeeders(database.db, [])).resolves.toBe(0);
    expect(await database.db.select().from(owners)).toHaveLength(1);
  });
});
