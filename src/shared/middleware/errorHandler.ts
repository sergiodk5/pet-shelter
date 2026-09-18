import type { NextFunction, Request, Response } from "express";
import type { ErrorResponse } from "../types/api.types";

/** Express detects error handlers by arity: all four parameters are required. */
export const errorHandler = (
  err: Error & { status?: number; expose?: boolean },
  _req: Request,
  res: Response<ErrorResponse>,
  _next: NextFunction,
): void => {
  const status = err.status ?? 500;

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    message: err.expose ? err.message : "Something went wrong.",
  });
};
