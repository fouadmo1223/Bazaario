import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { RegisterForm } from "@/features/auth/components/register-form";
import { GoogleButton, OrDivider } from "@/features/auth/components/google-button";

export const metadata: Metadata = { title: "Create account · Commerce" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Start shopping across every vendor"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-indigo-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton label="Sign up with Google" />
      <OrDivider />
      <RegisterForm />
    </AuthShell>
  );
}
