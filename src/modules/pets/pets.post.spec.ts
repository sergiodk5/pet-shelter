import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../../app.fixtures";
import {
  ids,
  nextMicrochipId,
  validPetBody as validPet,
} from "./pets.fixtures";

let server: Server;
let close: () => Promise<void>;

beforeAll(async () => {
  const testApp = await createTestApp();

  server = await testApp.serverWith();
  close = testApp.close;
});

afterAll(() => close());

describe("POST /pets", () => {
  it("creates a pet and returns the stored record", async () => {
    const res = await request(server).post("/pets").send(validPet);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject(validPet);
    expect(typeof res.body.id).toBe("number");
  });

  it("points Location at the new pet", async () => {
    const res = await request(server).post("/pets").send(validPet);

    expect(res.headers.location).toBe(`/pets/${res.body.id}`);
  });

  it("assigns a distinct id to each pet", async () => {
    const first = await request(server).post("/pets").send(validPet);
    const second = await request(server).post("/pets").send(validPet);

    expect(second.body.id).not.toBe(first.body.id);
  });

  it("stores the pet so it can be fetched afterwards", async () => {
    const created = await request(server).post("/pets").send(validPet);
    const fetched = await request(server).get(`/pets/${created.body.id}`);

    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);
  });

  it("includes the new pet in the collection", async () => {
    const created = await request(server).post("/pets").send(validPet);
    const all = await request(server).get("/pets");

    expect(ids(all.body)).toContain(created.body.id);
  });

  it("creates the pet as available for adoption", async () => {
    const created = await request(server).post("/pets").send(validPet);
    const available = await request(server).get(`/pets?adopted=false`);

    expect(created.body).not.toHaveProperty("adoptionDate");
    expect(ids(available.body)).toContain(created.body.id);
  });

  it("defaults intakeDate to the moment of intake", async () => {
    const before = Date.now();
    const res = await request(server).post("/pets").send(validPet);
    const intake = Date.parse(res.body.intakeDate);

    expect(intake).toBeGreaterThanOrEqual(before);
    expect(intake).toBeLessThanOrEqual(Date.now());
  });

  it("keeps an explicitly supplied intakeDate", async () => {
    const res = await request(server)
      .post("/pets")
      .send({ ...validPet, intakeDate: "2020-01-01" });

    expect(res.body.intakeDate).toBe("2020-01-01T00:00:00.000Z");
  });

  it("trims surrounding whitespace from strings", async () => {
    const res = await request(server)
      .post("/pets")
      .send({ ...validPet, name: "  Luna  " });

    expect(res.body.name).toBe("Luna");
  });

  it("stores a microchip id at the top level, not under medicalRecord", async () => {
    const microchipId = nextMicrochipId();

    const res = await request(server)
      .post("/pets")
      .send({ ...validPet, microchipId });

    expect(res.status).toBe(201);
    expect(res.body.microchipId).toBe(microchipId);
    expect(res.body.medicalRecord).not.toHaveProperty("microchipId");
  });

  it("rejects a microchip id that is already registered", async () => {
    const microchipId = nextMicrochipId();
    await request(server)
      .post("/pets")
      .send({ ...validPet, microchipId });

    const res = await request(server)
      .post("/pets")
      .send({ ...validPet, microchipId });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      message: "microchipId is already registered.",
    });
  });

  it("allows any number of pets without a microchip", async () => {
    const first = await request(server)
      .post("/pets")
      .send({ ...validPet, microchipId: null });
    const second = await request(server)
      .post("/pets")
      .send({ ...validPet, microchipId: null });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("defaults microchipId to null when omitted", async () => {
    const res = await request(server)
      .post("/pets")
      .send({ ...validPet, microchipId: undefined });

    expect(res.status).toBe(201);
    expect(res.body.microchipId).toBeNull();
  });

  it("accepts an age of 0", async () => {
    const res = await request(server)
      .post("/pets")
      .send({ ...validPet, age: 0 });

    expect(res.status).toBe(201);
    expect(res.body.age).toBe(0);
  });

  it("drops unknown keys nested inside medicalRecord", async () => {
    const res = await request(server)
      .post("/pets")
      .send({
        ...validPet,
        medicalRecord: { ...validPet.medicalRecord, colour: "brown" },
      });

    expect(res.status).toBe(201);
    expect(res.body.medicalRecord).not.toHaveProperty("colour");
  });

  it("drops unknown top-level keys", async () => {
    const res = await request(server)
      .post("/pets")
      .send({ ...validPet, colour: "brown" });

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("colour");

    const fetched = await request(server).get(`/pets/${res.body.id}`);

    expect(fetched.body).not.toHaveProperty("colour");
  });
});

