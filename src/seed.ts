import { database } from "./config/database";
import { loadConfig } from "./config/env";
import { petsSeeder } from "./modules/pets/pets.seed";
import { runSeeders } from "./shared/seeding";

const seeders = [petsSeeder];

const main = async (): Promise<void> => {
  const { nodeEnv } = loadConfig();

  if (nodeEnv === "production") {
    throw new Error(
      "db:seed empties every table it touches. It refuses to run in production.",
    );
  }

  try {
    const total = await runSeeders(database.db, seeders);

    console.log(`Seeded ${total} rows.`);
  } finally {
    await database.close();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
