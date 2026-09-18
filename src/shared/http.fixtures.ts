import type { Server } from "node:http";
import type { Express } from "express";

/**
 * Resolves once the server is listening. Handed one whose `address()` is still
 * null, supertest assumes ownership and closes it after the first request.
 */
export const listen = (app: Express): Promise<Server> =>
  new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });

export const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
