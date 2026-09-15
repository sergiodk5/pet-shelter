import type { Request, Response } from "express";
import type { ErrorResponse } from "../types/api.types";

/** Terminal 404 — mounted after every route, before the error handler. */
export const notFound = (_req: Request, res: Response<ErrorResponse>): void => {
  res.status(404).json({ message: "No route found." });
};
