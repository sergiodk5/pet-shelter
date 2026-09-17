import type { Router } from "express";
import express from "express";
import {
  createPet,
  deletePet,
  getPetById,
  getPets,
  replacePet,
} from "./pets.controllers";
import { validateNumericId } from "./pets.middleware";

export const petRouter: Router = express.Router();

petRouter.get("/", getPets);

petRouter.post("/", createPet);

petRouter.get("/:id", validateNumericId, getPetById);

petRouter.put("/:id", validateNumericId, replacePet);

petRouter.delete("/:id", validateNumericId, deletePet);
