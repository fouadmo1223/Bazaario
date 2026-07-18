import { useEffect, useLayoutEffect } from "react";

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * Animation setup has to run before the browser paints, or the element is drawn
 * in its final state for one frame and then snapped back to the start — a
 * visible flicker. `useLayoutEffect` does that, but React warns when it runs
 * during SSR (where there is no layout to read), so the server gets the no-op
 * `useEffect` instead.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
