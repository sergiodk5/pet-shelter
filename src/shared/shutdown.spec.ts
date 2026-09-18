import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClosableServer } from "./shutdown";
import { createShutdown } from "./shutdown";

const makeServer = () => {
  const order: string[] = [];
  let finish: ((error?: Error) => void) | undefined;

  return {
    order,
    settle: (error?: Error): void => finish?.(error),
    server: {
      close: (callback?: (error?: Error) => void) => {
        order.push("close");
        finish = callback;
      },
      closeAllConnections: () => order.push("closeAllConnections"),
    } satisfies ClosableServer,
  };
};

const makeDatabase = (order: string[], close?: () => Promise<void>) => ({
  close: async (): Promise<void> => {
    order.push("database.close");
    await close?.();
  },
});

describe("createShutdown", () => {
  it("stops the server before closing the database", async () => {
    const { order, server, settle } = makeServer();
    const shutdown = createShutdown({
      server,
      database: makeDatabase(order),
    });

    const done = shutdown("SIGTERM");
    settle();

    await expect(done).resolves.toBe(true);
    expect(order).toEqual(["close", "database.close"]);
  });

  it("ignores a second signal instead of racing the first", async () => {
    const { order, server, settle } = makeServer();
    const shutdown = createShutdown({
      server,
      database: makeDatabase(order),
    });

    const first = shutdown("SIGINT");
    const second = shutdown("SIGINT");
    settle();

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(order.filter((call) => call === "database.close")).toHaveLength(1);
  });

  it("closes the database even when the server fails to stop", async () => {
    const { order, server, settle } = makeServer();
    const shutdown = createShutdown({
      server,
      database: makeDatabase(order),
    });

    const done = shutdown("SIGTERM");
    settle(new Error("not running"));

    await expect(done).resolves.toBe(false);
    expect(order).toContain("database.close");
  });

  it("reports a database that fails to close", async () => {
    const { order, server, settle } = makeServer();
    const shutdown = createShutdown({
      server,
      database: makeDatabase(order, () => Promise.reject(new Error("nope"))),
    });

    const done = shutdown("SIGTERM");
    settle();

    await expect(done).resolves.toBe(false);
  });
});

describe("createShutdown when requests do not finish", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("drops the open connections once the grace period is up", async () => {
    const { order, server, settle } = makeServer();
    const shutdown = createShutdown({
      server,
      database: makeDatabase(order),
      timeoutMs: 5000,
    });

    const done = shutdown("SIGTERM");

    expect(order).not.toContain("closeAllConnections");

    await vi.advanceTimersByTimeAsync(5000);

    expect(order).toContain("closeAllConnections");

    settle();

    await expect(done).resolves.toBe(false);
  });

  it("leaves the connections alone when everything finishes in time", async () => {
    const { order, server, settle } = makeServer();
    const shutdown = createShutdown({
      server,
      database: makeDatabase(order),
      timeoutMs: 5000,
    });

    const done = shutdown("SIGTERM");
    settle();

    await expect(done).resolves.toBe(true);

    await vi.advanceTimersByTimeAsync(5000);

    expect(order).not.toContain("closeAllConnections");
  });
});

describe("createShutdown against a real server", () => {
  it("releases the port", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const { port } = server.address() as { port: number };
    const order: string[] = [];
    const shutdown = createShutdown({ server, database: makeDatabase(order) });

    await expect(shutdown("SIGTERM")).resolves.toBe(true);
    expect(server.listening).toBe(false);

    const reused = createServer();
    await new Promise<void>((resolve) => reused.listen(port, resolve));
    await new Promise<void>((resolve) => reused.close(() => resolve()));
  });
});
