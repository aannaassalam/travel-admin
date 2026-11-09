import { getVisaQueueCounts, listVisaApplications } from "@/api/functions/visa.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { PAGE_SIZE, usePage } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import SortHead, { type Sort } from "@/components/SortHead";
import {
  day,
  RushBadge,
  travellerName,
  VISA_QUEUES,
  VisaPaymentBadge,
  VisaStatusBadge
} from "@/components/visa/shared";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/utils/useDebounce";
import { formatDate } from "@/lib/functions/format.lib";
import { lz } from "@/lib/functions/localized.lib";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { formatPhoneNumberIntl } from "react-phone-number-input";

/** Visa applications, one queue at a time — the bookings list's pattern. */
export default function VisaApplicationsPage() {
  const router = useRouter();
  const { t } = useT();
  const queue = (router.query.queue as string) || "new";
  const [q, setQ] = useState("");
  useEffect(() => {
    if (typeof router.query.q === "string") setQ(router.query.q);
  }, [router.query.q]);

  const term = useDebounce(q.trim(), 300);
  // Per queue, as on the bookings list.
  const [sorts, setSorts] = useState<Record<string, Sort>>({});
  const sort = Object.hasOwn(sorts, queue) ? sorts[queue] : "";
  const head = { sort, onSort: (next: Sort) => setSorts((all) => ({ ...all, [queue]: next })) };
  const [page, setPage] = usePage(`${queue}|${term}|${sort}`);

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: ["visa-applications", queue, term, sort, page],
    // The counts travel with the rows, so a tab never shows a stale number.
    queryFn: async () => {
      const [list, counts] = await Promise.all([
        listVisaApplications(queue, term, { page, limit: PAGE_SIZE, sort }),
        getVisaQueueCounts().catch(() => undefined)
      ]);
      return { ...list, counts };
    },
    refetchOnMount: "always",
    placeholderData: keepPreviousData
  });
  const counts = data?.counts;
  const columns = 8;

  return (
    <AdminLayout title={t("visa.list.title")} description={t("visa.list.description")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1 border-b pb-2">
          {VISA_QUEUES.map(({ key, label }) => (
            <Link
              key={key}
              href={`/e-visa/applications?queue=${key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                queue === key
                  ? "bg-foreground font-medium text-background"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t(label)}
              {counts ? (
                <span className="ms-1.5 tabular-nums opacity-70">{counts[key] ?? 0}</span>
              ) : null}
            </Link>
          ))}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("visa.list.search")}
            className="ps-9"
          />
        </div>

        <div
          aria-busy={isPlaceholderData || undefined}
          className={cn(
            "overflow-x-auto rounded-lg border bg-background",
            isPlaceholderData && "opacity-60"
          )}
        >
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <SortHead column="reference" {...head}>
                  {t("book.reference")}
                </SortHead>
                <SortHead column="traveller" {...head}>
                  {t("visa.traveller")}
                </SortHead>
                <SortHead column="country" {...head}>
                  {t("visa.country")}
                </SortHead>
                <TableHead>{t("visa.visaType")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <SortHead column="payment" {...head}>
                  {t("book.payment")}
                </SortHead>
                <SortHead column="departure" {...head}>
                  {t("visa.departure")}
                </SortHead>
                <SortHead column="created" {...head}>
                  {t("common.created")}
                </SortHead>
              </TableRow>
            </TableHeader>
            <TableBody inert={isPlaceholderData || undefined}>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={columns} className="p-0">
                    <QueryError onRetry={() => refetch()} />
                  </TableCell>
                </TableRow>
              ) : !data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={columns} className="py-10 text-center text-sm text-muted-foreground">
                    {term
                      ? t("ops.bookings.noMatch")
                      : queue === "new"
                        ? t("visa.list.nothingNew")
                        : t("ops.bookings.emptyQueue")}
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((a) => {
                  const phone = a.customer?.phone ?? a.contact?.phone;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link
                          href={`/e-visa/applications/${a.id}`}
                          className="font-mono text-sm font-medium hover:underline"
                        >
                          {a.reference}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div>{travellerName(a)}</div>
                        {phone ? (
                          <div className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                            {formatPhoneNumberIntl(phone) || phone}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {lz(a.country?.name) || a.country?.code || "—"}
                        {a.townName ? (
                          <div className="text-xs text-muted-foreground">{lz(a.townName)}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {lz(a.visaTypeName) || "—"}
                        {a.minor ? (
                          <div className="text-xs text-muted-foreground">{t("visa.minor")}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <VisaStatusBadge status={a.status} />
                      </TableCell>
                      <TableCell>
                        <VisaPaymentBadge paid={a.paymentStatus === "PAID"} />
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {day(a.departureDate)}
                          {a.rush ? <RushBadge /> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(a.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pager
          page={page}
          total={data?.total ?? 0}
          onPage={setPage}
          noun={t("visa.noun.one")}
          plural={t("visa.noun.other")}
        />
      </div>
    </AdminLayout>
  );
}
