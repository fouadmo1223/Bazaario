"use client";

import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";

type TabsContext = { value: string; setValue: (v: string) => void; baseId: string };
const Ctx = createContext<TabsContext | null>(null);

function useTabsCtx() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Tabs.* must be used inside <Tabs.Root>");
  return ctx;
}

function Root({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = value ?? internal;
  const baseId = useId();
  return (
    <Ctx.Provider
      value={{
        value: current,
        setValue: (v) => {
          if (value === undefined) setInternal(v);
          onValueChange?.(v);
        },
        baseId,
      }}
    >
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

function List({ children, className }: { children: ReactNode; className?: string }) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const triggers = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']") ?? []);
    const index = triggers.findIndex((t) => t === document.activeElement);
    if (index === -1) return;
    e.preventDefault();
    const next = e.key === "ArrowRight" ? (index + 1) % triggers.length : (index - 1 + triggers.length) % triggers.length;
    triggers[next]?.focus();
    triggers[next]?.click();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={onKeyDown}
      className={`flex items-center gap-1 border-b border-border-subtle ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function Trigger({ value, children }: { value: string; children: ReactNode }) {
  const { value: current, setValue, baseId } = useTabsCtx();
  const active = current === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={active ? 0 : -1}
      onClick={() => setValue(value)}
      className={`relative px-3 py-2.5 text-sm font-medium transition ${
        active ? "text-brand" : "text-text-secondary hover:text-foreground"
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" aria-hidden />}
    </button>
  );
}

function Panel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const { value: current, baseId } = useTabsCtx();
  if (current !== value) return null;
  return (
    <div id={`${baseId}-panel-${value}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${value}`} className={className}>
      {children}
    </div>
  );
}

export const Tabs = { Root, List, Trigger, Panel };
