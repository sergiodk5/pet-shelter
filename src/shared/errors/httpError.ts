/**
 * An error that already knows how it should reach the client.
 *
 * `errorHandler` reads `status` and `expose` (the http-errors convention that
 * Express and body-parser already follow), so throwing one of these anywhere in
 * a request produces the right response with no extra wiring.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly expose: boolean;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.expose = status < 500;
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = "BadRequestError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
    this.name = "NotFoundError";
  }
}