const rejections: { label: string; body: object; message: string }[] = [
  {
    label: "a client-supplied id",
    body: { ...validPet, id: 99 },
    message: "id is assigned by the shelter.",
  },
  {
    label: "a client-supplied adoptionDate",
    body: { ...validPet, adoptionDate: "2026-01-01" },
    message: "adoptionDate is assigned by the shelter.",
  },
  {
    label: "a missing name",
    body: { ...validPet, name: undefined },
    message: "name must be a non-empty string.",
  },
  {
    label: "a blank name",
    body: { ...validPet, name: "   " },
    message: "name must be a non-empty string.",
  },
  {
    label: "a non-string species",
    body: { ...validPet, species: 42 },
    message: "species must be a non-empty string.",
  },
  {
    label: "a missing breed",
    body: { ...validPet, breed: undefined },
    message: "breed must be a non-empty string.",
  },
  {
    label: "a negative age",
    body: { ...validPet, age: -1 },
    message: "age must be an integer of 0 or more.",
  },
  {
    label: "a fractional age",
    body: { ...validPet, age: 1.5 },
    message: "age must be an integer of 0 or more.",
  },
  {
    label: "a numeric string age",
    body: { ...validPet, age: "2" },
    message: "age must be an integer of 0 or more.",
  },
  {
    label: "a non-string intakeDate",
    body: { ...validPet, intakeDate: 1234 },
    message: "intakeDate must be a date string.",
  },
  {
    label: "an unparseable intakeDate",
    body: { ...validPet, intakeDate: "not-a-date" },
    message: "intakeDate must be a valid date.",
  },
  {
    label: "a missing medicalRecord",
    body: { ...validPet, medicalRecord: undefined },
    message: "medicalRecord must be a JSON object.",
  },
  {
    label: "a null medicalRecord",
    body: { ...validPet, medicalRecord: null },
    message: "medicalRecord must be a JSON object.",
  },
  {
    label: "non-array vaccinations",
    body: {
      ...validPet,
      medicalRecord: { ...validPet.medicalRecord, vaccinations: "Rabies" },
    },
    message: "medicalRecord.vaccinations must be an array of strings.",
  },
  {
    label: "a non-string vaccination",
    body: {
      ...validPet,
      medicalRecord: { ...validPet.medicalRecord, vaccinations: ["Rabies", 2] },
    },
    message: "medicalRecord.vaccinations[1] must be a non-empty string.",
  },
  {
    label: "a zero weight",
    body: {
      ...validPet,
      medicalRecord: { ...validPet.medicalRecord, weightKg: 0 },
    },
    message: "medicalRecord.weightKg must be a number greater than 0.",
  },
  {
    label: "a numeric microchipId",
    body: { ...validPet, microchipId: 123 },
    message: "microchipId must be a string or null.",
  },
  {
    label: "a missing photo",
    body: { ...validPet, photo: undefined },
    message: "photo must be a non-empty string.",
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

describe("POST /pets rejections", () => {
  it.each(rejections)("rejects $label with 400", async ({ body, message }) => {
    const res = await request(server).post("/pets").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message });
  });

  it.each([
    { label: "no Content-Type", type: undefined },
    { label: "text/plain", type: "text/plain" },
  ])("rejects a body sent with $label", async ({ type }) => {
    const req = request(server).post("/pets");
    const res = await (type
      ? req.set("Content-Type", type).send("hello")
      : req.send());

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "Request body must be a JSON object.",
    });
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await request(server)
      .post("/pets")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    // V8's parser message; the wording changes between Node versions.
    expect(typeof res.body.message).toBe("string");
  });

  it("stores nothing when the body is rejected", async () => {
    const before = await request(server).get("/pets");
    await request(server)
      .post("/pets")
      .send({ ...validPet, name: "" });
    const after = await request(server).get("/pets");

    expect(after.body).toHaveLength(before.body.length);
  });

  it("reports the server-owned field first when other fields are invalid too", async () => {
    const res = await request(server)
      .post("/pets")
      .send({ ...validPet, id: 99, name: "" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "id is assigned by the shelter." });
  });
});
