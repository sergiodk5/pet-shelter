/** A body that satisfies every rule - tests break exactly one thing against it. */
export const validPetBody = {
  name: "Luna",
  species: "Dog",
  breed: "Beagle",
  age: 2,
  medicalRecord: {
    vaccinations: ["Rabies"],
    weightKg: 9.2,
    microchipId: null,
  },
  photo: "https://picsum.photos/id/240/200/300",
};

/** PUT sends the whole pet, so `intakeDate` is required rather than defaulted. */
export const validReplacementBody = {
  ...validPetBody,
  intakeDate: "2024-06-15",
};

export const ids = (body: Array<{ id: number }>): number[] =>
  body.map((pet) => pet.id);
