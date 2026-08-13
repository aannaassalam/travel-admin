import {
  bulkUpdateCalendar,
  CalendarCell,
  getCalendar,
  RoomType
} from "@/api/functions/admin.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MoneyInput, {
  formToMoney,
  CURRENCIES
} from "@/components/Form/MoneyInput";
import { addDays, formatMoney, toISODate } from "@/lib/functions/format.lib";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * §5.2 / §5.3 — the availability calendar grid.
 *
 * "Entering 30 nights one form at a time is unusable; this is the single
 * highest-value screen in the module." Room types are rows, dates are columns,
 * and a click-drag selects a range that gets bulk-set in one write.
 */

const WINDOW_DAYS = 21;

interface Selection {
  roomTypeId: string;
  startIdx: number;
  endIdx: number;
}

export default function CalendarGrid({ hotelId }: { hotelId: string }) {
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sellPrice, setSellPrice] = useState<Record<string, string>>({});
  const [costPrice, setCostPrice] = useState<Record<string, string>>({});
  const [allotment, setAllotment] = useState("");
  const queryClient = useQueryClient();

  const from = useMemo(() => addDays(new Date(), offset * WINDOW_DAYS), [offset]);
  const to = useMemo(() => addDays(from, WINDOW_DAYS - 1), [from]);
  const dates = useMemo(
    () => Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(from, i)),
    [from]
  );

  const { data, isLoading } = useQuery({
    queryKey: ["calendar", hotelId, toISODate(from)],
    queryFn: () => getCalendar(hotelId, toISODate(from), toISODate(to))
  });

  const cellFor = useMemo(() => {
    const map = new Map<string, CalendarCell>();
    data?.cells.forEach((c) => map.set(`${c.roomTypeId}|${c.date}`, c));
    return map;
  }, [data]);

  const { mutate: applyBulk, isPending } = useMutation({
    mutationFn: (confirmPriceChange?: boolean) => {
      if (!selection) throw new Error("Nothing selected");
      const [a, b] = [selection.startIdx, selection.endIdx].sort((x, y) => x - y);
      const sell = formToMoney(sellPrice);
      const cost = formToMoney(costPrice);
      return bulkUpdateCalendar(hotelId, {
        roomTypeId: selection.roomTypeId,
        from: toISODate(dates[a]),
        to: toISODate(dates[b]),
        // Omit entirely when nothing was typed, so a blank form keeps the
        // existing prices rather than zeroing them.
        sellPrice: Object.keys(sell).length ? sell : undefined,
        costPrice: Object.keys(cost).length ? cost : undefined,
        allotment: allotment ? Number(allotment) : undefined,
        confirmPriceChange
      });
    },
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar", hotelId] });
      setSelection(null);
      setSellPrice({});
      setCostPrice({});
      setAllotment("");
      toast.success("Calendar updated");
    },
    onError: (err) => {
      const e = err as AxiosError<{ message?: string }>;
      /**
       * §5.1 price-change guard: the server refuses a >threshold move with 409.
       * A mis-keyed price that gets purchased is painful to unwind with no
       * refunds, so this asks rather than silently applying.
       */
      if (e.response?.status === 409) {
        const ok = window.confirm(
          `${e.response.data?.message}\n\nApply this price change anyway?`
        );
        if (ok) applyBulk(true);
        return;
      }
      toast.error(e.response?.data?.message ?? "Could not update the calendar");
    }
  });

  const inSelection = (roomTypeId: string, idx: number) => {
    if (!selection || selection.roomTypeId !== roomTypeId) return false;
    const [a, b] = [selection.startIdx, selection.endIdx].sort((x, y) => x - y);
    return idx >= a && idx <= b;
  };

  const selectedCount = selection
    ? Math.abs(selection.endIdx - selection.startIdx) + 1
    : 0;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums">
          {from.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} —{" "}
          {to.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
        <Button variant="outline" size="icon" onClick={() => setOffset((o) => o + 1)}>
          <ChevronRight className="size-4" />
        </Button>
        <p className="ml-3 text-xs text-muted-foreground">
          Click and drag across nights to select a range.
        </p>
      </div>

      {/* Wide content scrolls inside its own container, never the page body. */}
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full border-collapse text-sm" onMouseLeave={() => setDragging(false)}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[180px] border-b border-r bg-background p-2 text-left text-xs font-medium">
                Room type
              </th>
              {dates.map((d) => {
                const weekend = [0, 6].includes(d.getDay());
                return (
                  <th
                    key={d.toISOString()}
                    className={cn(
                      "border-b border-r p-1 text-center text-[11px] font-medium",
                      weekend && "bg-muted/50"
                    )}
                  >
                    <div className="text-muted-foreground">
                      {d.toLocaleDateString("en-GB", { weekday: "narrow" })}
                    </div>
                    <div className="tabular-nums">{d.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data?.roomTypes.map((room: RoomType) => (
              <tr key={room.id}>
                <td className="sticky left-0 z-10 border-b border-r bg-background p-2">
                  <div className="font-medium">{room.displayName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {room.maxAdults} adults · {room.beds}
                  </div>
                </td>
                {dates.map((d, idx) => {
                  const cell = cellFor.get(`${room.id}|${toISODate(d)}`);
                  const available = cell?.available ?? 0;
                  const selected = inSelection(room.id, idx);
                  return (
                    <td
                      key={d.toISOString()}
                      onMouseDown={() => {
                        setDragging(true);
                        setSelection({ roomTypeId: room.id, startIdx: idx, endIdx: idx });
                      }}
                      onMouseEnter={() => {
                        if (dragging && selection?.roomTypeId === room.id) {
                          setSelection({ ...selection, endIdx: idx });
                        }
                      }}
                      onMouseUp={() => setDragging(false)}
                      className={cn(
                        "cursor-pointer border-b border-r p-1 text-center align-top select-none",
                        // §13: never colour alone — the number carries the meaning.
                        !cell && "bg-muted/30",
                        cell && available === 0 && "bg-red-50 dark:bg-red-950/30",
                        cell && available > 0 && available < 3 && "bg-amber-50 dark:bg-amber-950/30",
                        selected && "ring-2 ring-inset ring-foreground"
                      )}
                      title={
                        cell
                          ? [
                              ...CURRENCIES.filter(
                                (c) => typeof cell.sellPrice?.[c] === "number"
                              ).map((c) => `${c} ${(cell.sellPrice[c]! / 100).toFixed(2)}`),
                              `Cost ${formatMoney(cell.costPriceBase)}`,
                              `Margin ${formatMoney(cell.margin)}`
                            ].join(" · ")
                          : "No rate set"
                      }
                    >
                      {cell ? (
                        <>
                          <div className="text-[11px] font-medium tabular-nums">
                            {(cell.sellPriceBase / 100).toFixed(0)}
                          </div>
                          <div
                            className={cn(
                              "text-[10px] tabular-nums",
                              available === 0
                                ? "text-red-600 dark:text-red-400"
                                : "text-muted-foreground"
                            )}
                          >
                            {available}/{cell.allotment}
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-muted-foreground/40">—</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selection ? (
        <div className="rounded-lg border bg-background p-4">
          <p className="mb-3 text-sm font-medium">
            {selectedCount} night{selectedCount > 1 ? "s" : ""} selected ·{" "}
            {data?.roomTypes.find((r) => r.id === selection.roomTypeId)?.displayName}
          </p>
          <div className="flex flex-col gap-4">
            <MoneyInput
              label="Sell price"
              value={sellPrice}
              onChange={setSellPrice}
            />
            {/* §5.1 / §15: cost price drives margin reporting. */}
            <MoneyInput
              label="Cost price — never shown to customers"
              value={costPrice}
              onChange={setCostPrice}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-28">
              <Label className="text-xs">Allotment</Label>
              <Input
                type="number"
                value={allotment}
                onChange={(e) => setAllotment(e.target.value)}
                placeholder="5"
              />
            </div>
            <Button onClick={() => applyBulk(undefined)} disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Apply to {selectedCount} night{selectedCount > 1 ? "s" : ""}
            </Button>
            <Button variant="ghost" onClick={() => setSelection(null)}>
              Cancel
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Leave a field blank to keep its current value.
          </p>
        </div>
      ) : null}
    </div>
  );
}
