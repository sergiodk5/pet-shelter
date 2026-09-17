import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../../app.fixtures";
import {
  ids,
  validPetBody,
  validReplacementBody as valid,
} from "./pets.fixtures";

let app: Express;
let close: () => Promise<void>;

beforeAll(async () => {
  const testApp = await createTestApp();

  app = testApp.appWith();
  close = testApp.close;
});

afterAll(() => close());

/** A fresh pet per test, so nothing depends on which test ran first. */
const givenAPet = async (): Promise<number> => {
  const res = await request(app).post("/pets").send(validPetBody);

  return res.body.id;
};

describe("PUT /pets/:id", () => {
  it("replaces the whole pet and returns what was stored", async () => {
    const id = await givenAPet();

    const res = await request(app)
      .put(`/pets/${id}`)
      .send({ ...valid, name: "Renamed", age: 7 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id,
      name: "Renamed",
      species: valid.species,
      breed: valid.breed,
      age: 7,
      intakeDate: "2024-06-15T00:00:00.000Z",
      medicalRecord: valid.medicalRecord,
      photo: valid.photo,
    });
  });

  it("persists the replacement", async () => {
    const id = await givenAPet();
    await request(app)
      .put(`/pets/${id}`)
      .send({ ...valid, name: "Renamed" });

    const res = await request(app).get(`/pets/${id}`);

    expect(res.body.name).toBe("Renamed");
  });

  it("keeps the intakeDate that was sent instead of resetting it to now", async () => {
    const id = await givenAPet();

    const res = await request(app).put(`/pets/${id}`).send(valid);

    expect(res.body.intakeDate).toBe("2024-06-15T00:00:00.000Z");
  });

  it("adopts a pet when adoptionDate is sent", async () => {
    const id = await givenAPet();

    const res = await request(app)
      .put(`/pets/${id}`)
      .send({ ...valid, adoptionDate: "2026-09-17" });

    expect(res.status).toBe(200);
    expect(res.body.adoptionDate).toBe("2026-09-17T00:00:00.000Z");

    const adopted = await request(app).get("/pets?adopted=true");

    expect(ids(adopted.body)).toContain(id);
  });

  it.each([
    ["null", null],
    ["omitted", undefined],
  ])(
    "returns a pet to the shelter when adoptionDate is %s",
    async (_label, adoptionDate) => {
      const id = await givenAPet();
      await request(app)
        .put(`/pets/${id}`)
        .send({ ...valid, adoptionDate: "2026-09-17" });

      const res = await request(app)
        .put(`/pets/${id}`)
        .send({ ...valid, adoptionDate });

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty("adoptionDate");

      const available = await request(app).get("/pets?adopted=false");

      expect(ids(available.body)).toContain(id);
    },
  );

  it("trims surrounding whitespace", async () => {
    const id = await givenAPet();

    const res = await request(app)
      .put(`/pets/${id}`)
      .send({ ...valid, name: "  Luna  " });

    expect(res.body.name).toBe("Luna");
  });

  it("drops unknown keys", async () => {
    const id = await givenAPet();

    const res = await request(app)
      .put(`/pets/${id}`)
      .send({ ...valid, colour: "brown" });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("colour");
  });

  it("returns 404 for an unknown id, and creates nothing", async () => {
    const before = await request(app).get("/pets");

    const res = await request(app).put("/pets/99999").send(valid);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "No pet found." });

    const after = await request(app).get("/pets");

    expect(after.body).toHaveLength(before.body.length);
  });

  it.each(["abc", "-1", "1.5"])("rejects id %s with 400", async (id) => {
    const res = await request(app).put(`/pets/${id}`).send(valid);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Pet ID must be a positive integer." });
  });

  it("validates the body before checking that the pet exists", async () => {
    const res = await request(app).put("/pets/99999").send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "name must be a non-empty string." });
  });
});

const rejections: { label: string; body: object; message: string }[] = [
  {
    label: "a client-supplied id",
    body: { ...valid, id: 99 },
    message: "id is assigned by the shelter.",
  },
  {
    label: "a missing intakeDate",
    body: { ...valid, intakeDate: undefined },
    message: "intakeDate must be a date string.",
  },
  {
    label: "a null intakeDate",
    body: { ...valid, intakeDate: null },
    message: "intakeDate must be a date string.",
  },
  {
    label: "an unparseable adoptionDate",
    body: { ...valid, adoptionDate: "nope" },
    message: "adoptionDate must be a valid date.",
  },
  {
    label: "a numeric adoptionDate",
    body: { ...valid, adoptionDate: 1234 },
    message: "adoptionDate must be a date string.",
  },
  {
    label: "a blank name",
    body: { ...valid, name: "   " },
    message: "name must be a non-empty string.",
  },
  {
    label: "a fractional age",
    body: { ...valid, age: 1.5 },
    message: "age must be an integer of 0 or more.",
  },
  {
    label: "a null medicalRecord",
    body: { ...valid, medicalRecord: null },
    message: "medicalRecord must be a JSON object.",
  },
  {
    label: "an array body",
    body: [],
    message: "Request body must be a JSON object.",
  },
  {
    label: "an empty body",
    body: {},
    message: "name must be a non-empty string.",
  },
];

describe("PUT /pets/:id rejections", () => {
  it.each(rejections)("rejects $label with 400", async ({ body, message }) => {
    const id = await givenAPet();

    const res = await request(app).put(`/pets/${id}`).send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message });
  });
});
