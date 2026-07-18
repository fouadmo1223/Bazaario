"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useIsomorphicLayoutEffect } from "@/shared/hooks/use-isomorphic-layout-effect";

type RevealProps = {
  children: React.ReactNode;
  /** Direction the content travels in from. */
  from?: "bottom" | "left" | "right" | "none";
  /** Seconds to wait before starting. Only meaningful with `immediate`. */
  delay?: number;
  /**
   * Animate on mount instead of waiting to be scrolled to. Use for
   * above-the-fold content, which is already in view.
   */
  immediate?: boolean;
  /**
   * Stagger direct children instead of moving the container as one block.
   * For grids and lists.
   */
  stagger?: boolean;
  /**
   * Fade as well as move. Turn this off for the largest above-the-fold element:
   * an element at `opacity: 0` has not been painted, so Largest Contentful Paint
   * is not recorded until the fade finishes. Sliding alone keeps the pixels on
   * screen from the first frame and leaves LCP untouched.
   */
  fade?: boolean;
  className?: string;
  as?: "div" | "section" | "ul";
};

const DISTANCE = 24;
const DURATION = 0.5;

/**
 * Fade-and-rise reveal, driven by GSAP.
 *
 * Three rules this follows, each learned the hard way:
 *
 * 1. **Nothing is hidden in CSS.** The hidden state is set from JS in a layout
 *    effect, so a visitor whose JS fails or is still loading sees fully rendered
 *    content. Animation is decoration; it must never be load-bearing for
 *    legibility.
 *
 * 2. **Only off-screen content is ever hidden.** Anything already in the
 *    viewport when this mounts is animated immediately rather than hidden first.
 *    An earlier version used ScrollTrigger, whose cached start positions went
 *    stale when images loaded and shifted the layout — elements scrolled into
 *    view and stayed invisible permanently. IntersectionObserver measures live
 *    and cannot go stale that way.
 *
 * 3. **It respects `prefers-reduced-motion`**, skipping entirely and leaving
 *    children in their natural state. Motion sensitivity is an accessibility
 *    need, not a preference to style around.
 */
export function Reveal({
  children,
  from = "bottom",
  delay = 0,
  immediate = false,
  stagger = false,
  fade = true,
  className,
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Honour the OS setting: leave everything exactly as rendered.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // A hidden document — background tab, prerender, headless viewer — gets no
    // rAF ticks and no IntersectionObserver callbacks. Hiding content here would
    // strand it invisible with nothing able to reveal it. Nobody is looking, so
    // there is nothing to animate: leave it rendered and be done.
    if (document.visibilityState === "hidden") return;

    const targets: Element[] = stagger ? Array.from(el.children) : [el];
    if (targets.length === 0) return;

    const offset =
      from === "bottom" ? { y: DISTANCE } :
      from === "left" ? { x: -DISTANCE } :
      from === "right" ? { x: DISTANCE } :
      {};

    // `context` scopes the animation and gives one call to undo all of it,
    // which React needs since effects run twice in development.
    const ctx = gsap.context(() => {
      const play = (withDelay: number) =>
        gsap.to(targets, {
          ...(fade ? { opacity: 1 } : {}),
          x: 0,
          y: 0,
          duration: DURATION,
          ease: "power2.out",
          delay: withDelay,
          stagger: stagger ? 0.06 : 0,
          // Leave no transform behind: a lingering `translate` creates a
          // containing block that breaks `position: fixed` descendants.
          clearProps: "transform",
        });

      if (immediate) {
        gsap.set(targets, { ...(fade ? { opacity: 0 } : {}), ...offset });
        play(delay);
        return;
      }

      // Measure before deciding to hide anything. Content already on screen is
      // animated where it stands; only what is genuinely below the fold is
      // hidden and waited on.
      const observer = new IntersectionObserver(
        (entries, obs) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            obs.unobserve(entry.target);
            gsap.to(entry.target, {
              ...(fade ? { opacity: 1 } : {}),
              x: 0,
              y: 0,
              duration: DURATION,
              ease: "power2.out",
              clearProps: "transform",
            });
          }
        },
        // A small negative bottom margin starts the motion just before the
        // element's edge arrives, so it reads as anticipation, not a correction.
        { rootMargin: "0px 0px -8% 0px", threshold: 0.01 },
      );

      for (const target of targets) {
        const rect = target.getBoundingClientRect();
        const onScreen = rect.top < window.innerHeight && rect.bottom > 0;

        if (onScreen) {
          gsap.set(target, { ...(fade ? { opacity: 0 } : {}), ...offset });
          gsap.to(target, {
            ...(fade ? { opacity: 1 } : {}),
            x: 0,
            y: 0,
            duration: DURATION,
            ease: "power2.out",
            delay: stagger ? targets.indexOf(target) * 0.06 : 0,
            clearProps: "transform",
          });
        } else {
          gsap.set(target, { ...(fade ? { opacity: 0 } : {}), ...offset });
          observer.observe(target);
        }
      }

      return () => observer.disconnect();
    }, el);

    return () => ctx.revert();
  }, [from, delay, immediate, stagger, fade]);

  return (
    <Tag ref={ref as React.Ref<never>} className={className}>
      {children}
    </Tag>
  );
}
