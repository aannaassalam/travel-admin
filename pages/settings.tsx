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
import { formatDateTime, formatMoney, fromBase } from "@/lib/functions/format.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
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
    key: "enquirySlaHours",
    label: "Enquiry SLA (hours)",
    hint: "First contact deadline before an enquiry escalates."
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

/**
 * Saves the form. A rate that moves by more than the price guard comes back as
 * 409 RATE_CHANGE_CONFIRM: every USD or EUR price moves with it, so the admin
 * is asked once, in the server's words, before it is sent again.
 */
const send = async (form: Partial<Settings>) => {
  try {
    return await updateSettings(form);
  } catch (err) {
    const res = (err as AxiosError<{ message?: string; code?: string }>).response;
    if (
      res?.status === 409 &&
      res.data?.code === "RATE_CHANGE_CONFIRM" &&
      window.confirm(res.data.message ?? "This changes an exchange rate a lot. Save anyway?")
    ) {
      return await updateSettings({ ...form, confirmRateChange: true });
    }
    throw err;
  }
};

/** The two rates, each typed and stored as francs per 1 unit. */
const RATES = [
  { currency: "USD", placeholder: "2850" },
  { currency: "EUR", placeholder: "3100" }
] as const;

/** What 10 000 FC comes to at the rates typed, as the website will show it. */
const example = (rates: Settings["exchangeRates"] | undefined, locale: string) => {
  const shown = RATES.flatMap(({ currency }) => {
    const cents = fromBase(10_000, currency, rates ?? {});
    return cents === undefined ? [] : [formatMoney(cents, currency)];
  });
  return shown.length
    ? `${formatMoney(10_000, "CDF", locale)} shows as ${shown.join(" · ")} (rounded up to the cent).`
    : "No rate set: prices show in francs only.";
};

/**
 * A stored rate to the hundredth of a franc, as the box shows it and a save
 * sends it back: a euro rate worked out by the conversion to francs is a
 * division (3 097.826086… FC per euro).
 */
const toCentime = (rate?: number | null) =>
  typeof rate === "number" ? Math.round(rate * 100) / 100 : rate;

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { guard, dialog } = useStepUp();
  // Reading is settings:read, which is what opens this page; saving is
  // settings:write. Without it every field is disabled and there is no Save.
  const { can } = useCan();
  const canWrite = can("settings:write");
  const [form, setForm] = useState<Partial<Settings>>({});
  const { locale } = useT();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings
  });

  useEffect(() => {
    if (data) {
      setForm({
        ...data,
        exchangeRates: {
          USD: toCentime(data.exchangeRates?.USD),
          EUR: toCentime(data.exchangeRates?.EUR)
        }
      });
    }
  }, [data]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      // The step-up refusal opens the password prompt and retries afterwards.
      // settle() reports the outcome of whichever attempt lands, so the retry
      // is not silent and a refusal is not shown as "Incorrect password".
      guard(
        settle(
          () => send(form),
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
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Each stage of a booking is e-mailed here (new, paid, confirmed, documents,
                  completed). When empty, the primary office&apos;s e-mail is used.
                </p>
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

          <Card className="gap-0 p-5">
            <h2 className="mb-1 text-sm font-medium">Exchange rates</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Prices are entered in Congolese francs. Type what one US dollar and one euro are
              worth in francs: every dollar and euro price on the website and the app is worked
              out from these as soon as you save; bookings already made keep the rate they were
              made at. Leave a box blank to stop offering that currency.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {RATES.map(({ currency, placeholder }) => {
                const value = form.exchangeRates?.[currency];
                // The server refuses the same: 0.00043 typed for 2 300 priced everything at 0 FC.
                const off = typeof value === "number" && !(value >= 100 && value <= 100_000);
                const flipped =
                  typeof value === "number" && value > 0 && value < 1 ? Math.round(1 / value) : 0;
                return (
                  <div key={currency}>
                    <Label className="text-xs">1 {currency} = … FC</Label>
                    <Input
                      type="number"
                      min={100}
                      max={100000}
                      step="any"
                      aria-invalid={off}
                      disabled={!canWrite}
                      value={value ?? ""}
                      placeholder={placeholder}
                      onChange={(e) => {
                        // Stored as typed; blank (null) stops offering it.
                        const next = e.target.value === "" ? null : Number(e.target.value);
                        setForm((f) => ({
                          ...f,
                          exchangeRates: { ...f.exchangeRates, [currency]: next }
                        }));
                      }}
                    />
                    {off ? (
                      <p className="mt-1 text-[11px] text-destructive">
                        Enter how many francs one {currency === "USD" ? "dollar" : "euro"} buys,
                        between 100 and {(100_000).toLocaleString(locale)} (like {placeholder}).
                        {flipped
                          ? ` ${value} is the other way round: 1 ${currency} = ${flipped.toLocaleString(locale)} FC.`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{example(form.exchangeRates, locale)}</p>
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
            <h2 className="mb-1 text-sm font-medium">Transfers</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Rides with a driver, booked under Transfers.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Security alert phone</Label>
                <Input
                  type="tel"
                  disabled={!canWrite}
                  value={form.transferAlertPhone ?? ""}
                  placeholder="+243 81 000 00 00"
                  onChange={(e) => set("transferAlertPhone", e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Where a customer&apos;s or driver&apos;s security alert is sent by SMS, in
                  international format (+243…). Leave blank to use the primary office phone.
                </p>
              </div>
              <div>
                <Label className="text-xs">Road distance estimate factor</Label>
                <Input
                  type="number"
                  min={1}
                  max={3}
                  step="0.1"
                  disabled={!canWrite}
                  value={form.transferDetourFactor ?? ""}
                  placeholder="1.3"
                  onChange={(e) => {
                    // Clearing means "leave it unchanged", not 0 (see the thresholds above).
                    const v = e.target.value;
                    const n = Number(v);
                    set("transferDetourFactor", v === "" || Number.isNaN(n) ? undefined : n);
                  }}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  When the routing service cannot be reached, the straight-line distance is
                  multiplied by this to price the ride (1.3: roads are about 30% longer).
                  Between 1 and 3.
                </p>
              </div>
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
