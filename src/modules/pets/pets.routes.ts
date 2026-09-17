import type { Router } from "express";
import express from "express";
import type { PetsControllers } from "./pets.controllers";
import { validateNumericId } from "./pets.middleware";

export const createPetRouter = (controllers: PetsControllers): Router => {
  const petRouter = express.Router();

  petRouter.get("/", controllers.getPets);

  petRouter.post("/", controllers.createPet);

  petRouter.get("/:id", validateNumericId, controllers.getPetById);

  petRouter.put("/:id", validateNumericId, controllers.replacePet);

  petRouter.delete("/:id", validateNumericId, controllers.deletePet);

  return petRouter;
};
