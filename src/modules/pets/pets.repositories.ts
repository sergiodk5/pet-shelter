import type { NewPet, Pet, PetUpdate } from "./pets.types";

export const pets: Pet[] = [
  {
    id: 1,
    name: "Bella",
    species: "Dog",
    breed: "Border Collie",
    age: 3,
    intakeDate: new Date("2024-06-15"),
    medicalRecord: {
      vaccinations: ["Rabies", "Distemper", "Parvovirus"],
      weightKg: 18.4,
      microchipId: null,
    },
    photo: "https://picsum.photos/id/237/200/300",
  },
  {
    id: 2,
    name: "Milo",
    species: "Cat",
    breed: "Siamese",
    age: 2,
    intakeDate: new Date("2024-01-01"),
    adoptionDate: new Date("2024-03-10"),
    medicalRecord: {
      vaccinations: ["Rabies", "Distemper", "Parvovirus"],
      weightKg: 18.4,
      microchipId: null,
    },
    photo: "https://picsum.photos/id/238/200/300",
  },
  {
    id: 3,
    name: "Blacky",
    species: "Cat",
    breed: "Street",
    age: 6,
    intakeDate: new Date("2020-05-15"),
    adoptionDate: new Date("2021-02-20"),
    medicalRecord: {
      vaccinations: ["Rabies", "Distemper", "Parvovirus"],
      weightKg: 18.4,
      microchipId: null,
    },
    photo: "https://picsum.photos/id/239/200/300",
  },
];

// The next id to hand out, seeded past the demo data. A counter rather than
// `max(id) + 1` so an id is never reused after a pet is removed - the same
// guarantee a database's auto-increment gives you.
let nextId = pets.reduce((max, pet) => Math.max(max, pet.id), 0) + 1;

export const addPet = (newPet: NewPet): Pet => {
  const pet: Pet = { id: nextId++, ...newPet };

  pets.push(pet);

  return pet;
};

export const findPetById = (id: number): Pet | undefined => {
  return pets.find((pet: Pet): boolean => pet.id === id);
};

export const updatePet = (id: number, update: PetUpdate): Pet | undefined => {
  const index = pets.findIndex((pet: Pet): boolean => pet.id === id);

  if (index === -1) {
    return undefined;
  }

  const pet: Pet = { id, ...update };

  pets[index] = pet;

  return pet;
};

export const removePet = (id: number): boolean => {
  const index = pets.findIndex((pet: Pet): boolean => pet.id === id);

  if (index === -1) {
    return false;
  }

  pets.splice(index, 1);

  return true;
};
