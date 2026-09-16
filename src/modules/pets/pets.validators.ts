import type { Request } from "express";
import { BadRequestError } from "../../shared/errors/httpError";
import type { MedicalRecord, NewPet } from "./pets.types";

const ALLOWED_FIELDS = new Set([
  "name",
  "species",
  "breed",
  "age",
  "intakeDate",
  "medicalRecord",
  "photo",
]);

/** The shelter owns these - a client may not send them. */
const SERVER_OWNED_FIELDS = ["id", "adoptionDate"] as const;

export type PetFilters = {
  species?: string;
  adopted?: boolean;
  minAge?: number;
  maxAge?: number;
};

const single = (v: unknown): string | undefined => {
  const raw = Array.isArray(v) ? v.at(-1) : v;

  return typeof raw === "string" && raw.trim() !== "" ? raw : undefined;
};

export const parseFilters = (
  query: Request["query"],
): { filters: PetFilters } | { error: string } => {
  const filters: PetFilters = {};

  const species = single(query.species);
  if (species) {
    filters.species = species.toLowerCase();
  }

  const adopted = single(query.adopted)?.toLowerCase();
  if (adopted !== undefined) {
    if (adopted !== "true" && adopted !== "false") {
      return { error: "adopted must be 'true' or 'false'." };
    }

    filters.adopted = adopted === "true";
  }

  for (const key of ["minAge", "maxAge"] as const) {
    const raw = single(query[key]);
    if (raw === undefined) continue;

    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return { error: `${key} must be a number.` };
    }

    filters[key] = n;
  }

  return { filters };
};

/** Only plain JSON objects: `null` and arrays are `typeof "object"` too. */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/** Returns the trimmed string, or throws with a message naming the field. */
const requireNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`${field} must be a non-empty string.`);
  }

  return value.trim();
};

const requireNonNegativeInteger = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new BadRequestError(`${field} must be an integer of 0 or more.`);
  }

  return value;
};

const requirePositiveNumber = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestError(`${field} must be a number greater than 0.`);
  }

  return value;
};

/** Absent means "arriving today". Present must be a parseable date string. */
const parseIntakeDate = (value: unknown): Date => {
  if (value === undefined) {
    return new Date();
  }

  if (typeof value !== "string") {
    throw new BadRequestError("intakeDate must be a date string.");
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError("intakeDate must be a valid date.");
  }
  return date;
};

const parseMedicalRecord = (value: unknown): MedicalRecord => {
  if (!isRecord(value)) {
    throw new BadRequestError("medicalRecord must be a JSON object.");
  }

  if (!Array.isArray(value.vaccinations)) {
    throw new BadRequestError(
      "medicalRecord.vaccinations must be an array of strings.",
    );
  }

  const vaccinations = value.vaccinations.map(
    (vaccination: unknown, index: number): string =>
      requireNonEmptyString(
        vaccination,
        `medicalRecord.vaccinations[${index}]`,
      ),
  );

  const weightKg = requirePositiveNumber(
    value.weightKg,
    "medicalRecord.weightKg",
  );

  const microchipId = value.microchipId ?? null;

  if (microchipId !== null && typeof microchipId !== "string") {
    throw new BadRequestError(
      "medicalRecord.microchipId must be a string or null.",
    );
  }

  return { vaccinations, weightKg, microchipId };
};

export const parseNewPet = (body: unknown): NewPet => {
  if (!isRecord(body)) {
    throw new BadRequestError("Request body must be a JSON object.");
  }

  for (const field of SERVER_OWNED_FIELDS) {
    if (field in body) {
      throw new BadRequestError(`${field} is assigned by the shelter.`);
    }
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new BadRequestError(`Unknown field: ${key}.`);
    }
  }

  return {
    name: requireNonEmptyString(body.name, "name"),
    species: requireNonEmptyString(body.species, "species"),
    breed: requireNonEmptyString(body.breed, "breed"),
    age: requireNonNegativeInteger(body.age, "age"),
    intakeDate: parseIntakeDate(body.intakeDate),
    medicalRecord: parseMedicalRecord(body.medicalRecord),
    photo: requireNonEmptyString(body.photo, "photo"),
  };
};
