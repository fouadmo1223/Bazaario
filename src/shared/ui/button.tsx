import type { ComponentProps, ReactNode } from "react";
import { Link } from "@/i18n/navigation";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-xs hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-sm disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none",
  secondary:
    "bg-accent text-white shadow-xs hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-sm disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none",
  ghost:
    "border border-border-default text-foreground hover:bg-surface-raised disabled:pointer-events-none disabled:opacity-50",
  destructive:
    "bg-error text-white hover:brightness-90 disabled:pointer-events-none disabled:opacity-50",
  link: "text-brand underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2.5",
};

type BaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  loading?: boolean;
  className?: string;
  children: ReactNode;
};

type AsButton = BaseProps & Omit<ComponentProps<"button">, keyof BaseProps> & { href?: undefined };
type AsLink = BaseProps &
  Omit<ComponentProps<typeof Link>, keyof BaseProps> & { href: ComponentProps<typeof Link>["href"] };

/**
 * The one button implementation for the whole app — variant/size decide
 * appearance, `href` decides whether it renders as a locale-aware `Link` or a
 * native `<button>`, so callers never hand-roll CTA styling again.
 */
export function Button(props: AsButton | AsLink) {
  const { variant = "primary", size = "md", iconStart, iconEnd, loading, className, children, ...rest } = props;

  const classes = [
    "inline-flex items-center justify-center whitespace-nowrap rounded-btn font-semibold transition",
    VARIANT[variant],
    variant !== "link" ? SIZE[size] : "gap-1.5 text-sm",
    className ?? "",
  ].join(" ");

  const content = (
    <>
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
        </svg>
      ) : (
        iconStart
      )}
      {children}
      {!loading && iconEnd}
    </>
  );

  if ("href" in rest && rest.href !== undefined) {
    const { href, ...linkRest } = rest as Omit<AsLink, keyof BaseProps>;
    return (
      <Link href={href} className={classes} {...linkRest}>
        {content}
      </Link>
    );
  }

  const buttonRest = rest as Omit<AsButton, keyof BaseProps>;
  return (
    <button type={buttonRest.type ?? "button"} className={classes} disabled={loading || buttonRest.disabled} {...buttonRest}>
      {content}
    </button>
  );
}
