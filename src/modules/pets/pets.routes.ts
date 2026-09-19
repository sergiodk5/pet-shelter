import type { Router } from "express";
import express from "express";
import type { PetsController } from "./pets.controllers";
import { validateNumericId } from "./pets.middleware";

export const createPetRouter = (controller: PetsController): Router => {
  const router = express.Router();

  router.get("/", controller.getPets);

  router.post("/", controller.createPet);

  router.get("/:id", validateNumericId, controller.getPetById);

  router.put("/:id", validateNumericId, controller.replacePet);

  router.delete("/:id", validateNumericId, controller.deletePet);

  return router;
};
