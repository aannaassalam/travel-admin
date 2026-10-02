import { getQueueCounts, listOrders } from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
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
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["orders", queue, q],
    queryFn: () => listOrders(queue, q)
  });
  const { data: counts } = useQuery({
    queryKey: ["queue-counts"],
    queryFn: getQueueCounts
  });

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
              {counts?.[key] ? (
                <span className="ml-1.5 tabular-nums opacity-70">
                  {counts[key]}
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
            placeholder="Order reference…"
            className="pl-9"
          />
        </div>

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>
                  {queue === "cash-pending" ? "Cash deadline" : "Travel"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                    {queue === "needs-action"
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
      </div>
    </AdminLayout>
  );
}
