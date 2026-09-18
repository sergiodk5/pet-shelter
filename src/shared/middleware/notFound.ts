import type { Request, Response } from "express";
import { NotFoundError } from "../errors/httpError";

export const notFound = (_req: Request, _res: Response): void => {
  throw new NotFoundError("No route found.");
};
