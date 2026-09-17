import { and, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { ConflictError } from "../../shared/errors/httpError";
import type { Db } from "../../config/db";
import { petsTable } from "./pets.table";
import type { NewPet, Pet, PetUpdate } from "./pets.types";
import type { PetFilters } from "./pets.validators";

type PetRow = typeof petsTable.$inferSelect;

/** Postgres SQLSTATE for a unique constraint breach. */
const UNIQUE_VIOLATION = "23505";

/**
 * A constraint breach arrives as an opaque driver error, which `errorHandler`
 * would report as a 500 - our fault, for what is a client mistake. Translate the
 * one we can explain and let anything else stay a 500.
 *
 * Duck-typed on `code` rather than `instanceof`: both drivers surface the
 * Postgres wire-protocol fields, and pglite's error class name is minified.
 */
const rethrow = (error: unknown): never => {
  // Drizzle wraps driver errors in a DrizzleQueryError and puts the original in
  // `cause`, so the Postgres fields sit one level down.
  const { code, constraint } = ((error as { cause?: unknown }).cause ??
    error) as { code?: unknown; constraint?: unknown };

  if (code === UNIQUE_VIOLATION && constraint === "pets_microchip_id_unique") {
    throw new ConflictError("microchipId is already registered.");
  }

  throw error;
};

/**
 * The table is flat; `Pet` nests `medicalRecord`. This is the only place that
 * knows the difference.
 *
 * `adoptionDate` is spread conditionally on purpose: SQL says `null`, `Pet` says
 * *absent*. Assigning `null` would make `adoptionDate !== undefined` true, so an
 * available pet would report as adopted and would serialize as
 * `"adoptionDate": null`.
 */
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

/** `NewPet` is assignable to `PetUpdate`, so one direction covers both writes. */
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

export const createPetsRepository = (db: Db) => ({
  findPets: async (filters: PetFilters): Promise<Pet[]> => {
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

    const rows = await db
      .select()
      .from(petsTable)
      .where(and(...conditions))
      .orderBy(petsTable.id);

    return rows.map(toPet);
  },

  findPetById: async (id: number): Promise<Pet | undefined> => {
    const rows = await db.select().from(petsTable).where(eq(petsTable.id, id));

    return rows[0] === undefined ? undefined : toPet(rows[0]);
  },

  addPet: async (newPet: NewPet): Promise<Pet> => {
    try {
      const rows = await db.insert(petsTable).values(toRow(newPet)).returning();

      return toPet(rows[0]!);
    } catch (error) {
      return rethrow(error);
    }
  },

  updatePet: async (
    id: number,
    update: PetUpdate,
  ): Promise<Pet | undefined> => {
    try {
      const rows = await db
        .update(petsTable)
        .set(toRow(update))
        .where(eq(petsTable.id, id))
        .returning();

      return rows[0] === undefined ? undefined : toPet(rows[0]);
    } catch (error) {
      return rethrow(error);
    }
  },

  removePet: async (id: number): Promise<boolean> => {
    const rows = await db
      .delete(petsTable)
      .where(eq(petsTable.id, id))
      .returning();

    return rows.length > 0;
  },
});

export type PetsRepository = ReturnType<typeof createPetsRepository>;
