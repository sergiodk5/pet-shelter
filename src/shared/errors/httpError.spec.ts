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
import { closeServer, listen } from "../http.fixtures";
import { errorHandler } from "../middleware/errorHandler";
import { BadRequestError, HttpError } from "./httpError";

let thrown: Error;

const app = express();

app.get("/sync", () => {
  throw thrown;
});

app.get("/async", async () => {
  await Promise.resolve();
  throw thrown;
});

app.use(errorHandler);

let server: Server;

beforeAll(async () => {
  server = await listen(app);
});

afterAll(() => closeServer(server));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpError", () => {
  it("reaches the client as a 400 with its own message", async () => {
    thrown = new BadRequestError("name must be a non-empty string.");

    const res = await request(server).get("/sync");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "name must be a non-empty string." });
  });

  it("works the same when thrown from an async handler", async () => {
    thrown = new BadRequestError("age must be an integer.");

    const res = await request(server).get("/async");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "age must be an integer." });
  });

  it("keeps a 5xx message private and logs it", async () => {
    thrown = new HttpError(503, "upstream credentials rejected");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(server).get("/sync");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: "Something went wrong." });
    expect(log).toHaveBeenCalledOnce();
  });

  it("does not log 4xx as a server fault", async () => {
    thrown = new BadRequestError("nope");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await request(server).get("/sync");

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
