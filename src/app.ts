import cors from "cors";
import type { Express } from "express";
import express from "express";
import helmet from "helmet";
import type { AppConfig } from "./config/env";
import { petRouter } from "./modules/pets/pets.routes";
import { errorHandler } from "./shared/middleware/errorHandler";
import { notFound } from "./shared/middleware/notFound";

/**
 * Builds the Express app without listening, so tests can drive it with any
 * configuration and without binding a port. `server.ts` owns `listen()`.
 */
export const createApp = (config: AppConfig): Express => {
  const app = express();

  app.use(helmet());

  // An empty allowlist means no cross-origin browser access at all. The origins
  // are passed as an array on purpose: a custom origin function that calls
  // `callback(new Error(...))` would turn a disallowed origin into a 500, while
  // an array simply leaves the Access-Control-Allow-Origin header off.
  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    }),
  );

  app.use(express.json());

  app.use("/pets", petRouter);

  // Terminal handlers — order matters: 404 first, error handler last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
};
