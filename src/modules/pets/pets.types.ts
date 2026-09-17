/**
 * The medical facts that become a history: weight is a point in a time series,
 * vaccinations gain dates and boosters. `microchipId` is deliberately *not*
 * here - it identifies the pet and never changes.
 */
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
