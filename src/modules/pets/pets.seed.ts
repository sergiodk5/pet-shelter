import type { Db } from "../../config/db";
import type { Seeder } from "../../shared/seeding";
import { petsTable } from "./pets.table";

export type PetInsert = typeof petsTable.$inferInsert;

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

const FAKER_SEED = 20260918;
const RANDOM_PETS = 50;

// faker.seed() fixes the PRNG but not the clock; date.past() is relative to now.
const REFERENCE_DATE = new Date("2026-09-18T00:00:00.000Z");

const VACCINES = [
  "Rabies",
  "Distemper",
  "Parvovirus",
  "Bordetella",
  "Leptospirosis",
];

// Imported lazily: every spec file reaches this module, and none of them seeds.
const makeRandomPets = async (count: number): Promise<PetInsert[]> => {
  const { faker } = await import("@faker-js/faker");

  faker.seed(FAKER_SEED);
  faker.setDefaultRefDate(REFERENCE_DATE);

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
      microchipId: faker.datatype.boolean({ probability: 0.6 })
        ? faker.string.uuid()
        : null,
      vaccinations: faker.helpers.arrayElements(VACCINES, { min: 0, max: 3 }),
    };
  });
};

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
