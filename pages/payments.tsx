import { listPayments } from "@/api/functions/admin.api";
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
import { formatDate, formatMoney } from "@/lib/functions/format.lib";
import {
  label,
  PAYMENT_METHOD,
  PAYMENT_STATUS
} from "@/lib/functions/labels.lib";
import { canOpenRoute, useCan } from "@/lib/permissions";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * Payments ledger (§9.1): every payment attempt and success.
 *
 * Payment exceptions and FX rates used to live here as sibling tabs. Both are
 * gone — prices are typed per currency so nothing converts, and the client does
 * not want an exceptions register. That leaves one table, so the tabs went too.
 */
const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  REVERSED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  UNPAID: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
};

export default function PaymentsPage() {
  const [q, setQ] = useState("");
  const { admin } = useCan();
  const canOpenOrder = canOpenRoute(admin?.permissions, "/bookings/[id]");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payments"],
    queryFn: listPayments
  });

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    if (!q.trim()) return items;
    const needle = q.toLowerCase();
    return items.filter(
      (p) =>
        p.reference.toLowerCase().includes(needle) ||
        p.customerName.toLowerCase().includes(needle)
    );
  }, [data, q]);

  const collected = rows
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <AdminLayout
      title="Payments"
      description="Every payment attempt and success, in USD base"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Order reference or customer…"
              className="pl-9"
            />
          </div>
          <p className="ml-auto text-sm text-muted-foreground">
            Collected:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatMoney(collected)}
            </span>
          </p>
        </div>

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <QueryError onRetry={() => refetch()} />
                  </TableCell>
                </TableRow>
              ) : !rows.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {q ? "No payments match that search." : "No payments recorded yet."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {/* A link only when the booking would open for this role. */}
                      {canOpenOrder ? (
                        <Link
                          href={`/bookings/${p.id}`}
                          className="font-mono text-sm hover:underline"
                        >
                          {p.reference}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm">{p.reference}</span>
                      )}
                    </TableCell>
                    <TableCell>{p.customerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {label(PAYMENT_METHOD, p.method)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_STYLES[p.status]}>
                        {label(PAYMENT_STATUS, p.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(p.amount, p.currency)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.paidAt ? formatDate(p.paidAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Derived from orders. Gateway settlement reconciliation and cash
          reconciliation per location are not built yet.
        </p>
      </div>
    </AdminLayout>
  );
}
