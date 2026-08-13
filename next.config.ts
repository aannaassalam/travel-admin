import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  sassOptions: {
    includePaths: [path.join(__dirname, "styles")]
  },
  images: {
    // ponytail: add your CDN hosts here. Never `hostname: "*"` — that turns
    // /_next/image into an open proxy anyone can run their bandwidth through.
    remotePatterns: [{ protocol: "https", hostname: "**.amazonaws.com" }]
  },
  compress: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
  },
  // No `env` block: it inlines values into the CLIENT bundle. Anything the
  // browser needs gets a NEXT_PUBLIC_ prefix in .env; secrets stay server-only
  // and are read straight from process.env.
  typescript: { ignoreBuildErrors: false }
};

export default nextConfig;
