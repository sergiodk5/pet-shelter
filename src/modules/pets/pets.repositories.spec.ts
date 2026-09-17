import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../config/db";
import { createTestDb } from "../../config/db.fixtures";
import { ConflictError } from "../../shared/errors/httpError";
import { createPetsRepository } from "./pets.repositories";
import type { NewPet } from "./pets.types";

let database: Database;
let repository: ReturnType<typeof createPetsRepository>;

beforeAll(async () => {
  database = await createTestDb();
  repository = createPetsRepository(database.db);
});

afterAll(() => database.close());

const newPet: NewPet = {
  name: "Luna",
  species: "Dog",
  breed: "Beagle",
  age: 2,
  intakeDate: new Date("2024-06-15"),
  microchipId: null,
  medicalRecord: { vaccinations: ["Rabies"], weightKg: 9.2 },
  photo: "p",
};

/**
 * Driven below HTTP on purpose. Every CHECK constraint is shadowed by Zod, so a
 * non-unique database error cannot be provoked through a request - which is the
 * two-layer design working, and also why this case needs its own spec.
 */
describe("createPetsRepository error mapping", () => {
  it("turns a duplicate microchip id into a ConflictError", async () => {
    await repository.addPet({ ...newPet, microchipId: "CHIP-A" });

    await expect(
      repository.addPet({ ...newPet, microchipId: "CHIP-A" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("leaves any other database error alone, so it stays a 500", async () => {
    // `age: -1` breaks the CHECK constraint. Mislabelling it as a conflict would
    // report a server fault as a client mistake and hide it from the logs.
    await expect(
      repository.addPet({ ...newPet, age: -1 }),
    ).rejects.not.toBeInstanceOf(ConflictError);
  });
});
