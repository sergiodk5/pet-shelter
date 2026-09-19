import type { Request, Response } from "express";
import { NotFoundError } from "../../shared/errors/httpError";
import type { PetsRepository } from "./pets.repositories";
import type { Pet } from "./pets.types";
import {
  parseFilters,
  parseNewPet,
  parseReplacementPet,
} from "./pets.validators";

export class PetsController {
  constructor(private readonly repository: PetsRepository) {}

  readonly getPets = async (
    req: Request,
    res: Response<Pet[]>,
  ): Promise<void> => {
    res.json(await this.repository.findPets(parseFilters(req.query)));
  };

  readonly getPetById = async (
    req: Request<{ id: string }>,
    res: Response<Pet>,
  ): Promise<void> => {
    const pet = await this.repository.findPetById(Number(req.params.id));

    if (!pet) {
      throw new NotFoundError("No pet found.");
    }

    res.json(pet);
  };

  readonly createPet = async (
    req: Request,
    res: Response<Pet>,
  ): Promise<void> => {
    const pet = await this.repository.addPet(parseNewPet(req.body));

    res.status(201).location(`/pets/${pet.id}`).json(pet);
  };

  readonly replacePet = async (
    req: Request<{ id: string }>,
    res: Response<Pet>,
  ): Promise<void> => {
    const pet = await this.repository.updatePet(
      Number(req.params.id),
      parseReplacementPet(req.body),
    );

    if (!pet) {
      throw new NotFoundError("No pet found.");
    }

    res.json(pet);
  };

  readonly deletePet = async (
    req: Request<{ id: string }>,
    res: Response<never>,
  ): Promise<void> => {
    if (!(await this.repository.removePet(Number(req.params.id)))) {
      throw new NotFoundError("No pet found.");
    }

    res.status(204).end();
  };
}
