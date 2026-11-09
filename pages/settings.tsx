import {
  getSettings,
  Office,
  Settings,
  updateSettings
} from "@/api/functions/admin.api";
import LocalizedInput from "@/components/Form/LocalizedInput";
import LocationPicker from "@/components/Form/LocationPicker";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { settle } from "@/api/functions/access.api";
import { useStepUp } from "@/components/StepUp/useStepUp";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SITE_CURRENCIES_QUERY } from "@/lib/displayCurrency";
import { formatDateTime, formatFC, formatMoney, fromBase } from "@/lib/functions/format.lib";
import { toLocalized } from "@/lib/functions/localized.lib";
import { numberLocale } from "@/lib/i18n/dictionaries";
import type { TranslationKey } from "@/lib/i18n/messages";
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

const NUMERIC: { key: keyof Settings; label: TranslationKey; hint: TranslationKey }[] = [
  {
    key: "priceChangeGuardPercent",
    label: "sys.settings.priceGuard",
    hint: "sys.settings.priceGuardHint"
  },
  {
    key: "enquirySlaHours",
    label: "sys.settings.enquirySla",
    hint: "sys.settings.enquirySlaHint"
  },
  // Not here (2026-11-09): the online-payment hold (online payment is off) and
  // the road estimate factor keep their server defaults.
  {
    key: "holdTtlCashHours",
    label: "sys.settings.holdCash",
    hint: "sys.settings.holdCashHint"
  },
  {
    key: "passportRetentionDays",
    label: "sys.settings.passportRetention",
    hint: "sys.settings.passportRetentionHint"
  },
  {
    key: "visaDocumentRetentionDays",
    label: "visa.settings.retention",
    hint: "visa.settings.retentionHint"
  }
];

/** The typed fields of an office; the pin, the primary flag and the hours (per language) are separate. */
type OfficeText = Exclude<keyof Office, "id" | "geo" | "isPrimary" | "hours">;

// Placeholders are sample office details, typed as the website shows them.
const OFFICE_FIELDS: { key: OfficeText; label: TranslationKey; placeholder?: string }[] = [
  { key: "name", label: "sys.settings.office.name", placeholder: "Siège de Kinshasa" },
  { key: "city", label: "sys.settings.office.city", placeholder: "Kinshasa" },
  {
    key: "streetAddress",
    label: "sys.settings.office.street",
    placeholder: "12, avenue Colonel Lukusa, Gombe"
  },
  { key: "phone", label: "sys.settings.office.phone", placeholder: "+243 81 000 00 00" },
  { key: "whatsapp", label: "sys.settings.office.whatsapp", placeholder: "+243 81 000 00 00" },
  { key: "email", label: "sys.settings.office.email", placeholder: "kinshasa@example.cd" }
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
  hours: {},
  isPrimary
});

/**
 * Saves the form. A rate that moves by more than the price guard comes back as
 * 409 RATE_CHANGE_CONFIRM: every USD or EUR price moves with it, so the admin
 * is asked once, in the server's words, before it is sent again.
 */
