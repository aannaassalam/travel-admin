import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const CURRENCIES = ["USD", "CDF", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const BASE_CURRENCY: Currency = "USD";

/** Minor units on the wire, major units in the box. */
export type Money = Partial<Record<Currency, number>>;

export const moneyToForm = (m?: Money | number) => {
  if (typeof m === "number") return { USD: String(m / 100) };
  return Object.fromEntries(
    CURRENCIES.map((c) => [
      c,
      typeof m?.[c] === "number" ? String(m![c]! / 100) : ""
    ])
  ) as Record<Currency, string>;
};

export const formToMoney = (f: Record<string, string>): Money => {
  const out: Money = {};
  CURRENCIES.forEach((c) => {
    const raw = f[c];
    // A blank box means "not sold in this currency" — never zero.
    if (raw === "" || raw === undefined || raw === null) return;
    const n = Number(raw);
    if (!Number.isNaN(n)) out[c] = Math.round(n * 100);
  });
  return out;
};

/**
 * A price per currency, typed by hand.
 *
 * Deliberately no conversion — not a live preview, not a "fill from FX rate"
 * button. A converted number drifts between the moment a customer sees it and
 * the moment they pay, and with no refunds that gap is a dispute. What is typed
 * here is what gets charged.
 *
 * USD is required because it is the reporting base: margin, spoilage and every
 * dashboard total have to sum in one currency. Leaving CDF or EUR blank simply
 * means the item is not offered in that currency.
 */
export default function MoneyInput({
  label,
  value,
  onChange,
  requireBase,
  hint
}: {
  label: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  requireBase?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {CURRENCIES.map((c) => (
          <div key={c}>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
                {c}
              </span>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="pl-10"
                value={value?.[c] ?? ""}
                placeholder={c === BASE_CURRENCY && requireBase ? "required" : "—"}
                onChange={(e) => onChange({ ...value, [c]: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {hint ??
          "Typed per currency — no conversion. Leave a box empty to not sell in that currency."}
        {requireBase ? " USD is required; all reporting totals in USD." : ""}
      </p>
    </div>
  );
}
