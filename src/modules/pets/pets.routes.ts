import type { Router } from "express";
import express from "express";
import { getPetById, getPets } from "./pets.controllers";
import { validateNumericId } from "./pets.middleware";

export const petRouter: Router = express.Router();

petRouter.get("/", getPets);

petRouter.get("/:id", validateNumericId, getPetById);
