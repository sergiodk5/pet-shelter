import cors from "cors";
import type { Express } from "express";
import express from "express";
import helmet from "helmet";
import type { AppConfig } from "./config/env";
import { petRouter } from "./modules/pets/pets.module";
import { errorHandler } from "./shared/middleware/errorHandler";
import { notFound } from "./shared/middleware/notFound";

export const createApp = (config: AppConfig): Express => {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    }),
  );

  app.use(express.json());

  app.use("/pets", petRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
