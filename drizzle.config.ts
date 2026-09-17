import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  // An array rather than a glob: table definitions stay inside their module,
  // and each new module adds a line here.
  schema: ["./src/modules/pets/pets.table.ts"],
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
