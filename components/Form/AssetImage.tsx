import { assetUrl } from "@/api/endpoints";
import { cn } from "@/lib/utils";
import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The website's own pictures (/img/…: built-in home cards, seeded city photos,
 * demo offers' placeholders) are on the website, not in storage: shown from
 * its address when the panel knows it, named otherwise.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
const BUILT_IN = /^\/img\//;

/**
 * An image from storage, with a placeholder when there isn't one — or when the
 * file behind the URL has gone.
 *
 * Records imported or seeded before a file existed still carry a path, and a
 * broken-image icon reads as "the upload failed" when the real state is "this
 * record was never given a picture". Same placeholder for both cases, so the
 * gap is legible rather than alarming.
 *
 * Plain <img> rather than next/image: these URLs are runtime values on whatever
 * host the storage driver points at, which next/image would need every host
 * pre-declared in remotePatterns for.
 */
export default function AssetImage({
  src,
  className,
  iconClassName,
  title
}: {
  src?: string;
  className?: string;
  iconClassName?: string;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);

  // A changed src deserves a fresh attempt — otherwise replacing a broken
  // image leaves the placeholder stuck.
  useEffect(() => setFailed(false), [src]);

  const builtIn = Boolean(src && BUILT_IN.test(src));
  if (!src || failed || (builtIn && !SITE_URL)) {
    return (
      <div
        title={title ?? (builtIn ? "Built-in picture" : src ? "Image unavailable" : "No image")}
        className={cn(
          "flex items-center justify-center rounded border border-dashed text-muted-foreground/40",
          className
        )}
      >
        {builtIn && !failed ? (
          <span className="px-1 text-center text-[11px] text-muted-foreground">Built-in picture</span>
        ) : (
          <ImageOff className={cn("size-3.5", iconClassName)} />
        )}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={builtIn ? `${SITE_URL}${src}` : assetUrl(src)}
      alt=""
      title={title}
      onError={() => setFailed(true)}
      className={cn("rounded border object-cover", className)}
    />
  );
}
