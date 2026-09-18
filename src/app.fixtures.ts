import type { Server } from "node:http";
import { createApp } from "./app";
import type { Db } from "./config/db";
import { createTestDb } from "./config/db.fixtures";
import { loadConfig } from "./config/env";
import { seedPets } from "./modules/pets/pets.fixtures";

export type TestApp = {
  /**
   * A **listening** server on this database. Pass env vars to vary the
   * configuration.
   *
   * It listens on purpose. Handed an app that is not already listening,
   * `supertest` binds a fresh ephemeral port for **every request**
   * (`lib/test.js`: `if (!addr) this._server = app.listen(0)`) and closes it
   * asynchronously afterwards. Across this suite that was ~150 listen/close
   * cycles per run, leaving ~140 sockets in TIME_WAIT. Handing it a server that
   * is already listening makes it reuse one port for the whole spec file.
   *
   * It resolves only once the server is **actually listening**. `listen()` is
   * asynchronous, and supertest treats a server whose `address()` is still null
   * as one it owns: it calls `listen(0)` on it and then **closes it** when that
   * request ends, so every later request in the file hangs until the test times
   * out. Awaiting the `listening` event is what makes that impossible.
   */
  serverWith: (env?: NodeJS.ProcessEnv) => Promise<Server>;
  db: Db;
  close: () => Promise<void>;
};

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });

/**
 * One migrated, seeded database for a spec file, plus a factory for servers
 * that use it. Call this in `beforeAll` and `close()` in `afterAll`.
 *
 * Database and server are separate because `app.spec.ts` needs several apps
 * with different CORS settings sharing one database. Every spec file gets its
 * own instance, which is what preserves the per-file isolation the suite
 * relies on.
 */
export const createTestApp = async (): Promise<TestApp> => {
  const { db, close: closeDb } = await createTestDb();
  const servers: Server[] = [];

  await seedPets(db);

  return {
    serverWith: (env: NodeJS.ProcessEnv = {}) =>
      new Promise<Server>((resolve) => {
        const server = createApp(loadConfig(env), db).listen(0, () => {
          resolve(server);
        });

        servers.push(server);
      }),
    db,
    // Every port this file opened is released before the database goes, so a
    // spec file leaves nothing behind for the next one.
    close: async () => {
      await Promise.all(servers.map(closeServer));
      await closeDb();
    },
  };
};
