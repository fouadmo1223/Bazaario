"use client";

/**
 * Horizontal scroll gallery — native CSS scroll-snap, not a GSAP-driven
 * pin/scrub. `Reveal`'s own history already includes one abandoned
 * ScrollTrigger implementation that went stale when images shifted layout
 * mid-scroll; scroll-snap sidesteps that class of bug entirely (no cached
 * trigger positions to go stale) while still reading as an editorial gallery
 * — large cards, generous gaps, one deliberate row — rather than a carousel
 * with dots and arrows.
 */
export function HorizontalGallery({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

export function HorizontalGalleryItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`shrink-0 snap-start ${className ?? ""}`}>{children}</div>;
}
