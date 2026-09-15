import type { Request, Response } from "express";
import type { ErrorResponse } from "../../shared/types/api.types";
import { pets } from "./pets.repositories";
import type { Pet } from "./pets.types";
import { parseFilters } from "./pets.validators";

// Adoption status is derived, not stored: a pet is adopted once it has an adoption date.
const isAdopted = (pet: Pet): boolean => pet.adoptionDate !== undefined;

export const getPets = (
  req: Request,
  res: Response<Pet[] | ErrorResponse>,
): void => {
  const parsed = parseFilters(req.query);

  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const { species, adopted, minAge, maxAge } = parsed.filters;

  res.json(
    pets.filter(
      (pet: Pet): boolean =>
        (species === undefined || pet.species.toLowerCase() === species) &&
        (adopted === undefined || isAdopted(pet) === adopted) &&
        (minAge === undefined || pet.age >= minAge) &&
        (maxAge === undefined || pet.age <= maxAge),
    ),
  );
};

export const getPetById = (
  req: Request<{ id: string }>,
  res: Response<Pet | ErrorResponse>,
): void => {
  const { id } = req.params;
  const pet: Pet | undefined = pets.find(
    (pet: Pet): boolean => pet.id === Number(id),
  );

  if (!pet) {
    res.status(404).json({ message: "No pet found." });
    return;
  }

  res.json(pet);
};