const send = async (form: Partial<Settings>, fallback: string) => {
  try {
    return await updateSettings(form);
  } catch (err) {
    const res = (err as AxiosError<{ message?: string; code?: string }>).response;
    if (
      res?.status === 409 &&
      res.data?.code === "RATE_CHANGE_CONFIRM" &&
      window.confirm(res.data.message ?? fallback)
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

/** What 10 000 FC comes to at the rates typed, as the website will show it. In francs on every device: it explains the rates. */
const example = (
  rates: Settings["exchangeRates"] | undefined,
  locale: string,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
) => {
  const shown = RATES.flatMap(({ currency }) => {
    const cents = fromBase(10_000, currency, rates ?? {});
    return cents === undefined ? [] : [formatMoney(cents, currency)];
  });
  return shown.length
    ? t("sys.settings.example", { amount: formatFC(10_000, locale), shown: shown.join(" · ") })
    : t("sys.settings.noRate");
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
  const { locale, t } = useT();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings
  });

  useEffect(() => {
    if (data) {
      setForm({
        ...data,
        // Hours are per language; an older office's text is the French.
        offices: data.offices?.map((o) => ({ ...o, hours: toLocalized(o.hours) })),
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
          () => send(form, t("sys.settings.rateConfirm")),
          () => {
            queryClient.invalidateQueries({ queryKey: ["settings"] });
            // The header's currency switch converts at these rates.
            queryClient.invalidateQueries({ queryKey: SITE_CURRENCIES_QUERY });
            toast.success(t("sys.settings.saved"));
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
      title={t("settings.title")}
      description={t("sys.settings.description")}
    >
      {dialog}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : isError ? (
        // Without the real values an editable form with Save enabled would let
        // a blank save overwrite live thresholds, so show the error instead.
        <QueryError onRetry={() => refetch()} />
      ) : (
        <div className="flex max-w-4xl flex-col gap-6">
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">{t("sys.settings.general")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs">{t("sys.settings.companyName")}</Label>
                <Input
                  disabled={!canWrite}
                  value={form.companyName ?? ""}
                  onChange={(e) => set("companyName", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">{t("sys.settings.supportEmail")}</Label>
                <Input
                  disabled={!canWrite}
                  value={form.supportEmail ?? ""}
                  onChange={(e) => set("supportEmail", e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("sys.settings.supportEmailHint")}
                </p>
              </div>
              <div>
                <Label className="text-xs">{t("sys.settings.supportPhone")}</Label>
                {/* Numbers read left to right in every language (+243 stays in front). */}
                <Input
                  dir="ltr"
                  disabled={!canWrite}
                  value={form.supportPhone ?? ""}
                  onChange={(e) => set("supportPhone", e.target.value)}
                />
              </div>
            </div>
          </Card>

          <Card className="gap-0 p-5">
            <h2 className="mb-1 text-sm font-medium">{t("sys.settings.rates")}</h2>
            <p className="mb-4 text-xs text-muted-foreground">{t("sys.settings.ratesIntro")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {RATES.map(({ currency, placeholder }) => {
                const value = form.exchangeRates?.[currency];
                // The server refuses the same: 0.00043 typed for 2 300 priced everything at 0 FC.
                const off = typeof value === "number" && !(value >= 100 && value <= 100_000);
                const flipped =
                  typeof value === "number" && value > 0 && value < 1 ? Math.round(1 / value) : 0;
                return (
                  <div key={currency}>
                    <Label className="text-xs">{t("sys.settings.rateLabel", { currency })}</Label>
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
                        {t(currency === "USD" ? "sys.settings.rateRangeUSD" : "sys.settings.rateRangeEUR", {
                          max: (100_000).toLocaleString(numberLocale(locale)),
                          example: placeholder
                        })}
                        {flipped
                          ? ` ${t("sys.settings.rateFlipped", {
                              value,
                              currency,
                              flipped: flipped.toLocaleString(numberLocale(locale))
                            })}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{example(form.exchangeRates, locale, t)}</p>
          </Card>

          {/* Offices are the ONLY settings the public site can read, and the
              ones the office actually changes — they used to be hardcoded in
              the footer, the contact page and the homepage structured data, so
              a new phone number meant a deploy. */}
          <Card className="gap-0 p-5">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">{t("sys.settings.offices")}</h2>
              {canWrite ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={offices.length >= 20}
                  onClick={() => setOffices([...offices, emptyOffice(!offices.length)])}
                >
                  <Plus className="size-4" />
                  {t("sys.settings.addOffice")}
                </Button>
              ) : null}
            </div>
            <p className="mb-4 text-xs text-muted-foreground">{t("sys.settings.officesIntro")}</p>
            {!offices.length ? (
              <p className="text-sm text-muted-foreground">{t("sys.settings.noOffices")}</p>
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
                      {t("sys.settings.primary")}
                    </label>
                    {canWrite ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("sys.settings.removeOffice")}
                        className="ms-auto"
                        onClick={() => removeOffice(i)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {OFFICE_FIELDS.map(({ key, label, placeholder }) => (
                      <div key={key} className={key === "streetAddress" ? "sm:col-span-2" : undefined}>
                        <Label className="text-xs">{t(label)}</Label>
                        <Input
                          dir={key === "phone" || key === "whatsapp" ? "ltr" : undefined}
                          disabled={!canWrite}
                          value={o[key] ?? ""}
                          placeholder={placeholder}
                          onChange={(e) => patchOffice(i, { [key]: e.target.value })}
                        />
                      </div>
                    ))}
                    <LocalizedInput
                      disabled={!canWrite}
                      label={t("sys.settings.office.hours")}
                      value={toLocalized(o.hours)}
                      placeholder="Lun–Sam, 08h00–18h00"
                      onChange={(hours) => patchOffice(i, { hours })}
                    />
                    <div className="sm:col-span-2">
                      <LocationPicker
                        compact
                        label={t("sys.settings.officeMap")}
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
            <h2 className="mb-1 text-sm font-medium">{t("sys.settings.thresholds")}</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              {t("sys.settings.thresholdsIntro")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {NUMERIC.map(({ key, label, hint }) => (
                <div key={key}>
                  <Label className="text-xs">{t(label)}</Label>
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
                  <p className="mt-1 text-[11px] text-muted-foreground">{t(hint)}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="gap-0 p-5">
            <h2 className="mb-1 text-sm font-medium">{t("sys.settings.transfers")}</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              {t("sys.settings.transfersIntro")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs">{t("sys.settings.alertPhone")}</Label>
                <Input
                  type="tel"
                  dir="ltr"
                  disabled={!canWrite}
                  value={form.transferAlertPhone ?? ""}
                  placeholder="+243 81 000 00 00"
                  onChange={(e) => set("transferAlertPhone", e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("sys.settings.alertPhoneHint")}
                </p>
              </div>
            </div>
          </Card>

          <div className="flex items-center gap-3">
            {canWrite ? (
              <Button onClick={() => save()} disabled={isPending}>
                {t("sys.settings.save")}
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {canWrite ? t("sys.settings.saveNote") : null}
              {t("sys.lastSaved", { date: formatDateTime(data?.updatedAt) })}
            </p>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
