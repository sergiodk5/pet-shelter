export type Pet = {
  id: number;
  name: string;
  species: string;
  breed: string;
  age: number;
  intakeDate: Date;
  adoptionDate?: Date;
  medicalRecord: {
    vaccinations: string[];
    weightKg: number;
    microchipId: null | string;
  };
  photo: string;
};
