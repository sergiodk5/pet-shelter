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

const parseCorsOrigins = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");

export const loadConfig = (
  env: NodeJS.ProcessEnv = process.env,
): AppConfig => ({
  port: parsePort(env.PORT),
  nodeEnv: env.NODE_ENV?.trim() || DEFAULT_NODE_ENV,
  corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
});

export const loadDatabaseUrl = (
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const url = env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error("DATABASE_URL is required.");
  }

  return url;
};
