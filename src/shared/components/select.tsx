"use client";

import { useEffect, useId, useRef, useState } from "react";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type SelectProps = {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Renders a hidden native input alongside the trigger so this still works inside a plain `<form action={...}>`. */
  name?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
  className?: string;
};

/**
 * A styled dropdown that looks the same across browsers/OSes, unlike a native
 * `<select>` whose option list is OS-themed and unstyleable.
 *
 * Keeps the parts that matter about the native element: a `name` prop renders
 * a hidden input so this still submits inside a plain `<form action={...}>`
 * (the pattern several dashboard forms use with `useActionState`), and the
 * trigger is a real `<button>` so an existing `<label htmlFor>` still works —
 * clicking a label focuses/activates whatever labelable element its `for`
 * points at, buttons included.
 */
export function Select({
  options,
  value,
  defaultValue,
  onChange,
  name,
  id,
  placeholder,
  disabled,
  required,
  className,
  ...rest
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const current = isControlled ? value : internalValue;
  const selectedIndex = options.findIndex((o) => o.value === current);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex));

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const buttonId = id ?? `select-${reactId}`;
  const listboxId = `${buttonId}-listbox`;
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  function openList() {
    if (disabled) return;
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  }

  function commit(v: string) {
    if (!isControlled) setInternalValue(v);
    onChange?.(v);
    setOpen(false);
  }

  function enabledIndices() {
    return options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  }

  function onListKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    const enabled = enabledIndices();
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(enabled.find((i) => i > activeIndex) ?? enabled[0] ?? activeIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const below = enabled.filter((i) => i < activeIndex);
      setActiveIndex(below.length ? below[below.length - 1] : (enabled[enabled.length - 1] ?? activeIndex));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(enabled[0] ?? activeIndex);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(enabled[enabled.length - 1] ?? activeIndex);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt && !opt.disabled) commit(opt.value);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      {name && <input type="hidden" name={name} value={current} required={required} />}
      <button
        type="button"
        id={buttonId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openList();
          }
        }}
        {...rest}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-start text-sm text-zinc-900 transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <span className={`truncate ${selected ? "" : "text-zinc-400"}`}>
          {selected ? selected.label : (placeholder ?? "Select…")}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={options[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined}
          onKeyDown={onListKeyDown}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg outline-none dark:border-zinc-800 dark:bg-zinc-900"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={o.value === current}
              aria-disabled={o.disabled || undefined}
              onMouseEnter={() => !o.disabled && setActiveIndex(i)}
              onClick={() => !o.disabled && commit(o.value)}
              className={[
                "px-3 py-1.5",
                o.disabled
                  ? "cursor-not-allowed text-zinc-400 dark:text-zinc-600"
                  : "cursor-pointer text-zinc-700 dark:text-zinc-200",
                !o.disabled && i === activeIndex
                  ? "bg-brand/10 text-brand"
                  : "",
                o.value === current ? "font-medium" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
