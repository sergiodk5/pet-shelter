export type AppConfig = {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
};

const DEFAULT_PORT = 8000;
const DEFAULT_NODE_ENV = "development";

const parsePort = (raw: string | undefined): number => {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_PORT;
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `PORT must be an integer between 1 and 65535, got "${raw}".`,
    );
  }

  return port;
};

/** Comma-separated browser origins. Empty means no cross-origin access at all. */
const parseCorsOrigins = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");

/**
 * Reads configuration from the environment, failing at startup rather than
 * halfway through a request. Takes `env` as an argument so tests can pass their
 * own values instead of mutating `process.env`.
 */
export const loadConfig = (
  env: NodeJS.ProcessEnv = process.env,
): AppConfig => ({
  port: parsePort(env.PORT),
  nodeEnv: env.NODE_ENV?.trim() || DEFAULT_NODE_ENV,
  corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
});

/**
 * The database URL, needed only by whoever opens the connection: `server.ts` and
 * `drizzle.config.ts`. Deliberately **not** part of `AppConfig` — the app is handed
 * a database rather than a URL, so a spec never needs one and `loadConfig({})`
 * keeps working.
 */
export const loadDatabaseUrl = (
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const url = env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error("DATABASE_URL is required.");
  }

  return url;
};
