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
import { errorHandler } from "./errorHandler";

let thrown: Error;

const app = express();

app.get("/", () => {
  throw thrown;
});

app.use(errorHandler);

const httpError = (status: number, message: string, expose: boolean): Error =>
  Object.assign(new Error(message), { status, expose });

let server: Server;

beforeAll(async () => {
  server = await listen(app);
});

afterAll(() => closeServer(server));

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
