import { createDb } from "./db";
import { loadDatabaseUrl } from "./env";

export const database = createDb(loadDatabaseUrl());
