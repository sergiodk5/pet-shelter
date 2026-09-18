import { createDb } from "./config/db";
import { loadConfig, loadDatabaseUrl } from "./config/env";
import { petsSeeder } from "./modules/pets/pets.seed";
import { runSeeders } from "./shared/seeding";

/**
 * One line per module, and nothing about what any of them contain. Order
 * matters: a seeder may reference ids an earlier one wrote.
 */
const seeders = [petsSeeder];

const main = async (): Promise<void> => {
  const { nodeEnv } = loadConfig();

  if (nodeEnv === "production") {
    throw new Error(
      "db:seed empties every table it touches. It refuses to run in production.",
    );
  }

  const { db, close } = createDb(loadDatabaseUrl());

  try {
    const total = await runSeeders(db, seeders);

    console.log(`Seeded ${total} rows.`);
  } finally {
    await close();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
