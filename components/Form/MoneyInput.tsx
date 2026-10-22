import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const CURRENCIES = ["USD", "CDF", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const BASE_CURRENCY: Currency = "USD";

/** Minor units on the wire, major units in the box. */
export type Money = Partial<Record<Currency, number>>;

/** The stored USD amount as the box shows it. */
export const moneyToForm = (m?: Money | number): Record<string, string> => {
  const usd = typeof m === "number" ? m : m?.USD;
  return { USD: typeof usd === "number" ? String(usd / 100) : "" };
};

/** The box as the server takes it: USD minor units, or nothing for a blank box. */
export const formToMoney = (f: Record<string, string>): Money => {
  const raw = f?.USD;
  if (raw === "" || raw === undefined || raw === null) return {};
  const n = Number(raw);
  return Number.isNaN(n) ? {} : { USD: Math.round(n * 100) };
};

/**
 * A price, in USD only.
 *
 * The office enters every price in dollars; the server works out CDF and EUR
 * from the exchange rates in Settings, so a rate change moves every price at
 * once. USD is also the reporting base: margin and every dashboard total sum it.
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
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="relative mt-1 max-w-56">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
          USD
        </span>
        <Input
          type="number"
          min={0}
          step="0.01"
          className="pl-10"
          value={value?.USD ?? ""}
          disabled={disabled}
          placeholder={requireBase ? "required" : "—"}
          onChange={(e) => onChange({ USD: e.target.value })}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {hint ?? "CDF and EUR are worked out from the exchange rates in Settings."}
      </p>
    </div>
  );
}
