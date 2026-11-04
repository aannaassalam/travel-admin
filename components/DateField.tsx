import { OptionSelect } from "@/components/Form/OptionSelect";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { format, isValid, parse, type Locale as DateLocale } from "date-fns";
import { ar, enUS, es, fr, pt, ru, zhCN } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * One day, and one day with a time, chosen from the panel's own calendar.
 *
 * They stand where the browser's date boxes stood — drawn by the browser,
 * different on every one of them and like nothing else here. The values are
 * what those boxes gave (YYYY-MM-DD, and YYYY-MM-DDTHH:mm), with "" for
 * nothing chosen, so the forms and the API read them as before.
 */

const DAY = "yyyy-MM-dd";
// As a day on this computer's calendar: `new Date("2026-10-05")` is midnight
// UTC — the evening of the 4th anywhere west of Greenwich.
// A value that is no real day (the 31st of February, from an address typed by
// hand or an old record) is no day chosen — not something to format and fail on.
const toDate = (day?: string) => {
  const date = day ? parse(day.slice(0, 10), DAY, new Date()) : undefined;
  return date && isValid(date) ? date : undefined;
};
const two = (n: number) => String(n).padStart(2, "0");

/** The calendar's month and day names in the panel's language. */
const DATE_LOCALES: Record<string, DateLocale> = { fr, en: enUS, pt, es, zh: zhCN, ar, ru };
export const dateFnsLocale = (locale: string) => DATE_LOCALES[locale] ?? enUS;

/** For Intl: European Portuguese, Simplified Chinese, Arabic with Latin digits. */
const INTL_LOCALES: Record<string, string> = { pt: "pt-PT", zh: "zh-CN", ar: "ar-u-nu-latn" };
export const intlLocale = (locale: string) => INTL_LOCALES[locale] ?? locale;

/**
 * A day as words: "5 Oct 2026" (or "5 October 2026" with `long`) in English,
 * as before; in another language the way it writes a date ("5 oct. 2026").
 */
export const formatDay = (date: Date, locale: string, long = false) =>
  locale === "en"
    ? format(date, long ? "d MMMM yyyy" : "d MMM yyyy")
    : new Intl.DateTimeFormat(intlLocale(locale), {
        day: "numeric",
        month: long ? "long" : "short",
        year: "numeric"
      }).format(date);

