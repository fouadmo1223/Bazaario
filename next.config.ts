import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  images: {
    // Only these hosts may be optimized by next/image.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" }, // product media
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google avatars
      { protocol: "https", hostname: "picsum.photos" }, // seed placeholders (dev)
    ],
    formats: ["image/avif", "image/webp"],
  },

  // Keep server-only native deps out of the client bundle.
  serverExternalPackages: ["mongoose", "ioredis", "bcryptjs", "pino"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;
