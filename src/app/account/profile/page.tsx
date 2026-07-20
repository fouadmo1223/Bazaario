import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/security/current-user";
import { getProfile, getAddresses } from "@/features/profile/queries";
import { ProfileForm } from "@/features/profile/components/profile-form";
import { AddressBook } from "@/features/profile/components/address-book";
import { SignOutButton } from "@/features/profile/components/sign-out-button";

export const metadata: Metadata = {
  title: "Your profile · Commerce",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/account/profile")}`);

  const [profile, addresses] = await Promise.all([getProfile(user.id), getAddresses(user.id)]);

  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Your profile
          </h1>
          <SignOutButton />
        </div>

        <nav aria-label="Account sections" className="mt-2 flex flex-wrap gap-4 text-sm">
          <Link href="/account/orders" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
            Orders
          </Link>
          <Link href="/account/messages" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
            Messages
          </Link>
          <Link href="/wishlist" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
            Wishlist
          </Link>
        </nav>

        {!profile.emailVerified ? (
          <p className="mt-6 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Your email isn&apos;t verified yet.
          </p>
        ) : null}

        <section className="mt-8" aria-label="Personal details">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Details</h2>
          <ProfileForm
            initial={{ name: profile.name, phone: profile.phone, avatar: profile.avatar }}
            email={profile.email}
          />
        </section>

        <section className="mt-12" aria-label="Addresses">
          <AddressBook addresses={addresses} />
        </section>
      </div>
    </div>
  );
}
