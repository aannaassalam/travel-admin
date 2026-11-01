import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDisplayCurrency } from "@/lib/displayCurrency";
import {
  BASE_CURRENCY,
  formatFC,
  formatMoney,
  fromBase,
  toBase,
  type Currency
} from "@/lib/functions/format.lib";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { useState } from "react";

/** Whole francs for CDF, cents for USD and EUR. */
export type Money = Partial<Record<Currency, number>>;

/**
 * The stored francs as the box shows them.
 *
 * A record the one-off conversion to francs (migrate:cdf) has not reached yet
 * still has its dollar price (`USD`, in cents), beside the `CDF` of 0 the
 * server fills in. Neither is a franc price, so the box is blank. The dollars
 * ride along in the form: the hint names them, and while nobody types in the
 * box the save leaves the price out, for the conversion to turn into francs.
 * (Writing the box back would replace that price with nothing.)
 */
export const moneyToForm = (m?: Money | number): Record<string, string> => {
  if (m && typeof m === "object" && typeof m.USD === "number") return { CDF: "", USD: String(m.USD) };
  const cdf = typeof m === "number" ? m : m?.CDF;
  return { CDF: typeof cdf === "number" ? String(cdf) : "" };
};

/** A box still holding a dollar price nobody has retyped in francs. */
export const stillInDollars = (f?: Record<string, string>) =>
  f?.USD !== undefined && (f.CDF ?? "") === "";

/**
 * The box as the server takes it: whole francs, or `{}` for a blank box (no
 * price) — and nothing at all for a dollar price nobody has retyped.
 */
export const formToMoney = (f: Record<string, string>): Money | undefined => {
  if (stillInDollars(f)) return undefined;
  const raw = f?.CDF;
  if (raw === "" || raw === undefined || raw === null) return {};
  const n = Number(raw);
  return Number.isNaN(n) ? {} : { CDF: Math.round(n) };
};

/**
 * A price, stored in Congolese francs only.
 *
 * The office enters every price in whole francs; the server works out USD and
 * EUR from the exchange rates in Settings, so a rate change moves every price
 * at once. Francs are also the reporting base: margin and every dashboard total
 * sum them.
 *
 * A panel read in another currency (the header's switch) types the price in
 * that currency: the box turns it into whole francs at the office's rate and
 * says what it will save ("= 285 000 FC"). The form only ever holds francs.
 */
export default function MoneyInput({
  label,
  value,
  onChange,
  requireBase,
  hint,
  disabled
}: {
  label: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  requireBase?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const { t, locale } = useT();
  const { currency, rates } = useDisplayCurrency();
  const rate = currency === BASE_CURRENCY ? undefined : (rates[currency] ?? undefined);
  const dollars = stillInDollars(value);
  const francs = value?.CDF ?? "";
  // What was typed in the display currency, shown while the francs in the form
  // are still the ones it gave: "10." must not turn into "10" mid-typing.
  const [typed, setTyped] = useState<{ text: string; francs: string }>();
  const shown = !rate
    ? francs
    : typed && typed.francs === francs
      ? typed.text
      : francs === ""
        ? ""
        : String((fromBase(Number(francs), currency, rates) ?? 0) / 100);
  const change = (text: string) => {
    if (!rate) return onChange({ CDF: text });
    const n = Number(text);
    const next = text === "" || !Number.isFinite(n) ? "" : String(toBase(n, rate));
    setTyped({ text, francs: next });
    onChange({ CDF: next });
  };
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="relative mt-1 max-w-56">
        <span className="pointer-events-none absolute start-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
          {rate ? currency : "FC"}
        </span>
        <Input
          type="number"
          min={0}
          step={rate ? "0.01" : "1"}
          inputMode={rate ? "decimal" : "numeric"}
          className="ps-10"
          value={shown}
          disabled={disabled}
          placeholder={requireBase ? t("common.required") : "—"}
          // The first keystroke drops the dollars: from then on it is francs.
          onChange={(e) => change(e.target.value)}
        />
      </div>
      <p
        className={cn(
          "mt-1 text-[11px]",
          dollars ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
        )}
      >
        {dollars ? (
          t("money.notConverted", { amount: formatMoney(Number(value.USD), "USD", locale) })
        ) : (
          <>
            {rate && francs !== "" ? (
              <span className="font-medium tabular-nums text-foreground">
                = {formatFC(Number(francs), locale)}{" "}
              </span>
            ) : null}
            {hint ?? (rate ? t("money.hintConverted", { code: currency }) : t("money.hint"))}
          </>
        )}
      </p>
    </div>
  );
}
