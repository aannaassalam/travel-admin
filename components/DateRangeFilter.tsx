import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { format, parse, startOfMonth, subDays, subMonths } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import { useRef, useState } from "react";

/**
 * A period on a list's toolbar: one button that says what is chosen and opens
 * a calendar to change it.
 *
 * It stands where a pair of the browser's own date boxes stood. Their pop-up
 * is drawn by the browser — different on every one of them, and like nothing
 * else in the panel. The value is still what those boxes gave, two YYYY-MM-DD
 * days with either or both blank, so the page and the API read it as before.
 */

const DAY = "yyyy-MM-dd";
// As a day on this computer's calendar. `new Date("2026-10-05")` is midnight
// UTC — the evening of the 4th anywhere west of Greenwich.
const toDate = (day: string) => (day ? parse(day, DAY, new Date()) : undefined);
const toDay = (date?: Date) => (date ? format(date, DAY) : "");

/** "5 Oct 2026", "5 – 12 Oct 2026", "28 Sep – 5 Oct 2026", "20 Dec 2025 – 3 Jan 2026". */
const describe = (from: string, to: string) => {
  const [a, b] = [toDate(from), toDate(to)];
  if (!a && !b) return "any date";
  if (!b) return `from ${format(a!, "d MMM yyyy")}`;
  if (!a) return `until ${format(b, "d MMM yyyy")}`;
  if (from === to) return format(a, "d MMM yyyy");
  const start =
    a.getFullYear() !== b.getFullYear()
      ? "d MMM yyyy"
      : a.getMonth() !== b.getMonth()
        ? "d MMM"
        : "d";
  return `${format(a, start)} – ${format(b, "d MMM yyyy")}`;
};

/** The periods people ask for by name. Worked out when pressed, so "today" is today. */
const SHORTCUTS: [string, (today: Date) => Date][] = [
  ["Today", (today) => today],
  ["Last 7 days", (today) => subDays(today, 6)],
  ["Last 30 days", (today) => subDays(today, 29)],
  ["This month", (today) => startOfMonth(today)]
];

export default function DateRangeFilter({
  label,
  from,
  to,
  onChange,
  latest,
  required
}: {
  /** What the dates are of: "Received". */
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /**
   * The last day that can be chosen, as YYYY-MM-DD, when that is not today on
   * this computer — a screen that counts days in UTC passes UTC's today.
   */
  latest?: string;
  /** A period is always chosen: there is no "any date" and nothing to clear. */
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The first day pressed since the calendar opened; the next press is the
  // other end. Kept in here until the period is whole: sent up at once, it
  // changed the button's wording and reloaded the list under the open
  // calendar — which moved, and the second press landed on another day.
  const [start, setStart] = useState<Date | null>(null);
  // Escape is "never mind": it takes a first press back instead of using it.
  const dropped = useRef(false);
  const close = () => {
    setOpen(false);
    setStart(null);
  };
  const isMobile = useIsMobile();
  const today = toDate(latest ?? "") ?? new Date();
  const chosen = Boolean(from || to);

  return (
    <div className="flex items-center gap-1">
      <Popover
        open={open}
        onOpenChange={(next) => {
          // Closed with one day pressed (a click elsewhere, the button
          // again): that day alone is the period.
          if (!next && start && !dropped.current) {
            onChange(toDay(start), toDay(start));
          }
          dropped.current = false;
          setOpen(next);
          setStart(null);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "gap-2 font-normal",
              !chosen && "text-muted-foreground"
            )}
          >
            <CalendarDays className="size-4 shrink-0" />
            <span>
              {label}:{" "}
              <span className={cn(chosen && "font-medium text-foreground")}>
                {describe(from, to)}
              </span>
            </span>
          </Button>
        </PopoverTrigger>
        {/* As wide as the months need, but never wider than the screen: on a
            phone the shortcuts wrap onto a second line instead of running off it. */}
        <PopoverContent
          align="start"
          collisionPadding={12}
          // No taller than the room there is, scrolling inside if it must: on
          // a short screen (a phone on its side, a small phone with the
          // browser's bars showing) the last weeks or the shortcuts were
          // otherwise past the edge with no way to reach them.
          className="max-h-(--radix-popover-content-available-height) w-auto max-w-[calc(100vw-1.5rem)] overflow-y-auto p-0"
          onEscapeKeyDown={() => {
            dropped.current = true;
          }}
        >
          <div className="flex flex-col sm:flex-row">
            <div className="flex flex-wrap gap-1 border-b p-2 sm:w-36 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r">
              {SHORTCUTS.map(([name, start]) => {
                const days = [toDay(start(today)), toDay(today)] as const;
                return (
                  <Button
                    key={name}
                    variant={
                      from === days[0] && to === days[1] ? "secondary" : "ghost"
                    }
                    size="sm"
                    className="justify-start font-normal"
                    onClick={() => {
                      onChange(...days);
                      close();
                    }}
                  >
                    {name}
                  </Button>
                );
              })}
              {required ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start font-normal text-muted-foreground sm:mt-auto"
                  disabled={!chosen}
                  onClick={() => {
                    onChange("", "");
                    close();
                  }}
                >
                  Any date
                </Button>
              )}
            </div>
            <div className="mx-auto">
              <Calendar
                mode="range"
                autoFocus
                weekStartsOn={1}
                numberOfMonths={isMobile ? 1 : 2}
                // The month chosen, or this month last so that the weeks just
                // gone — what is nearly always wanted — are both on show.
                defaultMonth={
                  toDate(from) ?? (isMobile ? today : subMonths(today, 1))
                }
                endMonth={today}
                // Nothing has been received tomorrow.
                disabled={{ after: today }}
                selected={
                  start
                    ? { from: start, to: start }
                    : chosen
                      ? { from: toDate(from || to), to: toDate(to || from) }
                      : undefined
                }
                onSelect={(_range, day) => {
                  // A press on a calendar that is already fading out (the
                  // second click of a double-click on the last day) is not a
                  // choice.
                  if (!open) return;
                  // Two presses make a period, whatever was chosen before:
                  // the first is one end, the second the other, and the same
                  // day twice is that one day. Left to the calendar, a press
                  // after a chosen period stretched it ("the 20th to the
                  // 25th" could not be picked after "the 5th to the 12th"),
                  // and a second press on the same day threw the choice away.
                  if (!start) return setStart(day);
                  const [first, last] =
                    start <= day ? [start, day] : [day, start];
                  onChange(toDay(first), toDay(last));
                  // Both ends chosen: there is nothing left to do in here.
                  close();
                }}
              />
              {/* Always one line, so nothing moves when its wording does. */}
              <p
                className="px-3 pb-2 text-[11px] text-muted-foreground"
                aria-live="polite"
              >
                {start
                  ? "Now press the other end — or the same day again for that day alone."
                  : "Press one end of the period, then the other."}
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {chosen && !required ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label={`Clear ${label.toLowerCase()} dates`}
          title="Clear dates"
          onClick={() => onChange("", "")}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
