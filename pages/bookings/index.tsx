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
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  formatDate,
  formatOrderTotal,
  relativeTime
} from "@/lib/functions/format.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import {
  BOOKING_TYPE,
  label,
  ORDER_STAGE,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  STAGE_STYLES
} from "@/lib/functions/labels.lib";
import { useDebounce } from "@/hooks/utils/useDebounce";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

/** §6.1: queues, not one list, in the order of the workflow. "Cash pending" is the default landing. */
const QUEUES: { key: string; label: TranslationKey }[] = [
  { key: "cash-pending", label: "book.queue.cashPending" },
  { key: "pending-document", label: "book.queue.pendingDocument" },
  { key: "pending-completion", label: "book.queue.pendingCompletion" },
  { key: "departing-soon", label: "book.queue.departingSoon" },
  { key: "completed", label: "ops.bookings.queueCompleted" },
  { key: "cancellations", label: "book.queue.cancellations" },
  { key: "all", label: "book.queue.all" }
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
  const { t, locale } = useT();
  const queue = (router.query.queue as string) || "cash-pending";
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
      title={t("book.title")}
      description={t("ops.bookings.description")}
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
              {t(label)}
              {/* Always a number, zero included: a tab with none beside it
                  reads as "not counted", not as "nothing there". */}
              {counts ? (
                <span className="ms-1.5 tabular-nums opacity-70">
                  {counts[key] ?? 0}
                </span>
              ) : null}
            </Link>
          ))}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("ops.bookings.searchPlaceholder")}
            className="ps-9"
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
                  {t("book.reference")}
                </SortHead>
                <SortHead column="customer" {...head}>
                  {t("book.customer")}
                </SortHead>
                <TableHead>{t("book.type")}</TableHead>
                {/* The workflow stage says the documents' state too. */}
                <TableHead>{t("common.status")}</TableHead>
                <SortHead column="payment" {...head}>
                  {t("book.payment")}
                </SortHead>
                <SortHead column="total" align="right" className="text-end" {...head}>
                  {t("common.total")}
                </SortHead>
                <SortHead
                  column={queue === "cash-pending" ? "deadline" : "travel"}
                  {...head}
                >
                  {queue === "cash-pending" ? t("book.cashDeadline") : t("book.travel")}
                </SortHead>
              </TableRow>
            </TableHeader>
            <TableBody inert={isPlaceholderData || undefined}>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {t("common.loading")}
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
                    {term ? t("ops.bookings.noMatch") : t("ops.bookings.emptyQueue")}
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
                    <TableCell className="text-sm">
                      {o.verticals?.length
                        ? o.verticals.map((v) => label(BOOKING_TYPE, v)).join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("whitespace-normal", o.stage && STAGE_STYLES[o.stage])}>
                        {o.stage ? label(ORDER_STAGE, o.stage) : label(ORDER_STATUS, o.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={PAYMENT_STYLES[o.paymentStatus]}>
                        {label(PAYMENT_STATUS, o.paymentStatus)}
                      </Badge>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {label(PAYMENT_METHOD, o.paymentMethod)}
                      </div>
                    </TableCell>
                    <TableCell className="text-end font-medium tabular-nums">
                      {formatOrderTotal(o, locale)}
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

        <Pager page={page} total={data?.total ?? 0} onPage={setPage} noun={t("ops.noun.booking")} plural={t("ops.noun.bookings")} />
      </div>
    </AdminLayout>
  );
}
