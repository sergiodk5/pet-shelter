import { describe, expect, it } from "vitest";
import { loadConfig } from "./env";

describe("loadConfig", () => {
  it("falls back to defaults when nothing is set", () => {
    expect(loadConfig({})).toEqual({
      port: 8000,
      nodeEnv: "development",
      corsOrigins: [],
    });
  });

  it("reads PORT, NODE_ENV and CORS_ORIGINS", () => {
    expect(
      loadConfig({
        PORT: "3000",
        NODE_ENV: "production",
        CORS_ORIGINS: "https://a.example,https://b.example",
      }),
    ).toEqual({
      port: 3000,
      nodeEnv: "production",
      corsOrigins: ["https://a.example", "https://b.example"],
    });
  });

  it.each(["abc", "80.5", "0", "70000", "-1", "8000x"])(
    "rejects PORT=%s at startup",
    (port) => {
      expect(() => loadConfig({ PORT: port })).toThrow(
        /PORT must be an integer/,
      );
    },
  );

  it("trims origins and drops empty entries", () => {
    expect(
      loadConfig({ CORS_ORIGINS: " https://a.example , , https://b.example ," })
        .corsOrigins,
    ).toEqual(["https://a.example", "https://b.example"]);
  });

  it("treats blank values as unset", () => {
    expect(
      loadConfig({ PORT: "   ", NODE_ENV: "  ", CORS_ORIGINS: "  " }),
    ).toEqual({ port: 8000, nodeEnv: "development", corsOrigins: [] });
  });

  it("reads process.env when called with no argument", () => {
    expect(loadConfig()).toMatchObject({
      port: expect.any(Number),
      nodeEnv: expect.any(String),
      corsOrigins: expect.any(Array),
    });
  });
});
