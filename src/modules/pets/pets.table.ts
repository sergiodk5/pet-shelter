import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const petsTable = pgTable(
  "pets",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    species: text().notNull(),
    breed: text().notNull(),
    age: integer().notNull(),
    intakeDate: timestamp("intake_date", { withTimezone: true }).notNull(),
    adoptionDate: timestamp("adoption_date", { withTimezone: true }),
    photo: text().notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
    microchipId: text("microchip_id").unique(),
    vaccinations: text().array().notNull().default([]),
  },
  (table) => [
    check("pets_age_non_negative", sql`${table.age} >= 0`),
    check("pets_weight_positive", sql`${table.weightKg} > 0`),
  ],
);
