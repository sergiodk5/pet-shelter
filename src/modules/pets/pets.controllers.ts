import type { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors/httpError";
import {
  addPet,
  findPetById,
  pets,
  removePet,
  updatePet,
} from "./pets.repositories";
import type { Pet } from "./pets.types";
import {
  parseFilters,
  parseNewPet,
  parseReplacementPet,
} from "./pets.validators";

// Adoption status is derived, not stored: a pet is adopted once it has an adoption date.
const isAdopted = (pet: Pet): boolean => pet.adoptionDate !== undefined;

export const getPets = (req: Request, res: Response<Pet[]>): void => {
  const { species, adopted, minAge, maxAge } = parseFilters(req.query);

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
  res: Response<Pet>,
): void => {
  const pet = findPetById(Number(req.params.id));

  if (!pet) {
    throw new NotFoundError("No pet found.");
  }

  res.json(pet);
};

export const createPet = (req: Request, res: Response<Pet>): void => {
  const pet = addPet(parseNewPet(req.body));

  res.status(201).location(`/pets/${pet.id}`).json(pet);
};

export const replacePet = (
  req: Request<{ id: string }>,
  res: Response<Pet>,
): void => {
  const pet = updatePet(Number(req.params.id), parseReplacementPet(req.body));

  if (!pet) {
    throw new NotFoundError("No pet found.");
  }

  res.json(pet);
};

export const deletePet = (
  req: Request<{ id: string }>,
  res: Response<never>,
): void => {
  if (!removePet(Number(req.params.id))) {
    throw new NotFoundError("No pet found.");
  }

  res.status(204).end();
};
