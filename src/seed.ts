import { faker } from "@faker-js/faker";
import { sql } from "drizzle-orm";
import { createDb } from "./config/db";
import { loadConfig, loadDatabaseUrl } from "./config/env";
import type { PetInsert } from "./modules/pets/pets.seed";
import { demoPets, seedPets } from "./modules/pets/pets.seed";
import { petsTable } from "./modules/pets/pets.table";

/** Fixed, so `npm run db:seed` produces the same shelter every time. */
const FAKER_SEED = 20260918;
const RANDOM_PETS = 50;

/**
 * Four species, each with a breed generator and a plausible weight range.
 * `faker.animal.type()` has 44 values, which is too varied to demonstrate the
 * `?species=` filter against.
 */
const KINDS = [
  { species: "Dog", breed: () => faker.animal.dog(), minKg: 2, maxKg: 40 },
  { species: "Cat", breed: () => faker.animal.cat(), minKg: 2, maxKg: 8 },
  { species: "Rabbit", breed: () => faker.animal.rabbit(), minKg: 1, maxKg: 3 },
  { species: "Bird", breed: () => faker.animal.bird(), minKg: 0.1, maxKg: 1.5 },
];

const VACCINES = [
  "Rabies",
  "Distemper",
  "Parvovirus",
  "Bordetella",
  "Leptospirosis",
];

const makePet = (): PetInsert => {
  const kind = faker.helpers.arrayElement(KINDS);
  const intakeDate = faker.date.past({ years: 3 });

  return {
    name: faker.person.firstName(),
    species: kind.species,
    breed: kind.breed(),
    age: faker.number.int({ min: 0, max: 15 }),
    intakeDate,
    ...(faker.datatype.boolean({ probability: 0.4 }) && {
      adoptionDate: faker.date.between({ from: intakeDate, to: new Date() }),
    }),
    photo: `https://picsum.photos/id/${faker.number.int({ min: 1, max: 999 })}/200/300`,
    weightKg: faker.number.float({
      min: kind.minKg,
      max: kind.maxKg,
      fractionDigits: 1,
    }),
    // UNIQUE in the database, so a uuid rather than a short code.
    microchipId: faker.datatype.boolean({ probability: 0.6 })
      ? faker.string.uuid()
      : null,
    vaccinations: faker.helpers.arrayElements(VACCINES, { min: 0, max: 3 }),
  };
};

const main = async (): Promise<void> => {
  const { nodeEnv } = loadConfig();

  if (nodeEnv === "production") {
    throw new Error(
      "db:seed empties every table it touches. It refuses to run in production.",
    );
  }

  const { db, close } = createDb(loadDatabaseUrl());

  try {
    faker.seed(FAKER_SEED);

    await db.execute(sql`TRUNCATE TABLE ${petsTable} RESTART IDENTITY CASCADE`);
    await seedPets(db);
    await db
      .insert(petsTable)
      .values(Array.from({ length: RANDOM_PETS }, makePet));

    console.log(`Seeded ${demoPets.length + RANDOM_PETS} pets.`);
  } finally {
    await close();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
