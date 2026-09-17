import type { Db } from "../../config/db";
import { petsTable } from "./pets.table";

/** A body that satisfies every rule - tests break exactly one thing against it. */
export const validPetBody = {
  name: "Luna",
  species: "Dog",
  breed: "Beagle",
  age: 2,
  medicalRecord: {
    vaccinations: ["Rabies"],
    weightKg: 9.2,
    microchipId: null,
  },
  photo: "https://picsum.photos/id/240/200/300",
};

/** PUT sends the whole pet, so `intakeDate` is required rather than defaulted. */
export const validReplacementBody = {
  ...validPetBody,
  intakeDate: "2024-06-15",
};

/**
 * A valid body with the parts a test doesn't care about already filled in.
 *
 * Use this when the data is irrelevant ("a pet, any pet"); write the value out
 * literally when the data *is* the point (`name: "  Luna  "` for trimming).
 * Deliberately deterministic - random fixtures force tautological assertions
 * like `toBe(pet.name)`, which pass even if the API never stored anything.
 */
export const makePetBody = (
  overrides: Partial<typeof validPetBody> = {},
): typeof validPetBody => ({ ...validPetBody, ...overrides });

let chipCounter = 0;

/**
 * `microchip_id` is UNIQUE in the database, so a test that needs two pets with
 * real chip ids must not reuse one. A counter rather than randomness, so a
 * failure is reproducible.
 */
export const nextMicrochipId = (): string => `CHIP-${++chipCounter}`;

export const ids = (body: Array<{ id: number }>): number[] =>
  body.map((pet) => pet.id);

/**
 * The three demo pets the suite asserts against: ids 1-3, Bella available, Milo
 * and Blacky adopted. Inserted into an empty table, so the identity column hands
 * out 1, 2, 3 in order.
 *
 * These are also what `npm run db:seed` puts in a dev database, so the two can
 * never drift.
 */
export const seedPets = async (db: Db): Promise<void> => {
  await db.insert(petsTable).values([
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
      weightKg: 18.4,
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
      weightKg: 18.4,
      microchipId: null,
      vaccinations: ["Rabies", "Distemper", "Parvovirus"],
    },
  ]);
};
