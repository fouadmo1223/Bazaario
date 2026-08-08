import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * Split-screen shell shared by every auth page: a duotone-treated visual
 * panel on the wide side, the actual form on the narrow side. Collapses to a
 * single centered column on mobile, where there's no room for a second panel.
 */
export async function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = await getTranslations("Auth");

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-900 lg:block">
        <Image
          src="https://picsum.photos/seed/bazaario-auth/1200/1600"
          alt=""
          fill
          sizes="50vw"
          className="object-cover grayscale-[40%] contrast-[1.05] opacity-70"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-brand-900/90 via-brand-900/50 to-brand-900/20 mix-blend-multiply"
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="flex items-center gap-2 text-white">
            <span className="grid h-8 w-8 place-items-center rounded-sm bg-white font-display text-sm font-bold text-brand-900">
              B
            </span>
            <span className="text-base font-semibold tracking-tight">Bazaario</span>
          </Link>
          <p className="max-w-sm font-display text-3xl leading-tight font-medium text-balance text-white">
            {t("shellTagline")}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-sm bg-brand font-display text-sm font-bold text-white">
              B
            </span>
            <span className="text-lg font-semibold tracking-tight text-foreground">Bazaario</span>
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
          <div className="mt-6">{children}</div>

          {footer && <p className="mt-6 text-center text-sm text-text-secondary">{footer}</p>}
        </div>
      </div>
    </div>
  );
}
