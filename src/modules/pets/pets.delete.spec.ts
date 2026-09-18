import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../../app.fixtures";
import { ids, validPetBody } from "./pets.fixtures";

let server: Server;
let close: () => Promise<void>;

beforeAll(async () => {
  const testApp = await createTestApp();

  server = await testApp.serverWith();
  close = testApp.close;
});

afterAll(() => close());

/** A fresh pet per test, so nothing depends on which test ran first. */
const givenAPet = async (): Promise<number> => {
  const res = await request(server).post("/pets").send(validPetBody);

  return res.body.id;
};

describe("DELETE /pets/:id", () => {
  it("returns 204 with no body", async () => {
    const id = await givenAPet();

    const res = await request(server).delete(`/pets/${id}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(res.headers).not.toHaveProperty("content-type");
  });

  it("removes the pet", async () => {
    const id = await givenAPet();
    await request(server).delete(`/pets/${id}`);

    const res = await request(server).get(`/pets/${id}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "No pet found." });
  });

  it("removes the pet from the collection", async () => {
    const id = await givenAPet();
    expect(ids((await request(server).get("/pets")).body)).toContain(id);

    await request(server).delete(`/pets/${id}`);

    expect(ids((await request(server).get("/pets")).body)).not.toContain(id);
  });

  it("leaves every other pet alone", async () => {
    const doomed = await givenAPet();
    const survivor = await givenAPet();

    await request(server).delete(`/pets/${doomed}`);

    const res = await request(server).get(`/pets/${survivor}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(survivor);
  });

  it("returns 404 when the pet is already gone", async () => {
    const id = await givenAPet();
    await request(server).delete(`/pets/${id}`);

    const res = await request(server).delete(`/pets/${id}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "No pet found." });
  });

  it("returns 404 for an id that never existed", async () => {
    const res = await request(server).delete("/pets/99999");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "No pet found." });
  });

  it.each(["abc", "-1", "1.5"])("rejects id %s with 400", async (id) => {
    const res = await request(server).delete(`/pets/${id}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Pet ID must be a positive integer." });
  });

  it("never reuses the id of a deleted pet", async () => {
    const deleted = await givenAPet();
    await request(server).delete(`/pets/${deleted}`);

    const created = await givenAPet();

    expect(created).not.toBe(deleted);
    expect(created).toBeGreaterThan(deleted);
  });
});
