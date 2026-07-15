import { connectToDatabase } from "@/server/database/connection";
import { getRedis } from "@/server/cache/redis";
import { json, route } from "@/shared/lib/api-response";
import mongoose from "mongoose";

/** Liveness + readiness probe: verifies DB and Redis connectivity. */
export const GET = route(async () => {
  const checks: Record<string, "up" | "down"> = { db: "down", redis: "down" };

  try {
    await connectToDatabase();
    checks.db = mongoose.connection.readyState === 1 ? "up" : "down";
  } catch {
    checks.db = "down";
  }

  try {
    const pong = await getRedis().ping();
    checks.redis = pong === "PONG" ? "up" : "down";
  } catch {
    checks.redis = "down";
  }

  const healthy = Object.values(checks).every((s) => s === "up");
  return json(
    { status: healthy ? "healthy" : "degraded", checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
});
