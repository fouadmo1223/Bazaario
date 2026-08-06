import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { LoginForm } from "@/features/auth/components/login-form";
import { GoogleButton, OrDivider } from "@/features/auth/components/google-button";

export const metadata: Metadata = { title: "Sign in · Bazaario" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your account"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-indigo-600 hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <GoogleButton />
      <OrDivider />
      <Suspense>
        <LoginForm />
      </Suspense>
      <div className="mt-4 text-center">
        <Link href="/forgot-password" className="text-sm text-zinc-500 hover:text-indigo-600">
          Forgot your password?
        </Link>
      </div>
    </AuthShell>
  );
}
