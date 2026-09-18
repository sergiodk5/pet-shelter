export const validPetBody = {
  name: "Luna",
  species: "Dog",
  breed: "Beagle",
  age: 2,
  microchipId: null,
  medicalRecord: {
    vaccinations: ["Rabies"],
    weightKg: 9.2,
  },
  photo: "https://picsum.photos/id/240/200/300",
};

export const validReplacementBody = {
  ...validPetBody,
  intakeDate: "2024-06-15",
};

let chipCounter = 0;

export const nextMicrochipId = (): string => `CHIP-${++chipCounter}`;

export const ids = (body: Array<{ id: number }>): number[] =>
  body.map((pet) => pet.id);

export { seedPets } from "./pets.seed";
