import type { NextFunction, Request, Response } from "express";
import type { ErrorResponse } from "../types/api.types";

/**
 * Terminal error handler. Must keep all four parameters — Express identifies
 * error handlers by arity, and dropping `_next` silently turns this back into
 * ordinary middleware that never sees an error.
 *
 * Honours the `http-errors` contract that Express and body-parser already use:
 * `status` carries the right code, `expose` says whether the message is safe
 * to show the client.
 */
export const errorHandler = (
  err: Error & { status?: number; expose?: boolean },
  _req: Request,
  res: Response<ErrorResponse>,
  _next: NextFunction,
): void => {
  const status = err.status ?? 500;

  // Client mistakes (4xx) are not server faults — don't log them as such.
  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    message: err.expose ? err.message : "Something went wrong.",
  });
};
