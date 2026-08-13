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
 * Usage: wrap the call. If the server answers 403 (step-up stale), this prompts
 * for the password, re-authenticates, then retries the original action once —
 * so the user never loses what they were doing to a re-auth interruption.
 */
export function useStepUp() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<(() => Promise<unknown>) | null>(null);

  const guard = useCallback(async <T,>(action: () => Promise<T>) => {
    try {
      return await action();
    } catch (err) {
      const e = err as AxiosError<{ message?: string }>;
      if (e.response?.status === 403) {
        pending.current = action as () => Promise<unknown>;
        setOpen(true);
        return undefined;
      }
      throw err;
    }
  }, []);

  const confirm = async () => {
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
