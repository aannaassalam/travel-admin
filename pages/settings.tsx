import {
  getSettings,
  Settings,
  updateSettings
} from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import { useStepUp } from "@/components/StepUp/useStepUp";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/functions/format.lib";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * §12: everything here is changeable without a deployment. §15 lists "making
 * the owner wait for a developer to change a homepage banner or policy text"
 * as a thing to avoid — this is the same principle for operating thresholds.
 */

const NUMERIC: { key: keyof Settings; label: string; hint: string }[] = [
  {
    key: "priceChangeGuardPercent",
    label: "Price-change guard (%)",
    hint: "Edits moving a published price by more than this need typed confirmation."
  },
  {
    key: "atRiskWindowDays",
    label: "At-risk window (days)",
    hint: "How far ahead the dashboard counts unsold stock as at risk."
  },
  {
    key: "enquirySlaHours",
    label: "Enquiry SLA (hours)",
    hint: "First contact deadline before an enquiry escalates."
  },
  {
    key: "exceptionRateAlertPercent",
    label: "Exception rate alert (%)",
    hint: "Payment providers terminate accounts over dispute ratios — see it first."
  },
  {
    key: "holdTtlOnlineMinutes",
    label: "Online hold TTL (minutes)",
    hint: "How long checkout locks inventory."
  },
  {
    key: "holdTtlCashHours",
    label: "Cash hold TTL (hours)",
    hint: "How long a cash order holds stock before auto-release."
  },
  {
    key: "maxConcurrentCashHolds",
    label: "Max cash holds per customer",
    hint: "Limits one person locking up inventory they never collect."
  },
  {
    key: "customerExportRowCap",
    label: "Customer export row cap",
    hint: "Raising this is itself an alerted change."
  },
  {
    key: "passportRetentionDays",
    label: "Passport retention (days after travel)",
    hint: "Data no longer held cannot be leaked — the cheapest control there is."
  }
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { guard, dialog } = useStepUp();
  const [form, setForm] = useState<Partial<Settings>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      // Wrapped: a 403 opens the step-up prompt and retries afterwards.
      guard(() => updateSettings(form)),
    meta: { showToast: false },
    onSuccess: (result) => {
      if (!result) return; // step-up prompt opened; retry will follow
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
    }
  });

  const set = (key: keyof Settings, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <AdminLayout
      title="Settings"
      description="Operating thresholds — changeable without a deployment"
    >
      {dialog}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex max-w-4xl flex-col gap-6">
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">General</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Company name</Label>
                <Input
                  value={form.companyName ?? ""}
                  onChange={(e) => set("companyName", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Support email</Label>
                <Input
                  value={form.supportEmail ?? ""}
                  onChange={(e) => set("supportEmail", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Support phone</Label>
                <Input
                  value={form.supportPhone ?? ""}
                  onChange={(e) => set("supportPhone", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Base currency</Label>
                <Input value={form.baseCurrency ?? ""} disabled />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  All prices are stored in this currency.
                </p>
              </div>
            </div>
          </Card>

          <Card className="gap-0 p-5">
            <h2 className="mb-1 text-sm font-medium">Thresholds &amp; rules</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              These drive the guards and alerts across the panel.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {NUMERIC.map(({ key, label, hint }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number"
                    value={(form[key] as number) ?? ""}
                    onChange={(e) => set(key, Number(e.target.value))}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="gap-0 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium">Maintenance mode</h2>
                <p className="text-xs text-muted-foreground">
                  Takes the public site offline. The admin panel stays up.
                </p>
              </div>
              <Switch
                checked={Boolean(form.maintenanceMode)}
                onCheckedChange={(v) => set("maintenanceMode", v)}
              />
            </div>
          </Card>

          <div className="flex items-center gap-3">
            <Button onClick={() => save()} disabled={isPending}>
              Save settings
            </Button>
            <p className="text-xs text-muted-foreground">
              Saving asks for your password again and is written to the audit log.
              Last saved {formatDateTime(data?.updatedAt)}.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Payment provider credentials are deliberately absent from this
            screen: they are write-only by design, and no provider is wired up
            yet.
          </p>
        </div>
      )}
    </AdminLayout>
  );
}
