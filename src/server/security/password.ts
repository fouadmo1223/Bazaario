import bcrypt from "bcryptjs";
import { getServerEnv } from "@/shared/config/env";

/** Hash a plaintext password with the configured bcrypt cost factor. */
export async function hashPassword(plain: string): Promise<string> {
  const rounds = getServerEnv().BCRYPT_ROUNDS;
  return bcrypt.hash(plain, rounds);
}

/** Constant-time-ish verification of a plaintext against a stored hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
