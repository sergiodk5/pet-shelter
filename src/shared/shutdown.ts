/**
 * Only the parts of `http.Server` a shutdown needs. Written out rather than
 * `Pick<Server, ...>` because `close` returns `this`, which a fake would then
 * have to satisfy with a whole `Server`. `unknown` accepts the real one and
 * lets a spec pass a fake instead of binding a port - the same reason
 * `createApp` never calls `listen`.
 */
export type ClosableServer = {
  close: (callback?: (error?: Error) => void) => unknown;
  closeAllConnections: () => void;
};

export type ShutdownOptions = {
  server: ClosableServer;
  database: { close: () => Promise<void> };
  /** How long in-flight requests get before their sockets are dropped. */
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

/**
 * Builds the signal handler: stop accepting connections, let the in-flight
 * requests finish, then close the pool.
 *
 * The returned function resolves to `true` only when all of that happened on
 * its own. It never sets an exit code itself — `server.ts` owns the process, so
 * a spec can drive this without changing the exit code of the test run.
 */
export const createShutdown = ({
  server,
  database,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ShutdownOptions): ((signal: string) => Promise<boolean>) => {
  let started = false;

  return async (signal: string): Promise<boolean> => {
    // A second Ctrl-C must not start a second sequence racing the first.
    if (started) {
      return true;
    }
    started = true;

    console.log(`${signal} received, shutting down.`);

    // No `closeIdleConnections()` here on purpose. `http.Server.close` already
    // calls it through `httpServerPreClose`, so idle keep-alive sockets are
    // dropped either way - checked against Node 24's own source, and measured:
    // a held keep-alive connection delays this by 0.03s with or without it.
    let clean = true;

    const forced = setTimeout(() => {
      console.error(
        `Requests still open after ${timeoutMs}ms. Dropping their connections.`,
      );
      clean = false;
      server.closeAllConnections();
    }, timeoutMs);
    // Nothing should stay alive merely to wait for this timer.
    forced.unref();

    try {
      await closeServer(server);
    } catch (error) {
      console.error("Failed to stop the server:", error);
      clean = false;
    } finally {
      clearTimeout(forced);
    }

    // Always runs: an unclosed pool keeps the process alive even when the
    // server is already gone.
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
