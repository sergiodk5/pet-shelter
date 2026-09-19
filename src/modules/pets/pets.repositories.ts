import { and, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { ConflictError } from "../../shared/errors/httpError";
import type { Db } from "../../config/db";
import { petsTable } from "./pets.table";
import type { NewPet, Pet, PetUpdate } from "./pets.types";
import type { PetFilters } from "./pets.validators";

type PetRow = typeof petsTable.$inferSelect;

const UNIQUE_VIOLATION = "23505";

const rethrow = (error: unknown): never => {
  const { code, constraint } = ((error as { cause?: unknown }).cause ??
    error) as { code?: unknown; constraint?: unknown };

  if (code === UNIQUE_VIOLATION && constraint === "pets_microchip_id_unique") {
    throw new ConflictError("microchipId is already registered.");
  }

  throw error;
};

const toPet = (row: PetRow): Pet => ({
  id: row.id,
  name: row.name,
  species: row.species,
  breed: row.breed,
  age: row.age,
  intakeDate: row.intakeDate,
  ...(row.adoptionDate !== null && { adoptionDate: row.adoptionDate }),
  microchipId: row.microchipId,
  medicalRecord: {
    vaccinations: row.vaccinations,
    weightKg: row.weightKg,
  },
  photo: row.photo,
});

const toRow = (pet: PetUpdate) => ({
  name: pet.name,
  species: pet.species,
  breed: pet.breed,
  age: pet.age,
  intakeDate: pet.intakeDate,
  adoptionDate: pet.adoptionDate ?? null,
  vaccinations: pet.medicalRecord.vaccinations,
  weightKg: pet.medicalRecord.weightKg,
  microchipId: pet.microchipId,
  photo: pet.photo,
});

export class PetsRepository {
  constructor(private readonly db: Db) {}

  async findPets(filters: PetFilters): Promise<Pet[]> {
    const conditions = [
      filters.species === undefined
        ? undefined
        : sql`lower(${petsTable.species}) = ${filters.species}`,
      filters.adopted === undefined
        ? undefined
        : filters.adopted
          ? isNotNull(petsTable.adoptionDate)
          : isNull(petsTable.adoptionDate),
      filters.minAge === undefined
        ? undefined
        : gte(petsTable.age, filters.minAge),
      filters.maxAge === undefined
        ? undefined
        : lte(petsTable.age, filters.maxAge),
    ].filter((condition) => condition !== undefined);

    const rows = await this.db
      .select()
      .from(petsTable)
      .where(and(...conditions))
      .orderBy(petsTable.id);

    return rows.map(toPet);
  }

  async findPetById(id: number): Promise<Pet | undefined> {
    const rows = await this.db
      .select()
      .from(petsTable)
      .where(eq(petsTable.id, id));

    return rows[0] === undefined ? undefined : toPet(rows[0]);
  }

  async addPet(newPet: NewPet): Promise<Pet> {
    try {
      const rows = await this.db
        .insert(petsTable)
        .values(toRow(newPet))
        .returning();

      return toPet(rows[0]!);
    } catch (error) {
      return rethrow(error);
    }
  }

  async updatePet(id: number, update: PetUpdate): Promise<Pet | undefined> {
    try {
      const rows = await this.db
        .update(petsTable)
        .set(toRow(update))
        .where(eq(petsTable.id, id))
        .returning();

      return rows[0] === undefined ? undefined : toPet(rows[0]);
    } catch (error) {
      return rethrow(error);
    }
  }

  async removePet(id: number): Promise<boolean> {
    const rows = await this.db
      .delete(petsTable)
      .where(eq(petsTable.id, id))
      .returning();

    return rows.length > 0;
  }
}
