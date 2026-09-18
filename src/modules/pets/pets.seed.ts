import type { Db } from "../../config/db";
import type { Seeder } from "../../shared/seeding";
import { petsTable } from "./pets.table";

/** The row shape `INSERT` accepts - id and defaults optional. */
export type PetInsert = typeof petsTable.$inferInsert;

/**
 * The three demo pets the suite asserts against: ids 1-3, Bella available, Milo
 * and Blacky adopted. Inserted into an empty table, so the identity column hands
 * out 1, 2, 3 in order.
 *
 * This file is built, unlike `pets.fixtures.ts`, which `tsconfig.build.json`
 * excludes - so `src/seed.ts` can reach it and the dev database and the test
 * database cannot drift apart.
 */
export const demoPets: PetInsert[] = [
  {
    name: "Bella",
    species: "Dog",
    breed: "Border Collie",
    age: 3,
    intakeDate: new Date("2024-06-15"),
    photo: "https://picsum.photos/id/237/200/300",
    weightKg: 18.4,
    microchipId: null,
    vaccinations: ["Rabies", "Distemper", "Parvovirus"],
  },
  {
    name: "Milo",
    species: "Cat",
    breed: "Siamese",
    age: 2,
    intakeDate: new Date("2024-01-01"),
    adoptionDate: new Date("2024-03-10"),
    photo: "https://picsum.photos/id/238/200/300",
    weightKg: 4.5,
    microchipId: null,
    vaccinations: ["Rabies", "Distemper", "Parvovirus"],
  },
  {
    name: "Blacky",
    species: "Cat",
    breed: "Street",
    age: 6,
    intakeDate: new Date("2020-05-15"),
    adoptionDate: new Date("2021-02-20"),
    photo: "https://picsum.photos/id/239/200/300",
    weightKg: 4.2,
    microchipId: null,
    vaccinations: ["Rabies", "Distemper", "Parvovirus"],
  },
];

export const seedPets = async (db: Db): Promise<void> => {
  await db.insert(petsTable).values(demoPets);
};

/** Fixed, so `npm run db:seed` produces the same shelter every time. */
const FAKER_SEED = 20260918;
const RANDOM_PETS = 50;

/**
 * Every generated date is relative to this rather than to `new Date()`. Seeding
 * the PRNG is not enough on its own: `date.past()` and `date.between({ to: now })`
 * are anchored to the current time, so two runs a millisecond apart produce
 * different timestamps. The cost is that the demo shelter does not age.
 */
const REFERENCE_DATE = new Date("2026-09-18T00:00:00.000Z");

const VACCINES = [
  "Rabies",
  "Distemper",
  "Parvovirus",
  "Bordetella",
  "Leptospirosis",
];

/**
 * Faker is imported here rather than at the top of the file on purpose. Every
 * spec file reaches this module for `seedPets`, faker costs ~65ms to load, and
 * no test uses it - loading it up top puts ~0.6s on a 2.4s suite for nothing.
 * `await import()` also keeps a devDependency out of the module's static
 * imports, which is the same reason n8n's modules import their optional
 * services that way.
 */
const makeRandomPets = async (count: number): Promise<PetInsert[]> => {
  const { faker } = await import("@faker-js/faker");

  faker.seed(FAKER_SEED);
  faker.setDefaultRefDate(REFERENCE_DATE);

  // Four species with a matching breed generator and a plausible weight range.
  // `faker.animal.type()` has 44 values, which is too varied to demonstrate the
  // `?species=` filter against.
  const kinds = [
    { species: "Dog", breed: () => faker.animal.dog(), minKg: 2, maxKg: 40 },
    { species: "Cat", breed: () => faker.animal.cat(), minKg: 2, maxKg: 8 },
    {
      species: "Rabbit",
      breed: () => faker.animal.rabbit(),
      minKg: 1,
      maxKg: 3,
    },
    {
      species: "Bird",
      breed: () => faker.animal.bird(),
      minKg: 0.1,
      maxKg: 1.5,
    },
  ];

  return Array.from({ length: count }, (): PetInsert => {
    const kind = faker.helpers.arrayElement(kinds);
    const intakeDate = faker.date.past({ years: 3 });

    return {
      name: faker.person.firstName(),
      species: kind.species,
      breed: kind.breed(),
      age: faker.number.int({ min: 0, max: 15 }),
      intakeDate,
      ...(faker.datatype.boolean({ probability: 0.4 }) && {
        adoptionDate: faker.date.between({
          from: intakeDate,
          to: REFERENCE_DATE,
        }),
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
  });
};

/** What this module contributes to `npm run db:seed`. */
export const petsSeeder: Seeder = {
  name: "pets",
  tables: [petsTable],
  run: async (db) => {
    await seedPets(db);

    const random = await makeRandomPets(RANDOM_PETS);
    await db.insert(petsTable).values(random);

    return demoPets.length + random.length;
  },
};
