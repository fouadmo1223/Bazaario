import { z } from "zod";

/**
 * Centralized, validated environment access.
 * Import `env` anywhere on the server instead of reading `process.env` directly.
 * Fails fast at boot if a required variable is missing or malformed.
 *
 * Client-safe values must be prefixed `NEXT_PUBLIC_` and read from `clientEnv`.
 */
const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Data stores
  MONGODB_URI: z.string().url().or(z.string().startsWith("mongodb")),
  MONGODB_DB_NAME: z.string().min(1).default("commerce"),
  REDIS_URL: z.string().min(1),

  // Auth / crypto
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("30d"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z
    .string()
    .url()
    .default("http://localhost:3001/auth/google/callback"),

  // Payments
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYMOB_API_KEY: z.string().optional(),
  PAYMOB_HMAC_SECRET: z.string().optional(),

  // Media
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Mail
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default("no-reply@commerce.local"),

  // Realtime
  SOCKET_JWT_SECRET: z.string().min(16).optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SOCKET_URL: z.string().url().optional(),
  NEXT_PUBLIC_MAPBOX_TOKEN: z.string().optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

function parse<T>(schema: z.ZodType<T>, source: Record<string, unknown>): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

// Lazily validated so client bundles never evaluate the server schema.
let cachedServer: ServerEnv | undefined;
export function getServerEnv(): ServerEnv {
  if (!cachedServer) cachedServer = parse(serverSchema, process.env);
  return cachedServer;
}

export const clientEnv: ClientEnv = parse(clientSchema, {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
  NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
});

export type { ServerEnv, ClientEnv };
