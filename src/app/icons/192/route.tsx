import { ImageResponse } from "next/og";

/**
 * A dedicated route rather than the `icon` file convention: the manifest
 * needs concrete 192/512 PNGs with explicit `sizes`/`purpose` for Android's
 * install prompt, which the single auto-linked favicon slot can't provide.
 */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4f46e5",
          color: "#fff",
          fontSize: 120,
          fontWeight: 700,
        }}
      >
        C
      </div>
    ),
    { width: 192, height: 192 },
  );
}
