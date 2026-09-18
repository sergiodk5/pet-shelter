import { createApp } from "./app";
import { createDb } from "./config/db";
import { loadConfig, loadDatabaseUrl } from "./config/env";
import { createShutdown } from "./shared/shutdown";

const start = async (): Promise<void> => {
  const config = loadConfig();
  const database = createDb(loadDatabaseUrl());

  // The pool connects lazily, so without this a bad DATABASE_URL would stay
  // quiet until the first request and then look like a runtime fault.
  try {
    await database.ping();
  } catch (error) {
    // Nothing is listening yet, but the pool still has to be released or the
    // process hangs rather than exiting.
    await database.close();
    // Drizzle's own message is "Failed query: select 1", which says nothing
    // about the database being unreachable. The driver error stays as `cause`.
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

  // SIGTERM is what a container runtime sends; SIGINT is Ctrl-C.
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
