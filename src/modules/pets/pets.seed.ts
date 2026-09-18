import type { Db } from "../../config/db";
import { petsTable } from "./pets.table";

/** The row shape `INSERT` accepts - id and defaults optional. */
export type PetInsert = typeof petsTable.$inferInsert;

/**
 * The three demo pets the suite asserts against: ids 1-3, Bella available, Milo
 * and Blacky adopted. Inserted into an empty table, so the identity column hands
 * out 1, 2, 3 in order.
 *
 * This file is built, unlike `pets.fixtures.ts`, which `tsconfig.build.json`
 * excludes - so `src/seed.ts` can import it and the dev database and the test
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
