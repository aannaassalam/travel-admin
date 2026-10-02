import { uploadFiles } from "@/api/functions/admin.api";
import AssetImage from "@/components/Form/AssetImage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCan } from "@/lib/permissions";
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
  minimum
}: {
  label: string;
  folder: string;
  value: string[];
  onChange: (next: string[]) => void;
  minimum?: number;
}) {
  const { can } = useCan();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const { mutate: upload, isPending } = useMutation({
    mutationFn: (files: File[]) =>
      uploadFiles(files, { folder, visibility: "public" }),
    meta: { showToast: false },
    onSuccess: (r) => {
      const urls = r.files.map((f) => f.url).filter(Boolean) as string[];
      onChange([...value, ...urls]);
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
    upload(Array.from(files));
  };

  // POST /uploads needs inventory:write, whichever screen this sits on. Without
  // it this is a plain gallery: no picker, no drop target, no remove buttons.
  if (!can("inventory:write")) {
    return (
      <div>
        {label ? <Label className="text-xs">{label}</Label> : null}
        {value.length ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {value.map((url) => (
              <AssetImage key={url} src={url} className="size-20" />
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
            {value.map((url) => (
              <div key={url} className="group relative">
                <AssetImage src={url} className="size-20" />
                <button
                  type="button"
                  title="Remove"
                  onClick={() => onChange(value.filter((u) => u !== url))}
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
          multiple
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
            {isPending ? "Uploading…" : "Add images"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Drag and drop, or click. JPEG, PNG, WebP or AVIF, up to 8 MB each.
          </p>
        </div>
      </div>
    </div>
  );
}
