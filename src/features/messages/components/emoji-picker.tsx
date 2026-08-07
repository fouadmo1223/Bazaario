"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small, dependency-free emoji picker.
 *
 * A full emoji library is a megabyte of data and a search index for what a chat
 * composer needs to be: a handful of the emoji people actually send, one tap
 * away. These are curated rather than exhaustive on purpose — the native OS
 * keyboard already covers the long tail on the platforms that have one.
 */

const GROUPS: { label: string; emoji: string; items: string[] }[] = [
  {
    label: "Smileys",
    emoji: "🙂",
    items: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🙂", "🙃", "😉", "😊",
      "😍", "😘", "😎", "🤩", "🤔", "🤨", "😐", "😴", "😢", "😭", "😤", "😡",
      "🥳", "😇", "🤯", "😬", "🙄", "😳", "🥺", "😱",
    ],
  },
  {
    label: "Gestures",
    emoji: "👍",
    items: [
      "👍", "👎", "👌", "🙏", "👏", "🙌", "🤝", "💪", "👋", "✌️", "🤞", "🤙",
      "👉", "👈", "☝️", "✋", "🤚", "🫶",
    ],
  },
  {
    label: "Hearts",
    emoji: "❤️",
    items: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "💕", "💞",
      "💯", "✨", "🔥", "🎉", "⭐", "🌟",
    ],
  },
  {
    label: "Objects",
    emoji: "📦",
    items: [
      "📦", "🛒", "💳", "🧾", "🚚", "📧", "📞", "📷", "🎁", "✅", "❌", "⚠️",
      "❓", "❗", "⏰", "📌", "💡", "🔗",
    ],
  },
];

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, like every popover should.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Insert emoji"
        aria-expanded={open}
        className="rounded-lg px-2 py-2 text-lg leading-none text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        😊
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-10 mb-2 w-64 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-2 flex gap-1 border-b border-zinc-100 pb-2 dark:border-zinc-800">
            {GROUPS.map((g, i) => (
              <button
                key={g.label}
                type="button"
                onClick={() => setGroup(i)}
                aria-label={g.label}
                aria-pressed={group === i}
                className={`rounded-md px-2 py-1 text-base transition ${
                  group === i ? "bg-brand/10" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {g.emoji}
              </button>
            ))}
          </div>
          <div className="grid max-h-40 grid-cols-8 gap-0.5 overflow-y-auto">
            {GROUPS[group].items.map((e, i) => (
              <button
                key={`${e}-${i}`}
                type="button"
                onClick={() => onPick(e)}
                className="rounded-md p-1 text-xl leading-none transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