export default function DateField({
  value,
  onChange,
  min,
  max,
  disabled,
  clearable = true,
  placeholder,
  className,
  "aria-label": ariaLabel
}: {
  /** YYYY-MM-DD, or "" when no day is chosen. */
  value: string;
  onChange: (next: string) => void;
  /** The first and the last day that can be chosen, as YYYY-MM-DD. */
  min?: string;
  max?: string;
  disabled?: boolean;
  /** Whether "no day" is an answer; a Clear button then says how. */
  clearable?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const chosen = toDate(value);
  const year = new Date().getFullYear();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          // The label AND what is chosen: a name given this way replaces the
          // button's own words, and the date would never be read out.
          aria-label={
            ariaLabel
              ? t("inv.date.labelled", {
                  label: ariaLabel,
                  value: chosen ? formatDay(chosen, locale, true) : t("inv.date.notSet")
                })
              : undefined
          }
          className={cn(
            "w-full justify-start gap-2 px-3 font-normal",
            !chosen && "text-muted-foreground",
            className
          )}
        >
          <CalendarDays className="size-4 shrink-0" />
          {chosen ? formatDay(chosen, locale) : (placeholder ?? t("inv.date.pick"))}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="max-h-(--radix-popover-content-available-height) w-auto overflow-y-auto p-0"
      >
        <Calendar
          mode="single"
          autoFocus
          locale={dateFnsLocale(locale)}
          weekStartsOn={1}
          // Month and year as lists: a departure next spring is two choices
          // away, not eight presses of an arrow.
          captionLayout="dropdown"
          startMonth={toDate(min) ?? new Date(year - 5, 0)}
          endMonth={toDate(max) ?? new Date(year + 5, 11)}
          defaultMonth={chosen ?? toDate(min)}
          disabled={[
            ...(min ? [{ before: toDate(min)! }] : []),
            ...(max ? [{ after: toDate(max)! }] : [])
          ]}
          selected={chosen}
          // The day pressed, also when it is the one already chosen: left to
          // the calendar a second press on it would un-choose it.
          onDayClick={(day, modifiers) => {
            if (modifiers.disabled) return;
            onChange(format(day, DAY));
            setOpen(false);
          }}
        />
        {clearable && value ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full font-normal text-muted-foreground"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {t("inv.date.clear")}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * A day and a time of day. Nothing is passed up until all of it is chosen —
 * as the browser's box did — so a day picked with the time forgotten is not
 * stored as midnight; it says the time is missing instead.
 */
export function DateTimeField({
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel
}: {
  /** YYYY-MM-DDTHH:mm, or "" when not (wholly) chosen. */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const { t } = useT();
  const read = (v: string) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)
      ? { day: v.slice(0, 10), hour: v.slice(11, 13), minute: v.slice(14, 16) }
      : { day: "", hour: "", minute: "" };
  // What is on screen, which may be half an answer; `value` only ever holds a
  // whole one.
  const [parts, setParts] = useState(() => read(value));
  // A record that loads, or a value set from outside, replaces what is shown —
  // but not the "" this control itself reported for a half-chosen answer.
  useEffect(() => {
    setParts((p) => {
      const whole = p.day && p.hour && p.minute;
      const mine = whole ? `${p.day}T${p.hour}:${p.minute}` : "";
      return value === mine ? p : read(value);
    });
  }, [value]);

  const set = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch };
    setParts(next);
    onChange(
      next.day && next.hour && next.minute
        ? `${next.day}T${next.hour}:${next.minute}`
        : ""
    );
  };
  const partly =
    Boolean(parts.day || parts.hour || parts.minute) &&
    !(parts.day && parts.hour && parts.minute);

  return (
    <div>
      {/* In a narrow column (a tablet, a small window) the time drops under
          the day as one piece, instead of the day being squeezed until its
          words run over the hour. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <DateField
          value={parts.day}
          onChange={(day) =>
            set(day ? { day } : { day: "", hour: "", minute: "" })
          }
          disabled={disabled}
          aria-label={
            ariaLabel
              ? t("inv.date.labelled", { label: ariaLabel, value: t("inv.date.dayPart") })
              : t("inv.date.day")
          }
          className="w-auto flex-1"
        />
        <div className="flex items-center gap-1.5">
          <OptionSelect
            aria-label={
              ariaLabel
                ? t("inv.date.labelled", { label: ariaLabel, value: t("inv.date.hourPart") })
                : t("inv.date.hour")
            }
            disabled={disabled}
            value={parts.hour}
            onChange={(hour) => set({ hour })}
            className={cn("w-auto", !parts.hour && "text-muted-foreground")}
            options={[
              { value: "", label: t("inv.date.hh") },
              ...Array.from({ length: 24 }, (_, h) => ({ value: two(h), label: two(h) }))
            ]}
          />
          <span className="text-sm text-muted-foreground">:</span>
          <OptionSelect
            aria-label={
              ariaLabel
                ? t("inv.date.labelled", { label: ariaLabel, value: t("inv.date.minutePart") })
                : t("inv.date.minute")
            }
            disabled={disabled}
            value={parts.minute}
            onChange={(minute) => set({ minute })}
            className={cn("w-auto", !parts.minute && "text-muted-foreground")}
            options={[
              { value: "", label: t("inv.date.mm") },
              ...Array.from({ length: 60 }, (_, m) => ({ value: two(m), label: two(m) }))
            ]}
          />
        </div>
      </div>
      {partly ? (
        <p className="mt-1 text-[11px] text-destructive" role="alert">
          {t("inv.date.partly")}
        </p>
      ) : null}
    </div>
  );
}
