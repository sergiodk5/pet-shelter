import type { Pet } from "./pets.types";

export const pets: Pet[] = [
  {
    id: 1,
    name: "Bella",
    species: "Dog",
    breed: "Border Collie",
    age: 3,
    adopted: false,
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
    adopted: true,
    intakeDate: new Date("2024-01-01"),
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
    adopted: true,
    intakeDate: new Date("2020-05-15"),
    medicalRecord: {
      vaccinations: ["Rabies", "Distemper", "Parvovirus"],
      weightKg: 18.4,
      microchipId: null,
    },
    photo: "https://picsum.photos/id/239/200/300",
  },
];
