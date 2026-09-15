import type { Request } from "express";

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
