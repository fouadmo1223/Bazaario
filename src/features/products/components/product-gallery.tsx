"use client";

import Image from "next/image";
import { useState } from "react";

export type GalleryMedia = {
  url: string;
  alt: string | null;
  type: "image" | "video" | "image360";
};

/**
 * Product media gallery.
 *
 * `activeUrl` lets a variant selection drive the main image: when it points at
 * media the gallery holds, that frame is shown; when the variant has its own
 * image, it's shown directly. Thumbnails are a listbox rather than buttons in a
 * row so keyboard users can arrow through them.
 */
export function ProductGallery({
  media,
  title,
  activeUrl,
}: {
  media: GalleryMedia[];
  title: string;
  /** Overrides the selected frame (e.g. the chosen variant's image). */
  activeUrl?: string | null;
}) {
  const [index, setIndex] = useState(0);

  if (media.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-zinc-100 text-sm text-zinc-400 dark:bg-zinc-900">
        No image
      </div>
    );
  }

  // A variant image that isn't part of the gallery still deserves to be shown.
  const overrideIndex = activeUrl ? media.findIndex((m) => m.url === activeUrl) : -1;
  const current =
    activeUrl && overrideIndex === -1
      ? { url: activeUrl, alt: title, type: "image" as const }
      : media[overrideIndex >= 0 ? overrideIndex : Math.min(index, media.length - 1)];

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900">
        {current.type === "video" ? (
          <video
            src={current.url}
            controls
            className="h-full w-full object-cover"
            aria-label={`${title} video`}
          />
        ) : (
          <Image
            key={current.url}
            src={current.url}
            alt={current.alt ?? title}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
            priority
          />
        )}
      </div>

      {media.length > 1 && (
        <div
          role="listbox"
          aria-label={`${title} images`}
          className="mt-3 grid grid-cols-5 gap-2"
        >
          {media.map((m, i) => {
            const selected = overrideIndex >= 0 ? i === overrideIndex : i === index;
            return (
              <button
                key={m.url}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => setIndex(i)}
                className={`relative aspect-square overflow-hidden rounded-lg border-2 transition ${
                  selected
                    ? "border-brand"
                    : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <Image
                  src={m.url}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
                {m.type === "video" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
