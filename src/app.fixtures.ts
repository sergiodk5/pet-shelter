import type { Server } from "node:http";
import { createApp } from "./app";
import type { Db } from "./config/db";
import { createTestDb } from "./config/db.fixtures";
import { loadConfig } from "./config/env";
import { seedPets } from "./modules/pets/pets.fixtures";
import { closeServer, listen } from "./shared/http.fixtures";

export type TestApp = {
  serverWith: (env?: NodeJS.ProcessEnv) => Promise<Server>;
  db: Db;
  close: () => Promise<void>;
};

export const createTestApp = async (): Promise<TestApp> => {
  const { db, close: closeDb } = await createTestDb();
  const servers: Server[] = [];

  await seedPets(db);

  return {
    serverWith: async (env: NodeJS.ProcessEnv = {}) => {
      const server = await listen(createApp(loadConfig(env), db));

      servers.push(server);

      return server;
    },
    db,
    close: async () => {
      await Promise.all(servers.map(closeServer));
      await closeDb();
    },
  };
};
