export type ClosableServer = {
  close: (callback?: (error?: Error) => void) => unknown;
  closeAllConnections: () => void;
};

export type ShutdownOptions = {
  server: ClosableServer;
  database: { close: () => Promise<void> };
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

const closeServer = (server: ClosableServer): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

export const createShutdown = ({
  server,
  database,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ShutdownOptions): ((signal: string) => Promise<boolean>) => {
  let started = false;

  return async (signal: string): Promise<boolean> => {
    if (started) {
      return true;
    }
    started = true;

    console.log(`${signal} received, shutting down.`);

    let clean = true;

    const forced = setTimeout(() => {
      console.error(
        `Requests still open after ${timeoutMs}ms. Dropping their connections.`,
      );
      clean = false;
      server.closeAllConnections();
    }, timeoutMs);
    forced.unref();

    try {
      await closeServer(server);
    } catch (error) {
      console.error("Failed to stop the server:", error);
      clean = false;
    } finally {
      clearTimeout(forced);
    }

    try {
      await database.close();
    } catch (error) {
      console.error("Failed to close the database:", error);
      clean = false;
    }

    console.log(
      clean ? "Shutdown complete." : "Shutdown finished with errors.",
    );

    return clean;
  };
};
