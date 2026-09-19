import { vi } from "vitest";
import { createTestDb } from "./config/db.fixtures";

vi.mock("./config/database", async () => ({ database: await createTestDb() }));
