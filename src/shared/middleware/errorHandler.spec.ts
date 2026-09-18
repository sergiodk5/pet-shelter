import type { Server } from "node:http";
import express from "express";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { errorHandler } from "./errorHandler";

/** Set by each test; the route below throws whatever it holds. */
let thrown: Error;

/**
 * One throwaway app, listening once for the whole file. Building an app per
 * test made `supertest` bind a fresh ephemeral port for every request — see
 * `app.fixtures.ts` for why that is worth avoiding.
 */
const app = express();

app.get("/", () => {
  throw thrown;
});

app.use(errorHandler);

const httpError = (status: number, message: string, expose: boolean): Error =>
  Object.assign(new Error(message), { status, expose });

let server: Server;

// Awaited, not fire-and-forget: supertest treats a server whose `address()` is
// still null as one it owns, and closes it after that request.
beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        resolve();
      });
    }),
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    }),
);

describe("errorHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides an unexpected error's message and logs it", async () => {
    thrown = new Error("database exploded");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(server).get("/");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Something went wrong." });
    expect(log).toHaveBeenCalledOnce();
  });

  it("returns an exposed client error's message without logging it", async () => {
    thrown = httpError(400, "Name is required", true);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(server).get("/");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Name is required" });
    expect(log).not.toHaveBeenCalled();
  });

  it("keeps a non-exposed error's message private but uses its status", async () => {
    thrown = httpError(503, "upstream credentials rejected", false);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(server).get("/");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: "Something went wrong." });
    expect(log).toHaveBeenCalledOnce();
  });
});
