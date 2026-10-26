import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, type Currency } from "@/lib/functions/format.lib";
import { cn } from "@/lib/utils";

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
 * A price, in Congolese francs only.
 *
 * The office enters every price in whole francs; the server works out USD and
 * EUR from the exchange rates in Settings, so a rate change moves every price
 * at once. Francs are also the reporting base: margin and every dashboard total
 * sum them.
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
  const dollars = stillInDollars(value);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="relative mt-1 max-w-56">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
          FC
        </span>
        <Input
          type="number"
          min={0}
          step="1"
          inputMode="numeric"
          className="pl-10"
          value={value?.CDF ?? ""}
          disabled={disabled}
          placeholder={requireBase ? "required" : "—"}
          // The first keystroke drops the dollars: from then on it is francs.
          onChange={(e) => onChange({ CDF: e.target.value })}
        />
      </div>
      <p
        className={cn(
          "mt-1 text-[11px]",
          dollars ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
        )}
      >
        {dollars
          ? `Not converted yet: ${formatMoney(Number(value.USD), "USD")} from before prices were in francs. Leave it for the conversion, or type the price in FC.`
          : (hint ?? "Whole francs. USD and EUR are worked out from the exchange rates in Settings.")}
      </p>
    </div>
  );
}
