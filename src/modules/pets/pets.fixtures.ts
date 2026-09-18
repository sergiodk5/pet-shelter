/** A body that satisfies every rule - tests break exactly one thing against it. */
export const validPetBody = {
  name: "Luna",
  species: "Dog",
  breed: "Beagle",
  age: 2,
  microchipId: null,
  medicalRecord: {
    vaccinations: ["Rabies"],
    weightKg: 9.2,
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

export { seedPets } from "./pets.seed";
