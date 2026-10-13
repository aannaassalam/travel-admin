import { getQueueCounts, listOrders } from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { PAGE_SIZE, usePage } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import SortHead, { type Sort } from "@/components/SortHead";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  formatDate,
  formatMoney,
  relativeTime
} from "@/lib/functions/format.lib";
import {
  FULFILMENT_STATUS,
  label,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS
} from "@/lib/functions/labels.lib";
import { useDebounce } from "@/hooks/utils/useDebounce";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

/** §6.1: queues, not one list. "Needs action" is the default landing. */
const QUEUES = [
  { key: "needs-action", label: "Needs action" },
  { key: "cash-pending", label: "Cash pending" },
  { key: "awaiting-confirmation", label: "Awaiting confirmation" },
  { key: "departing-soon", label: "Departing soon" },
  { key: "completed", label: "Completed" },
  { key: "cancellations", label: "Cancellations" },
  { key: "all", label: "All orders" }
];

const PAYMENT_STYLES: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  UNPAID: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  REVERSED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
};

export default function BookingsPage() {
  const router = useRouter();
  const queue = (router.query.queue as string) || "needs-action";
  const [q, setQ] = useState("");
  // Global search's "See all" row lands here with the term already applied.
  useEffect(() => {
    if (typeof router.query.q === "string") setQ(router.query.q);
  }, [router.query.q]);

  const term = useDebounce(q.trim(), 300);
  // The queue's own order (cash deadline first in cash pending, newest first
  // elsewhere) until a column heading is pressed. Kept per queue — the page
  // stays up between them, and their last column is not the same one.
  const [sorts, setSorts] = useState<Record<string, Sort>>({});
  // Own keys only: the queue comes from the address, and `?queue=constructor`
  // must not find Object's.
  const sort = Object.hasOwn(sorts, queue) ? sorts[queue] : "";
  const setSort = (next: Sort) => setSorts((all) => ({ ...all, [queue]: next }));
  const head = { sort, onSort: setSort };
  const [page, setPage] = usePage(`${queue}|${term}|${sort}`);

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: ["orders", queue, term, sort, page],
    // The numbers on the tabs travel with the rows. Asked for on their own
    // they were read once and kept, so "Completed 2" sat above three completed
    // bookings until the page was reloaded.
    queryFn: async () => {
      const [list, counts] = await Promise.all([
        listOrders(queue, term, { page, limit: PAGE_SIZE, sort }),
        getQueueCounts().catch(() => undefined)
      ]);
      return { ...list, counts };
    },
    // A booking is changed on its own page; coming back must show it.
    refetchOnMount: "always",
    // The rows stay up while the next page loads, instead of blinking empty.
    placeholderData: keepPreviousData
  });
  const counts = data?.counts;

  return (
    <AdminLayout
      title="Bookings"
      description="Reference numbers are the fastest way in — search resolves them"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1 border-b pb-2">
          {QUEUES.map(({ key, label }) => (
            <Link
              key={key}
              href={`/bookings?queue=${key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                queue === key
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
              {/* Always a number, zero included: a tab with none beside it
                  reads as "not counted", not as "nothing there". */}
              {counts ? (
                <span className="ml-1.5 tabular-nums opacity-70">
                  {counts[key] ?? 0}
                </span>
              ) : null}
            </Link>
          ))}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Reference, customer name or phone…"
            className="pl-9"
          />
        </div>

        <div
          // The rows of the order, page or search before stay up while the
          // next ones load — dimmed and out of reach, so they are not read as
          // the answer, nor pressed just as they change.
          aria-busy={isPlaceholderData || undefined}
          className={cn(
            "rounded-lg border bg-background",
            isPlaceholderData && "opacity-60"
          )}
        >
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <SortHead column="reference" {...head}>
                  Reference
                </SortHead>
                <SortHead column="customer" {...head}>
                  Customer
                </SortHead>
                <SortHead column="status" {...head}>
                  Status
                </SortHead>
                <SortHead column="payment" {...head}>
                  Payment
                </SortHead>
                <SortHead column="documents" {...head}>
                  Documents
                </SortHead>
                <SortHead column="total" align="right" className="text-right" {...head}>
                  Total
                </SortHead>
                <SortHead
                  column={queue === "cash-pending" ? "deadline" : "travel"}
                  {...head}
                >
                  {queue === "cash-pending" ? "Cash deadline" : "Travel"}
                </SortHead>
              </TableRow>
            </TableHeader>
            <TableBody inert={isPlaceholderData || undefined}>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <QueryError onRetry={() => refetch()} />
                  </TableCell>
                </TableRow>
              ) : !data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {term
                      ? "No bookings match that search."
                      : queue === "needs-action"
                        ? "Nothing needs attention right now."
                        : "No orders in this queue."}
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link
                        href={`/bookings/${o.id}`}
                        className="font-mono text-sm font-medium hover:underline"
                      >
                        {o.reference}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>{o.customer?.fullName ?? "—"}</div>
                      {/* §8: masked in list views. */}
                      <div className="text-xs text-muted-foreground">
                        {o.customer?.phoneMasked}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{label(ORDER_STATUS, o.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={PAYMENT_STYLES[o.paymentStatus]}>
                        {label(PAYMENT_STATUS, o.paymentStatus)}
                      </Badge>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {label(PAYMENT_METHOD, o.paymentMethod)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {label(FULFILMENT_STATUS, o.fulfilmentStatus)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(o.total, o.currency)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {queue === "cash-pending" ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {relativeTime(o.cashDeadline)}
                        </span>
                      ) : (
                        formatDate(o.travelDate)
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Pager page={page} total={data?.total ?? 0} onPage={setPage} noun="booking" />
      </div>
    </AdminLayout>
  );
}
