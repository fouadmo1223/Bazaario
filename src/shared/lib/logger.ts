import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

/**
 * Structured logger. In dev we pretty-print; in prod we emit JSON for the
 * platform's log drain. Never log secrets — the redact list covers common keys.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  redact: {
    paths: [
      "password",
      "passwordHash",
      "*.password",
      "*.passwordHash",
      "token",
      "accessToken",
      "refreshToken",
      "authorization",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        },
      }),
});

export type Logger = typeof logger;
