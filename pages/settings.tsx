import {
  getSettings,
  Office,
  Settings,
  updateSettings
} from "@/api/functions/admin.api";
import LocationPicker from "@/components/Form/LocationPicker";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { settle } from "@/api/functions/access.api";
import { useStepUp } from "@/components/StepUp/useStepUp";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/functions/format.lib";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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

/** The typed fields of an office; the pin and the primary flag are separate. */
type OfficeText = Exclude<keyof Office, "id" | "geo" | "isPrimary">;

const OFFICE_FIELDS: { key: OfficeText; label: string; placeholder?: string }[] = [
  { key: "name", label: "Office name *", placeholder: "Siège de Kinshasa" },
  { key: "city", label: "City *", placeholder: "Kinshasa" },
  {
    key: "streetAddress",
    label: "Street address",
    placeholder: "12, avenue Colonel Lukusa, Gombe"
  },
  { key: "phone", label: "Phone", placeholder: "+243 81 000 00 00" },
  { key: "whatsapp", label: "WhatsApp", placeholder: "+243 81 000 00 00" },
  { key: "email", label: "Email", placeholder: "kinshasa@example.cd" },
  { key: "hours", label: "Opening hours", placeholder: "Lun–Sam, 08h00–18h00" }
];

const emptyOffice = (isPrimary: boolean): Office => ({
  // randomUUID needs a secure context; a LAN dev server over http has none.
  id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
  name: "",
  city: "",
  streetAddress: "",
  phone: "",
  whatsapp: "",
  email: "",
  hours: "",
  isPrimary
});

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { guard, dialog } = useStepUp();
  // Reading is settings:read, which is what opens this page; saving is
  // settings:write. Without it every field is disabled and there is no Save.
  const { can } = useCan();
  const canWrite = can("settings:write");
  const [form, setForm] = useState<Partial<Settings>>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      // The step-up refusal opens the password prompt and retries afterwards.
      // settle() reports the outcome of whichever attempt lands, so the retry
      // is not silent and a refusal is not shown as "Incorrect password".
      guard(
        settle(
          () => updateSettings(form),
          () => {
            queryClient.invalidateQueries({ queryKey: ["settings"] });
            toast.success("Settings saved");
          },
          (message) => toast.error(message)
        )
      ),
    meta: { showToast: false }
  });

  const set = (
    key: keyof Settings,
    value: string | number | boolean | undefined
  ) => setForm((f) => ({ ...f, [key]: value }));

  // Offices travel with the rest of the form and are replaced whole on save.
  const offices = form.offices ?? [];
  const setOffices = (next: Office[]) => setForm((f) => ({ ...f, offices: next }));
  const patchOffice = (i: number, patch: Partial<Office>) =>
    setOffices(offices.map((o, n) => (n === i ? { ...o, ...patch } : o)));
  const removeOffice = (i: number) => {
    const rest = offices.filter((_, n) => n !== i);
    // The server would promote the first one anyway; show that before saving.
    if (rest.length && !rest.some((o) => o.isPrimary)) rest[0] = { ...rest[0], isPrimary: true };
    setOffices(rest);
  };

  return (
    <AdminLayout
      title="Settings"
      description="Operating thresholds — changeable without a deployment"
    >
      {dialog}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        // Without the real values an editable form with Save enabled would let
        // a blank save overwrite live thresholds, so show the error instead.
        <QueryError onRetry={() => refetch()} />
      ) : (
        <div className="flex max-w-4xl flex-col gap-6">
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">General</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Company name</Label>
                <Input
                  disabled={!canWrite}
                  value={form.companyName ?? ""}
                  onChange={(e) => set("companyName", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Support email</Label>
                <Input
                  disabled={!canWrite}
                  value={form.supportEmail ?? ""}
                  onChange={(e) => set("supportEmail", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Support phone</Label>
                <Input
                  disabled={!canWrite}
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

          {/* Offices are the ONLY settings the public site can read, and the
              ones the office actually changes — they used to be hardcoded in
              the footer, the contact page and the homepage structured data, so
              a new phone number meant a deploy. */}
          <Card className="gap-0 p-5">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">Offices</h2>
              {canWrite ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={offices.length >= 20}
                  onClick={() => setOffices([...offices, emptyOffice(!offices.length)])}
                >
                  <Plus className="size-4" />
                  Add office
                </Button>
              ) : null}
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Each office is listed in the website footer with its address, phone,
              email and opening hours. The primary one is the main contact: it is
              what the homepage, the contact page and the search-engine listing
              show.
            </p>
            {!offices.length ? (
              <p className="text-sm text-muted-foreground">
                No offices yet — the website shows only the support phone and email
                from General.
              </p>
            ) : null}
            <div className="flex flex-col gap-4">
              {offices.map((o, i) => (
                <div key={o.id} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="primary-office"
                        disabled={!canWrite}
                        checked={o.isPrimary}
                        onChange={() =>
                          setOffices(offices.map((x, n) => ({ ...x, isPrimary: n === i })))
                        }
                      />
                      Primary
                    </label>
                    {canWrite ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Remove office"
                        className="ml-auto"
                        onClick={() => removeOffice(i)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {OFFICE_FIELDS.map(({ key, label, placeholder }) => (
                      <div key={key} className={key === "streetAddress" ? "sm:col-span-2" : undefined}>
                        <Label className="text-xs">{label}</Label>
                        <Input
                          disabled={!canWrite}
                          value={o[key] ?? ""}
                          placeholder={placeholder}
                          onChange={(e) => patchOffice(i, { [key]: e.target.value })}
                        />
                      </div>
                    ))}
                    <div className="sm:col-span-2">
                      <LocationPicker
                        compact
                        label="Location on the map (optional)"
                        disabled={!canWrite}
                        city={o.city}
                        value={o.geo ?? null}
                        onChange={(geo) => patchOffice(i, { geo: geo ?? undefined })}
                      />
                    </div>
                  </div>
                </div>
              ))}
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
                    disabled={!canWrite}
                    type="number"
                    value={(form[key] as number) ?? ""}
                    onChange={(e) => {
                      // Clearing a field means "leave it unchanged", not 0:
                      // coercing "" to 0 silently zeroed guards and TTLs.
                      const v = e.target.value;
                      const n = Number(v);
                      set(key, v === "" || Number.isNaN(n) ? undefined : n);
                    }}
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
                disabled={!canWrite}
                onCheckedChange={(v) => set("maintenanceMode", v)}
              />
            </div>
          </Card>

          <div className="flex items-center gap-3">
            {canWrite ? (
              <Button onClick={() => save()} disabled={isPending}>
                Save settings
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {canWrite
                ? "Saving asks for your password again and is written to the audit log. "
                : null}
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
