import type { Express } from "express";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "./errorHandler";

const appThrowing = (error: Error): Express => {
  const app = express();
  app.get("/", () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
};

const httpError = (status: number, message: string, expose: boolean): Error =>
  Object.assign(new Error(message), { status, expose });

describe("errorHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides an unexpected error's message and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(appThrowing(new Error("database exploded"))).get(
      "/",
    );

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Something went wrong." });
    expect(log).toHaveBeenCalledOnce();
  });

  it("returns an exposed client error's message without logging it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(
      appThrowing(httpError(400, "Name is required", true)),
    ).get("/");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Name is required" });
    expect(log).not.toHaveBeenCalled();
  });

  it("keeps a non-exposed error's message private but uses its status", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(
      appThrowing(httpError(503, "upstream credentials rejected", false)),
    ).get("/");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: "Something went wrong." });
    expect(log).toHaveBeenCalledOnce();
  });
});
