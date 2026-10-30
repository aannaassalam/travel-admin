import { uploadFiles, type StoredFile } from "@/api/functions/admin.api";
import AssetImage from "@/components/Form/AssetImage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCan, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Gallery image uploader.
 *
 * Stores the URL the server returns, not the file — so switching the backend
 * from local disk to S3 changes the string and nothing else here.
 *
 * Only images, and only `public` visibility. Travel documents go through a
 * different path: they are private, carry passport data, and must never get a
 * permanent URL.
 */
export default function ImageUploader({
  label,
  folder,
  value,
  onChange,
  minimum,
  single,
  upload: send,
  permission = "inventory:write"
}: {
  label: string;
  folder: string;
  value: string[];
  onChange: (next: string[]) => void;
  minimum?: number;
  /** One picture (a logo): picking another replaces it. */
  single?: boolean;
  /**
   * A route of the screen's own instead of POST /uploads — for a screen
   * outside inventory, whose editors may not hold inventory:write. Its server
   * side picks the folder; `permission` is then what that route asks for.
   */
  upload?: (files: File[]) => Promise<{ files: StoredFile[] }>;
  permission?: Permission;
}) {
  const { can } = useCan();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const { mutate: upload, isPending } = useMutation({
    mutationFn: (files: File[]) =>
      send ? send(files) : uploadFiles(files, { folder, visibility: "public" }),
    meta: { showToast: false },
    onSuccess: (r) => {
      const urls = r.files.map((f) => f.url).filter(Boolean) as string[];
      onChange(single ? urls.slice(-1) : [...value, ...urls]);
      toast.success(`${urls.length} image(s) uploaded`);
    },
    onError: (e) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ??
          "Upload failed"
      )
  });

  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    // A drop can carry several; one picture keeps one upload.
    upload(Array.from(files).slice(0, single ? 1 : undefined));
  };

  // A logo is shown whole, not cropped to a square.
  const thumb = single ? "h-20 w-40 object-contain p-1" : "size-20";

  // The upload's own permission (POST /uploads: inventory:write), whichever
  // screen this sits on. Without it this is a plain gallery: no picker, no
  // drop target, no remove buttons.
  if (!can(permission)) {
    return (
      <div>
        {label ? <Label className="text-xs">{label}</Label> : null}
        {value.length ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {value.map((url, i) => (
              <AssetImage key={`${i}-${url}`} src={url} className={thumb} />
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">No images.</p>
        )}
      </div>
    );
  }

  const short = minimum ? Math.max(minimum - value.length, 0) : 0;

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <Label className="text-xs">{label}</Label>
        {minimum ? (
          <span
            className={cn(
              "text-[11px]",
              short ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
            )}
          >
            {short ? `${short} more required` : `${value.length} uploaded`}
          </span>
        ) : null}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pick(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border border-dashed p-4 transition-colors",
          dragOver ? "border-foreground bg-muted/50" : "border-muted-foreground/30"
        )}
      >
        {value.length ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {/* By place as well: a gallery can hold the same picture twice. */}
            {value.map((url, i) => (
              <div key={`${i}-${url}`} className="group relative">
                <AssetImage src={url} className={thumb} />
                <button
                  type="button"
                  title="Remove"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-foreground p-0.5 text-background opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple={!single}
          hidden
          onChange={(e) => {
            pick(e.target.files);
            // Reset so re-picking the same file still fires a change.
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            {isPending
              ? "Uploading…"
              : single
                ? value.length
                  ? "Replace image"
                  : "Add image"
                : "Add images"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Drag and drop, or click. JPEG, PNG, WebP or AVIF, up to 8 MB each.
          </p>
        </div>
      </div>
    </div>
  );
}
