import DateField from "@/components/DateField";
import MoneyInput, { formToMoney } from "@/components/Form/MoneyInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatFrancs } from "@/lib/functions/format.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type T = ReturnType<typeof useT>["t"];

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
export const onePrice = (sell: number, t: T): PromoRow[] => [
  { key: "promoCompareAtPrice", label: t("inv.promo.oldPrice"), sell }
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
  const { t, locale } = useT();
  const today = format(new Date(), "yyyy-MM-dd");
  const oldOf = (row: PromoRow) => Number(value.old[row.key]?.CDF) || 0;
  const single = rows.length === 1;
  // Said once: past its last day, none of the prices shows one.
  const ended =
    Boolean(value.ends && value.ends < today) && rows.some((r) => oldOf(r) > 0 && r.sell > 0);
  return (
    <div className={cn("mt-5 border-t pt-4", className)}>
      <h3 className={cn("text-sm font-medium", single ? "mb-3" : "mb-1")}>{t("inv.promo.title")}</h3>
      {single ? null : (
        <p className="mb-3 text-xs text-muted-foreground">
          {t("inv.promo.manyIntro")}
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
                    ? t("inv.promo.oneHint")
                    : t("inv.promo.manyHint")
                }
                onChange={(o) => onChange({ old: { ...value.old, [row.key]: o } })}
              />
              {old > 0 && row.sell > 0 && !ended ? (
                percent >= 1 ? (
                  <p className="mt-2 text-sm">
                    {t("inv.promo.customersSee")}{" "}
                    <s className="text-muted-foreground">{formatFrancs(old, locale)}</s>{" "}
                    <span className="font-medium">{formatFrancs(row.sell, locale)}</span>{" "}
                    <Badge variant="secondary">−{percent}&nbsp;%</Badge>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    {t("inv.promo.tooLow")}
                  </p>
                )
              ) : null}
            </div>
          );
        })}
        <div>
          <Label className="text-xs">{t("inv.promo.endsOn")}</Label>
          <div className="mt-1 max-w-56">
            <DateField
              disabled={disabled}
              aria-label={t("inv.promo.endsOn")}
              min={today}
              value={value.ends}
              onChange={(ends) => onChange({ ends })}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("inv.promo.endsHint")}
          </p>
        </div>
      </div>
      {ended ? (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
          {t("inv.promo.ended", { day: value.ends.split("-").reverse().join("/") })}
        </p>
      ) : null}
      {!disabled && (rows.some((r) => value.old[r.key]?.CDF) || value.ends) ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => onChange({ old: {}, ends: "" })}
        >
          {t("inv.promo.remove")}
        </Button>
      ) : null}
    </div>
  );
}

/** A car's shorter rates and a route's other fares: the prices besides the main one. */
const OTHER_PRICES: [string, TranslationKey][] = [
  ["hourly", "inv.promo.onHourly"],
  ["sixHour", "inv.promo.onSixHour"],
  ["twelveHour", "inv.promo.onTwelveHour"],
  ["child", "inv.promo.onChild"],
  ["infant", "inv.promo.onInfant"]
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
  const { t } = useT();
  const fields = item as Record<string, { CDF?: number } | undefined>;
  const prices = [
    { on: "", old: item.promoCompareAtPrice?.CDF ?? 0, sell: item.sellPrice?.CDF ?? 0 },
    ...OTHER_PRICES.map(([key, name]) => ({
      on: t(name),
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
    return (
      <p className="text-xs whitespace-normal text-muted-foreground">
        {t("inv.promo.noteEnded", { day })}
      </p>
    );
  }
  const was = formatFrancs(shown.old, locale);
  return (
    <p className="text-xs whitespace-normal text-red-600 dark:text-red-400">
      {shown.on
        ? ends
          ? t("inv.promo.noteOnUntil", { on: shown.on, off: shown.off, was, day })
          : t("inv.promo.noteOn", { on: shown.on, off: shown.off, was })
        : ends
          ? t("inv.promo.noteUntil", { off: shown.off, was, day })
          : t("inv.promo.note", { off: shown.off, was })}
    </p>
  );
}
