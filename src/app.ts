import cors from "cors";
import type { Express } from "express";
import express from "express";
import { petRouter } from "./modules/pets/pets.routes";
import { errorHandler } from "./shared/middleware/errorHandler";
import { notFound } from "./shared/middleware/notFound";

export const app: Express = express();

app.use(cors());
app.use(express.json());

app.use("/pets", petRouter);

// Terminal handlers — order matters: 404 first, error handler last.
app.use(notFound);
app.use(errorHandler);
