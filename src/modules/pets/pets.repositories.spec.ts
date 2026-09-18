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

describe("createPetsRepository error mapping", () => {
  it("turns a duplicate microchip id into a ConflictError", async () => {
    await repository.addPet({ ...newPet, microchipId: "CHIP-A" });

    await expect(
      repository.addPet({ ...newPet, microchipId: "CHIP-A" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("leaves any other database error alone, so it stays a 500", async () => {
    await expect(
      repository.addPet({ ...newPet, age: -1 }),
    ).rejects.not.toBeInstanceOf(ConflictError);
  });
});
