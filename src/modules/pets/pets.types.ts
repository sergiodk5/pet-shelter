export type MedicalRecord = {
  vaccinations: string[];
  weightKg: number;
};

export type Pet = {
  id: number;
  name: string;
  species: string;
  breed: string;
  age: number;
  intakeDate: Date;
  adoptionDate?: Date;
  microchipId: null | string;
  medicalRecord: MedicalRecord;
  photo: string;
};

export type NewPet = Omit<Pet, "id" | "adoptionDate">;

export type PetUpdate = Omit<Pet, "id">;
