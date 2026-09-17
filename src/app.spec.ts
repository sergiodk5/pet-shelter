import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TestApp } from "./app.fixtures";
import { createTestApp } from "./app.fixtures";

const allowed = "https://shelter.example";
const alsoAllowed = "http://localhost:5173";

let testApp: TestApp;
/** No CORS_ORIGINS - the deny-by-default app. */
let app: Express;
/** Both origins above allowed. Shares one database with `app`. */
let configured: Express;

beforeAll(async () => {
  testApp = await createTestApp();

  app = testApp.appWith();
  configured = testApp.appWith({ CORS_ORIGINS: `${allowed},${alsoAllowed}` });
});

afterAll(() => testApp.close());

describe("security headers", () => {
  it("does not advertise Express", async () => {
    const res = await request(app).get("/pets");

    expect(res.headers).not.toHaveProperty("x-powered-by");
  });

  it("sets Helmet's default headers", async () => {
    const res = await request(app).get("/pets");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain(
      "default-src 'self'",
    );
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
    expect(res.headers).toHaveProperty("referrer-policy");
    expect(res.headers).toHaveProperty("x-frame-options");
  });
});

describe("CORS", () => {
  it.each([allowed, alsoAllowed])(
    "allows a listed origin (%s)",
    async (origin) => {
      const res = await request(configured).get("/pets").set("Origin", origin);

      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
    },
  );

  it("sends no allow-origin header for an unlisted origin", async () => {
    const res = await request(configured)
      .get("/pets")
      .set("Origin", "https://evil.example");

    expect(res.status).toBe(200);
    expect(res.headers).not.toHaveProperty("access-control-allow-origin");
  });

  it("blocks every origin when the allowlist is empty", async () => {
    const res = await request(app).get("/pets").set("Origin", allowed);

    expect(res.status).toBe(200);
    expect(res.headers).not.toHaveProperty("access-control-allow-origin");
  });

  it("serves requests that send no Origin at all (curl, tests, same-origin)", async () => {
    const res = await request(app).get("/pets");

    expect(res.status).toBe(200);
    expect(res.headers).not.toHaveProperty("access-control-allow-origin");
  });

  it("answers a preflight from a listed origin", async () => {
    const res = await request(configured)
      .options("/pets")
      .set("Origin", allowed)
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(allowed);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("refuses a preflight from an unlisted origin", async () => {
    const res = await request(configured)
      .options("/pets")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");

    expect(res.headers).not.toHaveProperty("access-control-allow-origin");
  });
});

describe("app", () => {
  it("returns a JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "No route found." });
  });

  it("returns 400 for a malformed JSON body", async () => {
    const res = await request(app)
      .post("/pets")
      .set("Content-Type", "application/json")
      .send('{"a":,}');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not valid JSON/);
  });

  it("returns 413 for a body over the 100kb limit", async () => {
    const res = await request(app)
      .post("/pets")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ a: "x".repeat(200 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ message: "request entity too large" });
  });
});
