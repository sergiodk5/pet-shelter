import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../../app.fixtures";
import { ids } from "./pets.fixtures";

let server: Server;
let close: () => Promise<void>;

beforeAll(async () => {
  const testApp = await createTestApp();

  server = await testApp.serverWith();
  close = testApp.close;
});

afterAll(() => close());

describe("GET /pets", () => {
  it("returns every pet when no filter is given", async () => {
    const res = await request(server).get("/pets");

    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual([1, 2, 3]);
  });

  it.each([
    { query: "species=cat", expected: [2, 3] },
    { query: "species=CAT", expected: [2, 3] },
    { query: "adopted=true", expected: [2, 3] },
    { query: "adopted=TRUE", expected: [2, 3] },
    { query: "adopted=false", expected: [1] },
    { query: "minAge=2&maxAge=2", expected: [2] },
    { query: "minAge=6", expected: [3] },
    { query: "species=cat&adopted=true", expected: [2, 3] },
    { query: "species=dog&species=cat", expected: [2, 3] },
    { query: "species=parrot", expected: [] },
  ])("filters with ?$query", async ({ query, expected }) => {
    const res = await request(server).get(`/pets?${query}`);

    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(expected);
  });

  it.each([
    { query: "adopted=maybe", message: "adopted must be 'true' or 'false'." },
    { query: "minAge=abc", message: "minAge must be a number." },
    { query: "maxAge=abc", message: "maxAge must be a number." },
  ])("rejects ?$query with 400", async ({ query, message }) => {
    const res = await request(server).get(`/pets?${query}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message });
  });

  it.each(["species=", "adopted=", "minAge=", "maxAge="])(
    "treats the blank filter ?%s as absent",
    async (query) => {
      const res = await request(server).get(`/pets?${query}`);

      expect(res.status).toBe(200);
      expect(ids(res.body)).toEqual([1, 2, 3]);
    },
  );

  it("returns pets in id order even after one has been updated", async () => {
    // Postgres rewrites an updated row at the end of the heap, so a SELECT
    // without ORDER BY returns 2,3,1 here. Writing the pet back unchanged keeps
    // every other assertion in this file valid.
    const bella = await request(server).get("/pets/1");
    const { id: _id, ...unchanged } = bella.body;

    const put = await request(server).put("/pets/1").send(unchanged);

    expect(put.status).toBe(200);

    const res = await request(server).get("/pets");

    expect(ids(res.body)).toEqual([1, 2, 3]);
  });

  it("derives adoption status from adoptionDate, not a stored flag", async () => {
    const res = await request(server).get("/pets");

    for (const pet of res.body) {
      expect(pet).not.toHaveProperty("adopted");
    }
  });
});

describe("GET /pets/:id", () => {
  it("returns an adopted pet with its adoption date", async () => {
    const res = await request(server).get("/pets/2");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 2,
      name: "Milo",
      adoptionDate: "2024-03-10T00:00:00.000Z",
    });
  });

  it("returns an available pet without an adoption date", async () => {
    const res = await request(server).get("/pets/1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: "Bella" });
    expect(res.body).not.toHaveProperty("adoptionDate");
  });

  it("returns 404 when no pet has that id", async () => {
    const res = await request(server).get("/pets/999");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "No pet found." });
  });

  it.each(["abc", "-1", "1.5"])("rejects id %s with 400", async (id) => {
    const res = await request(server).get(`/pets/${id}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Pet ID must be a positive integer." });
  });
});
