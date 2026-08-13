import { Inter } from "next/font/google";

/**
 * next/font downloads and self-hosts every declared family at build time, so an
 * unused declaration is a real build-time network fetch and extra CSS for
 * nothing — and a build that fails if the font service is unreachable.
 *
 * Four other families were declared here and referenced nowhere: not in a
 * component, and not in globals.css, which only reads `--inter`.
 *
 * Add a family back at the point something actually uses it.
 */
export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--inter",
  style: ["normal"]
});
