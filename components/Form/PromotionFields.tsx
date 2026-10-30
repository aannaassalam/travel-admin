import DateField from "@/components/DateField";
import MoneyInput, { formToMoney } from "@/components/Form/MoneyInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatFrancs } from "@/lib/functions/format.lib";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/** A price that can be on promotion. */
export interface PromoRow {
  /** Its old-price field, as the API names it: promoCompareAtPrice, childPromoCompareAtPrice… */
  key: string;
  label: string;
  /** Its sell price in francs, as typed in the form. */
  sell: number;
}

export interface PromotionDraft {
  /** Each price's old price as MoneyInput holds it, by field; empty for none. */
  old: Record<string, Record<string, string>>;
  /** The last day, YYYY-MM-DD, or "" for until removed: one for every price. */
  ends: string;
}

/** The one price of a room type, a dish, an activity or a property. */
export const onePrice = (sell: number): PromoRow[] => [
  { key: "promoCompareAtPrice", label: "Old price (before the promotion)", sell }
];

/** What the API takes, for the prices shown: a blank box ({}) and null clear the promotion. */
export const promotionBody = (p: PromotionDraft, keys = ["promoCompareAtPrice"]) => ({
  ...Object.fromEntries(keys.map((key) => [key, formToMoney(p.old[key] ?? {}) ?? {}])),
  promoEndsAt: p.ends || null
});

/**
 * §4: a promotion, display only — an old price shown struck through beside
 * its price, with the discount, until one last day for them all. What
 * customers pay stays the sell price. On offers (each of a car's rates, each
 * of a route's fares), room types and dishes alike.
 */
export default function PromotionFields({
  value,
  rows,
  disabled,
  onChange,
  className
}: {
  value: PromotionDraft;
  rows: PromoRow[];
  disabled?: boolean;
  onChange: (patch: Partial<PromotionDraft>) => void;
  className?: string;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const oldOf = (row: PromoRow) => Number(value.old[row.key]?.CDF) || 0;
  const single = rows.length === 1;
  // Said once: past its last day, none of the prices shows one.
  const ended =
    Boolean(value.ends && value.ends < today) && rows.some((r) => oldOf(r) > 0 && r.sell > 0);
  return (
    <div className={cn("mt-5 border-t pt-4", className)}>
      <h3 className={cn("text-sm font-medium", single ? "mb-3" : "mb-1")}>Promotion</h3>
      {single ? null : (
        <p className="mb-3 text-xs text-muted-foreground">
          Each old price is shown struck through beside its own price, with the discount.
          Customers always pay the price.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((row) => {
          const old = oldOf(row);
          // Worked out exactly as the server does (promotionPercent): what
          // customers see, and under 1 the save is refused.
          const percent = Math.round(((old - row.sell) * 100) / old);
          return (
            <div key={row.key}>
              <MoneyInput
                disabled={disabled}
                label={row.label}
                value={value.old[row.key] ?? {}}
                hint={
                  single
                    ? "Shown struck through beside the sell price, with the discount. Leave empty for no promotion. Customers always pay the sell price."
                    : "Leave empty for no promotion on this price."
                }
                onChange={(o) => onChange({ old: { ...value.old, [row.key]: o } })}
              />
              {old > 0 && row.sell > 0 && !ended ? (
                percent >= 1 ? (
                  <p className="mt-2 text-sm">
                    Customers see: <s className="text-muted-foreground">{formatFrancs(old)}</s>{" "}
                    <span className="font-medium">{formatFrancs(row.sell)}</span>{" "}
                    <Badge variant="secondary">−{percent}&nbsp;%</Badge>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    The old price must be higher than the sell price, for a discount of at least
                    1%: until it is, saving is refused.
                  </p>
                )
              ) : null}
            </div>
          );
        })}
        <div>
          <Label className="text-xs">Promotion ends on</Label>
          <div className="mt-1 max-w-56">
            <DateField
              disabled={disabled}
              aria-label="Promotion ends on"
              min={today}
              value={value.ends}
              onChange={(ends) => onChange({ ends })}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            The promotion disappears after this day. Leave empty to keep it until you remove it.
          </p>
        </div>
      </div>
      {ended ? (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
          This promotion ended on {value.ends.split("-").reverse().join("/")}: customers no
          longer see it.
        </p>
      ) : null}
      {!disabled && (rows.some((r) => value.old[r.key]?.CDF) || value.ends) ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => onChange({ old: {}, ends: "" })}
        >
          Remove the promotion
        </Button>
      ) : null}
    </div>
  );
}

/** A car's shorter rates and a route's other fares: the prices besides the main one. */
const OTHER_PRICES = [
  ["hourly", "1-hour rate"],
  ["sixHour", "6-hour rate"],
  ["twelveHour", "12-hour rate"],
  ["child", "child fare"],
  ["infant", "baby fare"]
];

/**
 * A list row's promotion: "Promotion −20 % (was 100 000 FC) until 05/11", or
 * that it has ended. Nothing when there is none. The main price's when it has
 * one; otherwise the biggest on another price ("Promotion on the 6-hour rate
 * −30 % …"), so a car or route promoted only there still shows in the list.
 * It wraps, even in a table cell, so it never widens a price column.
 */
export function PromoNote({
  item,
  locale
}: {
  item: { sellPrice?: { CDF?: number }; promoCompareAtPrice?: { CDF?: number }; promoEndsAt?: string | null };
  locale?: string;
}) {
  const fields = item as Record<string, { CDF?: number } | undefined>;
  const prices = [
    { on: "", old: item.promoCompareAtPrice?.CDF ?? 0, sell: item.sellPrice?.CDF ?? 0 },
    ...OTHER_PRICES.map(([key, name]) => ({
      on: ` on the ${name}`,
      old: fields[`${key}PromoCompareAtPrice`]?.CDF ?? 0,
      sell: fields[`${key}SellPrice`]?.CDF ?? 0
    }))
  ]
    .filter((p) => p.old > 0 && p.sell > 0)
    .map((p) => ({ ...p, off: Math.round(((p.old - p.sell) * 100) / p.old) }));
  const shown = prices.find((p) => p.on === "") ?? prices.sort((a, b) => b.off - a.off)[0];
  if (!shown) return null;
  const ends = item.promoEndsAt?.slice(0, 10) ?? "";
  const day = ends.split("-").reverse().slice(0, 2).join("/");
  if (ends && ends < format(new Date(), "yyyy-MM-dd")) {
    return <p className="text-xs whitespace-normal text-muted-foreground">Promotion ended on {day}</p>;
  }
  return (
    <p className="text-xs whitespace-normal text-red-600 dark:text-red-400">
      Promotion{shown.on} −{shown.off}&nbsp;% (was {formatFrancs(shown.old, locale)})
      {ends ? ` until ${day}` : ""}
    </p>
  );
}
