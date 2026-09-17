import type { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors/httpError";
import type { PetsRepository } from "./pets.repositories";
import type { Pet } from "./pets.types";
import {
  parseFilters,
  parseNewPet,
  parseReplacementPet,
} from "./pets.validators";

export const createPetsControllers = (repository: PetsRepository) => ({
  getPets: async (req: Request, res: Response<Pet[]>): Promise<void> => {
    res.json(await repository.findPets(parseFilters(req.query)));
  },

  getPetById: async (
    req: Request<{ id: string }>,
    res: Response<Pet>,
  ): Promise<void> => {
    const pet = await repository.findPetById(Number(req.params.id));

    if (!pet) {
      throw new NotFoundError("No pet found.");
    }

    res.json(pet);
  },

  createPet: async (req: Request, res: Response<Pet>): Promise<void> => {
    const pet = await repository.addPet(parseNewPet(req.body));

    res.status(201).location(`/pets/${pet.id}`).json(pet);
  },

  replacePet: async (
    req: Request<{ id: string }>,
    res: Response<Pet>,
  ): Promise<void> => {
    const pet = await repository.updatePet(
      Number(req.params.id),
      parseReplacementPet(req.body),
    );

    if (!pet) {
      throw new NotFoundError("No pet found.");
    }

    res.json(pet);
  },

  deletePet: async (
    req: Request<{ id: string }>,
    res: Response<never>,
  ): Promise<void> => {
    if (!(await repository.removePet(Number(req.params.id)))) {
      throw new NotFoundError("No pet found.");
    }

    res.status(204).end();
  },
});

export type PetsControllers = ReturnType<typeof createPetsControllers>;
