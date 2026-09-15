import type { NextFunction, Request, Response } from "express";
import type { ErrorResponse } from "../../shared/types/api.types";

export const validateNumericId = (
  req: Request<{ id: string }>,
  res: Response<ErrorResponse>,
  next: NextFunction,
): void => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    res.status(400).json({ message: "Pet ID must be a positive integer." });
    return;
  }

  next();
};
