/**
 * A continuous horizontal scroll strip — CSS keyframe animation, not GSAP.
 * The content is duplicated once so the loop has no visible seam. Paused
 * entirely under `prefers-reduced-motion` (see globals.css's
 * `.marquee-track` rule) rather than just slowed down, since motion
 * sensitivity is an accessibility need, not a preference to style around.
 *
 * Decorative use only — `aria-hidden` on the whole strip, duplicated content
 * included, so it must never be the only way to reach something (a link,
 * a piece of information not stated elsewhere on the page).
 */
export function Marquee({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden ${className ?? ""}`} aria-hidden>
      <div className="marquee-track flex w-max items-center gap-12">
        <div className="flex shrink-0 items-center gap-12">{children}</div>
        <div className="flex shrink-0 items-center gap-12">{children}</div>
      </div>
    </div>
  );
}
