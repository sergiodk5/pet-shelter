import { createApp } from "./app";
import { createDb } from "./config/db";
import { loadConfig, loadDatabaseUrl } from "./config/env";
import { createShutdown } from "./shared/shutdown";

const start = async (): Promise<void> => {
  const config = loadConfig();
  const database = createDb(loadDatabaseUrl());

  try {
    await database.ping();
  } catch (error) {
    // Release the pool, or the process hangs instead of exiting.
    await database.close();
    throw new Error("Cannot reach the database. Check DATABASE_URL.", {
      cause: error,
    });
  }

  const server = createApp(config, database.db).listen(
    config.port,
    (): void => {
      console.log("Listening on port:", config.port);
    },
  );

  const shutdown = createShutdown({ server, database });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(signal).then((clean) => {
        if (!clean) {
          process.exitCode = 1;
        }
      });
    });
  }
};

start().catch((error: unknown) => {
  console.error("Failed to start:", error);
  process.exitCode = 1;
});
