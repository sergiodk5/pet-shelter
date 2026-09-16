import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/errorHandler";
import { BadRequestError, HttpError } from "./httpError";

/** A throwaway app whose only route throws the give error. */
const appThrowing = (error: Error): express.Express => {
  const app = express();

  app.get("/sync", () => {
    throw error;
  });

  app.get("/async", async () => {
    await Promise.resolve();
    throw error;
  });

  app.use(errorHandler);

  return app;
};

describe("HttpError", () => {
  it("reaches the client as a 400 with its own message", async () => {
    const res = await request(
      appThrowing(new BadRequestError("name must be a non-empty string.")),
    ).get("/sync");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "name must be a non-empty string." });
  });

  it("works the same when thrown from an async handler", async () => {
    const res = await request(
      appThrowing(new BadRequestError("age must be an integer.")),
    ).get("/async");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "age must be an integer." });
  });

  it("keeps a 5xx message private and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await request(
      appThrowing(new HttpError(503, "upstream credentials rejected")),
    ).get("/sync");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: "Something went wrong." });
    expect(log).toHaveBeenCalledOnce();
  });

  it("does not log 4xx as a server fault", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await request(appThrowing(new BadRequestError("nope"))).get("/sync");

    expect(log).not.toHaveBeenCalled();
  });

  it("is still a real Error after transpilation", () => {
    const err = new BadRequestError("x");

    expect(err).toBeInstanceOf(BadRequestError);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toBeInstanceOf(Error);
    expect(err.stack).toBeDefined();
  });
});
