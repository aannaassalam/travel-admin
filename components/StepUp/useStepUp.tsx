import { stepUp } from "@/api/functions/admin.api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AxiosError } from "axios";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * §1.3: step-up re-authentication before settings changes, FX rate changes,
 * payment exceptions, exports and unmasking passport data.
 *
 * Usage: wrap the call. If the server answers 403 STEP_UP_REQUIRED, this prompts
 * for the password, re-authenticates, then retries the original action once —
 * so the user never loses what they were doing to a re-auth interruption.
 */
export const STEP_UP_REQUIRED = "STEP_UP_REQUIRED";

export function useStepUp() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<(() => Promise<unknown>) | null>(null);

  const guard = useCallback(async <T,>(action: () => Promise<T>) => {
    try {
      return await action();
    } catch (err) {
      const e = err as AxiosError<{ message?: string; code?: string }>;
      // Only the step-up refusal. A missing permission or a refused rule is a
      // 403 too, and re-typing the password fixes neither.
      if (e.response?.status === 403 && e.response.data?.code === STEP_UP_REQUIRED) {
        pending.current = action as () => Promise<unknown>;
        setOpen(true);
        return undefined;
      }
      throw err;
    }
  }, []);

  const confirm = async () => {
    // Guard re-entry: a second Enter (or click) while the first is in flight
    // would fire a second step-up and a second retry of the original action.
    if (busy || !password) return;
    setBusy(true);
    try {
      await stepUp(password);
      setOpen(false);
      setPassword("");
      const retry = pending.current;
      pending.current = null;
      if (retry) await retry();
    } catch {
      toast.error("Incorrect password");
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm it&apos;s you</DialogTitle>
          <DialogDescription>
            This action changes money, settings or personal data, so it needs
            your password again. A walked-away-from laptop should not be able to
            do this.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs">Password</Label>
          <Input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirm()}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy || !password}>
            {busy ? "Checking…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { guard, dialog };
}
