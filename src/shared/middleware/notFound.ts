import type { Request, Response } from "express";
import { NotFoundError } from "../errors/httpError";

/** Terminal 404 — mounted after every route, before the error handler. */
export const notFound = (_req: Request, _res: Response): void => {
  throw new NotFoundError("No route found.");
};
