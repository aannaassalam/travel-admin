/**
 * Ambient declarations for non-code imports.
 *
 * Next.js does not ship a `*.css` module declaration, and `next-env.d.ts` — the
 * file that would normally pull in ambient types — is auto-generated and
 * gitignored, so it does not exist on a fresh clone until something runs
 * `next dev` or `next build`.
 *
 * TypeScript 5.7+ reports "Cannot find module or type declarations for
 * side-effect import" on `import "@/styles/globals.css"` without this. Older
 * compilers stay silent, which is why it shows up in the editor before it shows
 * up in CI.
 *
 * This file is committed on purpose — it must not depend on generated output.
 */

declare module "*.css";
declare module "*.scss";
declare module "*.sass";

/** Imported for their URL by next/image and <img>. */
declare module "*.svg" {
  const src: string;
  export default src;
}
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.jpg" {
  const src: string;
  export default src;
}
declare module "*.jpeg" {
  const src: string;
  export default src;
}
declare module "*.webp" {
  const src: string;
  export default src;
}
declare module "*.woff2" {
  const src: string;
  export default src;
}
