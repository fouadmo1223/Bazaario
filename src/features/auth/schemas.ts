import { z } from "zod";

/** Shared auth validation. Reused by server actions, route handlers, and RHF forms. */

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Must include a lowercase letter")
  .regex(/[A-Z]/, "Must include an uppercase letter")
  .regex(/[0-9]/, "Must include a number");

export const registerSchema = z.object({
  name: z.string().min(2, "Name is too short").max(80),
  email: z.string().email("Enter a valid email").toLowerCase(),
  password,
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email").toLowerCase(),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.coerce.boolean().default(false),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10),
});

export const otpSchema = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().length(6, "OTP must be 6 digits"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type OtpInput = z.infer<typeof otpSchema>;
