import type { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../../shared/errors/httpError";

export const validateNumericId = (
  req: Request<{ id: string }>,
  _res: Response,
  next: NextFunction,
): void => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    throw new BadRequestError("Pet ID must be a positive integer.");
  }

  next();
};
