import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app";

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
