import { assetUrl } from "@/api/endpoints";
import { MAX_VIDEO_MB, uploadVideo } from "@/api/functions/admin.api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import axios, { AxiosError } from "axios";
import { Film } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * The optional video of a hotel, restaurant or listing: one file, uploaded
 * here.
 *
 * Like the gallery, it stores the address the server answers with, not the
 * file — and like the gallery, that address only reaches the record when the
 * form is saved. Unlike a photo, a video is large and slow to send, so the
 * upload shows how far it has got, can be cancelled, and is refused before it
 * starts when the server would refuse it anyway.
 */

const MB = 1024 * 1024;

/**
 * Whether this browser can play the file, asked before any of it is sent. A
 * clip in a format the office's own browser cannot show (an iPhone's "High
 * Efficiency" recording on an older PC, say) would not play for most customers
 * either, and finding that out after a ten-minute upload helps nobody.
 */
const playable = (file: File, stop: AbortSignal) =>
  new Promise<boolean>((resolve) => {
    const probe = document.createElement("video");
    const url = URL.createObjectURL(file);
    const answer = (ok: boolean) => {
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    probe.preload = "metadata";
    probe.muted = true;
    // Sound with no picture is not a video.
    probe.onloadedmetadata = () => answer(probe.videoWidth > 0);
    probe.onerror = () => answer(false);
    // A browser that says nothing either way gets the benefit of the doubt:
    // the server still checks what the file is.
    setTimeout(() => answer(true), 8000);
    // Cancelled while still being asked: there is no answer worth waiting for.
    stop.addEventListener("abort", () => answer(false));
    probe.src = url;
  });

export default function VideoField({
  value,
  onChange,
  onBusy,
  saving,
  disabled
}: {
  /** The stored address of the video, or "" when the item has none. */
  value: string;
  onChange: (next: string) => void;
  /**
   * Told while a video is on its way. The form must not be saved (or left)
   * in that time: a save would store the item without the video being sent,
   * and on the forms that move on after saving it would stop the upload too.
   */
  onBusy?: (busy: boolean) => void;
  /**
   * The form is being saved: no video can be chosen or removed for that
   * moment. One started then would be cancelled by the move to the saved
   * record's page, and the save already on its way does not carry it.
   */
  saving?: boolean;
  /** Read-only: the video still plays, nothing can be changed. */
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  // null when nothing is being sent; "check" while the browser is asked
  // whether it can play the file; otherwise how much of it has gone.
  const [progress, setProgress] = useState<number | "check" | null>(null);
  const [problem, setProblem] = useState("");
  const sending = useRef<AbortController | null>(null);
  // Leaving the form (or moving to another record) stops an upload nobody
  // will be there to keep.
  useEffect(() => () => sending.current?.abort(), []);

  const send = async (file: File) => {
    setProblem("");
    if (
      !/\.(mp4|m4v|mov|webm)$/i.test(file.name) &&
      !/^video\/(mp4|quicktime|x-m4v|webm)$/.test(file.type)
    ) {
      return setProblem("Choose a video file: MP4, MOV or WebM.");
    }
    if (file.size > MAX_VIDEO_MB * MB) {
      return setProblem(
        `That video is ${Math.ceil(file.size / MB)} MB and the limit is ${MAX_VIDEO_MB} MB — about a minute filmed on a phone. Trim it, or export it at a lower quality, and try again.`
      );
    }
    // Made before anything else is awaited, so that Cancel — and leaving the
    // form — stop it from the first moment, the check included.
    const stop = (sending.current = new AbortController());
    setProgress("check");
    onBusy?.(true);
    try {
      if (!(await playable(file, stop.signal))) {
        if (!stop.signal.aborted) {
          setProblem(
            "This browser cannot play that video, so most customers could not either. Convert it to MP4 (H.264) and try again."
          );
        }
        return;
      }
      if (stop.signal.aborted) return;
      setProgress(0);
      const url = await uploadVideo(file, {
        signal: stop.signal,
        onProgress: setProgress
      });
      if (!url) throw new Error("no address");
      onChange(url);
      toast.success("Video uploaded — save to keep it");
    } catch (e) {
      // Cancelled on purpose: nothing to report.
      if (!axios.isCancel(e) && !stop.signal.aborted) {
        setProblem(
          (e as AxiosError<{ message?: string }>).response?.data?.message ??
            "The upload did not finish. Check the connection and try again."
        );
      }
    } finally {
      if (sending.current === stop) sending.current = null;
      setProgress(null);
      onBusy?.(false);
    }
  };

  return (
    <div>
      <Label className="text-xs">Video (optional)</Label>
      <div className="mt-1 rounded-lg border border-dashed border-muted-foreground/30 p-4">
        {value ? (
          // Keyed by its address so a replaced video is loaded, not the one
          // before it resumed.
          <video
            key={value}
            controls
            preload="metadata"
            src={assetUrl(value)}
            className="mb-3 aspect-video w-full max-w-sm rounded border bg-black"
          />
        ) : null}
        {progress !== null ? (
          <div className="flex flex-wrap items-center gap-3">
            <Progress
              value={progress === "check" ? 0 : progress}
              className="w-48"
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {progress === "check"
                ? "Checking the video…"
                : progress < 100
                  ? `Uploading… ${progress}%`
                  : "Finishing…"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => sending.current?.abort()}
            >
              Cancel
            </Button>
            <span className="basis-full text-[11px] text-muted-foreground">
              Keep this page open until the video has arrived. Save is available
              again then.
            </span>
          </div>
        ) : disabled ? (
          value ? null : (
            <p className="text-xs text-muted-foreground">No video.</p>
          )
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              type="file"
              aria-label="Video file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset so choosing the same file again still fires.
                e.target.value = "";
                if (file) void send(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={saving}
              onClick={() => input.current?.click()}
            >
              <Film className="size-4" />
              {value ? "Replace video" : "Upload a video"}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setProblem("");
                  onChange("");
                }}
              >
                Remove video
              </Button>
            ) : null}
          </div>
        )}
        {problem ? (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
      {disabled ? null : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          MP4, MOV or WebM, up to {MAX_VIDEO_MB} MB — about a minute filmed on a
          phone. It is shown with the photos on the website and in the app, and
          a visitor downloads none of it until they press play.
        </p>
      )}
    </div>
  );
}
