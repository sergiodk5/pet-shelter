import { database } from "../../config/database";
import { PetsController } from "./pets.controllers";
import { PetsRepository } from "./pets.repositories";
import { createPetRouter } from "./pets.routes";

const repository = new PetsRepository(database.db);
const controller = new PetsController(repository);

export const petRouter = createPetRouter(controller);
