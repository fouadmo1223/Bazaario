import mongoose from "mongoose";
import { getServerEnv } from "@/shared/config/env";
import { logger } from "@/shared/lib/logger";

/**
 * Serverless-safe Mongoose singleton.
 * On Vercel, module state is reused across warm invocations, so we cache the
 * connection promise on `globalThis` to avoid exhausting the Atlas connection
 * pool with a new connection per lambda cold start.
 */
type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as unknown as { _mongoose?: MongooseCache };
const cache: MongooseCache = globalForMongoose._mongoose ?? { conn: null, promise: null };
globalForMongoose._mongoose = cache;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const env = getServerEnv();
    mongoose.set("strictQuery", true);
    cache.promise = mongoose
      .connect(env.MONGODB_URI, {
        dbName: env.MONGODB_DB_NAME,
        maxPoolSize: 10,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 8000,
      })
      .then((m) => {
        logger.info("MongoDB connected");
        return m;
      })
      .catch((err) => {
        cache.promise = null; // allow retry on next call
        logger.error({ err }, "MongoDB connection failed");
        throw err;
      });
  }

  cache.conn = await cache.promise;
  // Ensure all models are registered on this connection (side-effect import).
  await import("./models");
  return cache.conn;
}
