import cors from "cors";
import type { Express } from "express";
import express from "express";
import helmet from "helmet";
import type { Db } from "./config/db";
import type { AppConfig } from "./config/env";
import { createPetsControllers } from "./modules/pets/pets.controllers";
import { createPetsRepository } from "./modules/pets/pets.repositories";
import { createPetRouter } from "./modules/pets/pets.routes";
import { errorHandler } from "./shared/middleware/errorHandler";
import { notFound } from "./shared/middleware/notFound";

export const createApp = (config: AppConfig, db: Db): Express => {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    }),
  );

  app.use(express.json());

  app.use(
    "/pets",
    createPetRouter(createPetsControllers(createPetsRepository(db))),
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
