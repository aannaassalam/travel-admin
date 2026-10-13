import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
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
const toDate = (day?: string) =>
  day ? parse(day.slice(0, 10), DAY, new Date()) : undefined;
const two = (n: number) => String(n).padStart(2, "0");

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

export default function DateField({
  value,
  onChange,
  min,
  max,
  disabled,
  clearable = true,
  placeholder = "Pick a date",
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
          aria-label={ariaLabel}
          className={cn(
            "w-full justify-start gap-2 px-3 font-normal",
            !chosen && "text-muted-foreground",
            className
          )}
        >
          <CalendarDays className="size-4 shrink-0" />
          {chosen ? format(chosen, "d MMM yyyy") : placeholder}
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
              Clear
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
      <div className="flex items-center gap-1.5">
        <DateField
          value={parts.day}
          onChange={(day) =>
            set(day ? { day } : { day: "", hour: "", minute: "" })
          }
          disabled={disabled}
          aria-label={ariaLabel ? `${ariaLabel}: day` : "Day"}
          className="min-w-0 flex-1"
        />
        <select
          aria-label={ariaLabel ? `${ariaLabel}: hour` : "Hour"}
          disabled={disabled}
          value={parts.hour}
          onChange={(e) => set({ hour: e.target.value })}
          className={cn(selectClass, !parts.hour && "text-muted-foreground")}
        >
          <option value="">hh</option>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={two(h)}>
              {two(h)}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">:</span>
        <select
          aria-label={ariaLabel ? `${ariaLabel}: minute` : "Minute"}
          disabled={disabled}
          value={parts.minute}
          onChange={(e) => set({ minute: e.target.value })}
          className={cn(selectClass, !parts.minute && "text-muted-foreground")}
        >
          <option value="">mm</option>
          {Array.from({ length: 60 }, (_, m) => (
            <option key={m} value={two(m)}>
              {two(m)}
            </option>
          ))}
        </select>
      </div>
      {partly ? (
        <p className="mt-1 text-[11px] text-destructive" role="alert">
          Choose the day, the hour and the minutes — until then nothing is set.
        </p>
      ) : null}
    </div>
  );
}
