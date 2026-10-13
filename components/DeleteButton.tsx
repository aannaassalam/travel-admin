import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { STEP_UP_REQUIRED, useStepUp } from "@/components/StepUp/useStepUp";
import { useCan, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { AxiosError } from "axios";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Deletes a record for good — the one control for it, wherever a record can be
 * deleted. Not shown at all to an admin without the delete permission.
 *
 * It asks first, naming what goes and what goes with it. The server then wants
 * the admin's password if it was not given in the last few minutes, and, when
 * bookings in progress name the record, refuses once with their number so the
 * admin can decide knowing it. Archiving and deactivating are other buttons:
 * this one cannot be undone.
 */
export default function DeleteButton({
  permission,
  what,
  consequence,
  onDelete,
  onDeleted,
  label,
  className,
  disabled
}: {
  /** The delete permission of the record's area; without it nothing is rendered. */
  permission: Permission;
  /** What is being deleted, as the question names it: `the hotel “Pullman”`. */
  what: string;
  /** What goes with it, or what stays — one sentence. */
  consequence?: string;
  /** The call. `confirmed` is true once the admin has accepted the bookings-in-progress warning. */
  onDelete: (confirmed: boolean) => Promise<unknown>;
  onDeleted?: () => void;
  /** Words on the button; without them it is the bin alone (for a row of a list). */
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { can } = useCan();
  const { guard, dialog } = useStepUp();
  // The question on screen is the first one, or — with a warning — the
  // server's, about bookings in progress. Which of the two is kept apart from
  // whether it is open, so the words do not change while it fades out.
  const [open, setOpen] = useState(false);
  const [warning, setWarning] = useState<string>();
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  // The second question takes the place of the first, with the button that
  // was just pressed still under the finger: like the first, it starts on
  // Cancel, so Enter pressed twice by habit does not answer it.
  useEffect(() => {
    if (open && warning && !busy) cancel.current?.focus();
  }, [open, warning, busy]);
  if (!can(permission)) return null;

  const run = (confirmed: boolean) =>
    // The password prompt, when it is wanted, runs this same action again —
    // so everything that shows a delete is under way is inside it, and holds
    // for that second try as well.
    guard(async () => {
      // The question stays up, saying "Deleting…", until the server has
      // answered (and comes back up for the try after the password). Closed
      // while waiting and opened again for the second question, it came back
      // — when the answer was quick — with its buttons under the dimmed page,
      // where they could not be pressed.
      setBusy(true);
      setOpen(true);
      try {
        await onDelete(confirmed);
        setOpen(false);
        toast.success("Deleted");
        onDeleted?.();
      } catch (err) {
        const res = (err as AxiosError<{ message?: string; code?: string }>)
          .response;
        if (res?.status === 403 && res.data?.code === STEP_UP_REQUIRED) {
          // The password prompt takes over from here.
          setOpen(false);
          throw err;
        }
        if (
          res?.status === 409 &&
          res.data?.code === "OPEN_BOOKINGS" &&
          !confirmed
        ) {
          // In the question's place: it is still open.
          return setWarning(res.data.message);
        }
        setOpen(false);
        toast.error(res?.data?.message ?? "Could not delete it. Try again.");
      } finally {
        setBusy(false);
      }
    });

  return (
    <>
      <Button
        type="button"
        variant={label ? "outline" : "ghost"}
        size={label ? "sm" : "icon"}
        title="Delete for good"
        aria-label={label ? undefined : `Delete ${what}`}
        disabled={disabled || busy}
        className={cn(
          "text-destructive hover:text-destructive",
          label && "gap-2",
          className
        )}
        // A row may be a link or open a dialog of its own; the bin is neither.
        onClick={(e) => {
          e.stopPropagation();
          setWarning(undefined);
          setOpen(true);
        }}
      >
        <Trash2 className="size-4" />
        {label}
      </Button>
      <AlertDialog
        open={open}
        // Not while it is being deleted: the answer has to land somewhere.
        onOpenChange={(next) => !next && !busy && setOpen(false)}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {warning ? "Bookings in progress" : `Delete ${what}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {warning ? (
                // Said aloud when it takes the question's place: the window
                // does not open again, so nothing else would announce it.
                <span role="alert">{warning}</span>
              ) : (
                `${consequence ? `${consequence} ` : ""}This cannot be undone.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancel} disabled={busy}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => run(Boolean(warning))}
            >
              {busy
                ? "Deleting…"
                : warning
                  ? "Delete anyway"
                  : "Delete for good"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* The password prompt is drawn elsewhere on the page but still belongs
          to this button: a press inside it must not reach a row that opens
          on a click either. */}
      <span className="contents" onClick={(e) => e.stopPropagation()}>
        {dialog}
      </span>
    </>
  );
}
