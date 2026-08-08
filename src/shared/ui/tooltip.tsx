"use client";

import { cloneElement, useId, useState, type ReactElement } from "react";

/** Hover- and focus-triggered, so keyboard users get the same info as mouse users. */
export function Tooltip({
  content,
  side = "top",
  children,
}: {
  content: React.ReactNode;
  side?: "top" | "bottom";
  children: ReactElement<{ "aria-describedby"?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {cloneElement(children, { "aria-describedby": open ? id : undefined })}
      <span
        role="tooltip"
        id={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`pointer-events-none absolute start-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-sm bg-foreground px-2 py-1 text-xs text-background shadow-sm transition ${
          open ? "opacity-100" : "opacity-0"
        } ${side === "top" ? "bottom-full mb-2" : "top-full mt-2"}`}
      >
        {content}
      </span>
    </span>
  );
}
