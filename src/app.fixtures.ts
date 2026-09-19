import type { Server } from "node:http";
import { createApp } from "./app";
import type { Db } from "./config/db";
import { database } from "./config/database";
import { loadConfig } from "./config/env";
import { seedPets } from "./modules/pets/pets.fixtures";
import { closeServer, listen } from "./shared/http.fixtures";

export type TestApp = {
  serverWith: (env?: NodeJS.ProcessEnv) => Promise<Server>;
  db: Db;
  close: () => Promise<void>;
};

export const createTestApp = async (): Promise<TestApp> => {
  const { db } = database;
  const servers: Server[] = [];

  await seedPets(db);

  return {
    serverWith: async (env: NodeJS.ProcessEnv = {}) => {
      const server = await listen(createApp(loadConfig(env)));

      servers.push(server);

      return server;
    },
    db,
    close: async () => {
      await Promise.all(servers.map(closeServer));
      await database.close();
    },
  };
};
