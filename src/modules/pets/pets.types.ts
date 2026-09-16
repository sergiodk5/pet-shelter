export type MedicalRecord = {
  vaccinations: string[];
  weightKg: number;
  microchipId: null | string;
};

export type Pet = {
  id: number;
  name: string;
  species: string;
  breed: string;
  age: number;
  intakeDate: Date;
  adoptionDate?: Date;
  medicalRecord: MedicalRecord;
  photo: string;
};

export type NewPet = Omit<Pet, "id" | "adoptionDate">;
