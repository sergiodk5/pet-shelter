import type { Request } from "express";
import { z } from "zod";
import { BadRequestError } from "../../shared/errors/httpError";
import type { NewPet, PetUpdate } from "./pets.types";

const formatIssue = (issue: z.ZodError["issues"][number]): string => {
  if (issue.path.length === 0) {
    return issue.message;
  }

  const path = issue.path
    .map((segment) =>
      typeof segment === "number" ? `[${segment}]` : `.${String(segment)}`,
    )
    .join("")
    .replace(/^\./, "");

  return `${path} ${issue.message}`;
};

const parseOrThrow = <T extends z.ZodType>(schema: T, input: unknown) => {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new BadRequestError(formatIssue(result.error.issues[0]));
  }

  return result.data;
};

export type PetFilters = {
  species?: string;
  adopted?: boolean;
  minAge?: number;
  maxAge?: number;
};

const queryParam = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => {
    const raw = Array.isArray(value) ? value.at(-1) : value;

    return typeof raw === "string" && raw.trim() !== "" ? raw : undefined;
  }, schema.optional());

const lowerCase = z.string().transform((value) => value.toLowerCase());

const petFiltersSchema = z.object({
  species: queryParam(lowerCase),
  adopted: queryParam(
    lowerCase
      .pipe(z.enum(["true", "false"], { error: "must be 'true' or 'false'." }))
      .transform((value) => value === "true"),
  ),
  minAge: queryParam(z.coerce.number({ error: "must be a number." })),
  maxAge: queryParam(z.coerce.number({ error: "must be a number." })),
});

export const parseFilters = (query: Request["query"]): PetFilters =>
  parseOrThrow(petFiltersSchema, query);

const nonEmptyString = z
  .string({ error: "must be a non-empty string." })
  .trim()
  .min(1, { error: "must be a non-empty string." });

const serverOwned = z
  .never({ error: "is assigned by the shelter." })
  .optional();

const dateString = z
  .string({ error: "must be a date string." })
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    error: "must be a valid date.",
  })
  .transform((value) => new Date(value));

const medicalRecordSchema = z.object(
  {
    vaccinations: z.array(nonEmptyString, {
      error: "must be an array of strings.",
    }),
    weightKg: z
      .number({ error: "must be a number greater than 0." })
      .positive({ error: "must be a number greater than 0." }),
  },
  { error: "must be a JSON object." },
);

const newPetSchema = z.object(
  {
    id: serverOwned,
    adoptionDate: serverOwned,

    name: nonEmptyString,
    species: nonEmptyString,
    breed: nonEmptyString,
    age: z
      .int({ error: "must be an integer of 0 or more." })
      .min(0, { error: "must be an integer of 0 or more." }),
    intakeDate: dateString.default(() => new Date()),
    medicalRecord: medicalRecordSchema,
    photo: nonEmptyString,
    microchipId: z
      .union([z.string(), z.null()], { error: "must be a string or null." })
      .default(null),
  },
  { error: "Request body must be a JSON object." },
);

const replacePetSchema = newPetSchema.extend({
  intakeDate: dateString,
  adoptionDate: dateString.nullish().transform((value) => value ?? undefined),
});

export const parseNewPet = (body: unknown): NewPet =>
  parseOrThrow(newPetSchema, body);

export const parseReplacementPet = (body: unknown): PetUpdate =>
  parseOrThrow(replacePetSchema, body);
