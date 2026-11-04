import {
  listDrivers,
  listRides,
  type RideRow,
  type RideStatus
} from "@/api/functions/transfers.api";
import DateRangeFilter from "@/components/DateRangeFilter";
import { OptionSelect } from "@/components/Form/OptionSelect";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { PAGE_SIZE, usePage } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import SetupChecklist from "@/components/Transfers/SetupChecklist";
import {
  CitySelect,
  isOne,
  RIDE_STATUS,
  rideDay,
  RideStatusBadge,
  routeText
} from "@/components/Transfers/transfers.lib";
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
import { useDebounce } from "@/hooks/utils/useDebounce";
import { label, PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/functions/labels.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

/**
 * The rides board: every ride by where it stands, the ones still without a
 * driver first — that is the work. A row opens the ride, where it is assigned,
 * started, ended or cancelled.
 */

const TABS: { key: RideStatus | "ALL"; label: TranslationKey }[] = [
  { key: "PENDING", label: RIDE_STATUS.PENDING },
  { key: "ASSIGNED", label: RIDE_STATUS.ASSIGNED },
  { key: "STARTED", label: RIDE_STATUS.STARTED },
  { key: "COMPLETED", label: RIDE_STATUS.COMPLETED },
  { key: "CANCELLED", label: RIDE_STATUS.CANCELLED },
  { key: "ALL", label: "tr.rides.all" }
];

const PAYMENT_STYLES: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  UNPAID: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  REVERSED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
};

const alertCount = (r: RideRow) => r.alertsCount ?? 0;

export default function RidesBoardPage() {
  const { t, locale } = useT();
  const router = useRouter();
  // The tab comes from the address, so a tab can be bookmarked and the sidebar
  // can point at one. Anything else in it is the default.
  const asked = router.query.status;
  const tab = TABS.some((x) => x.key === asked) ? (asked as RideStatus | "ALL") : "PENDING";
  const [city, setCity] = useState("");
  const [driver, setDriver] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [q, setQ] = useState("");
  const term = useDebounce(q.trim(), 300);
  const filters = {
    status: tab === "ALL" ? "" : tab,
    city,
    driver,
    from: range.from,
    to: range.to,
    q: term
  };
  const [page, setPage] = usePage(JSON.stringify(filters));

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["rides", filters, page],
    queryFn: () => listRides({ ...filters, page, limit: PAGE_SIZE }),
    // Rides are booked on the website at any time, and changed on their own page.
    refetchOnMount: "always",
    placeholderData: keepPreviousData
  });
  // The driver filter offers the drivers of the chosen city, or all of them.
  // The drivers are fleet (inventory:read): an admin who only runs bookings
  // gets no filter rather than a 403 behind an empty one.
  const { can } = useCan();
  const canReadFleet = can("inventory:read");
  const { data: drivers } = useQuery({
    queryKey: ["drivers", { city }],
    queryFn: () => listDrivers({ city }),
    staleTime: 60 * 1000,
    enabled: canReadFleet
  });

  const counts = data?.counts;
  const countOf = (key: RideStatus | "ALL") =>
    !counts
      ? undefined
      : key === "ALL"
        ? Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)
        : (counts[key] ?? 0);
  const rows = data?.items ?? [];
  const narrowed = Boolean(term || city || driver || range.from || range.to);

  return (
    <AdminLayout
      title={t("nav.transfers.rides")}
      description={t("tr.rides.description")}
    >
      <div className="flex flex-col gap-4">
        {/* The fleet is inventory: without it, no checklist rather than a 403. */}
        {canReadFleet ? <SetupChecklist /> : null}
        <div className="flex flex-wrap gap-1 border-b pb-2">
          {TABS.map(({ key, label: text }) => (
            <Link
              key={key}
              href={key === "PENDING" ? "/transfers" : `/transfers?status=${key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === key
                  ? "bg-foreground font-medium text-background"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t(text)}
              {/* Always a number, zero included: a tab with none beside it
                  reads as "not counted", not as "nothing there". */}
              {counts ? (
                <span className="ms-1.5 tabular-nums opacity-70">{countOf(key)}</span>
              ) : null}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("tr.rides.search")}
              className="ps-9"
            />
          </div>
          <CitySelect
            any
            value={city}
            onChange={(next) => {
              setCity(next);
              // A driver of another city is no filter for this one.
              setDriver("");
            }}
          />
          {canReadFleet ? (
            <OptionSelect
              aria-label={t("tr.actor.DRIVER")}
              className="w-auto min-w-40"
              value={driver}
              onChange={setDriver}
              options={[
                { value: "", label: t("tr.rides.allDrivers") },
                ...(drivers?.items ?? []).map((d) => ({ value: d.id, label: d.name }))
              ]}
            />
          ) : null}
          <DateRangeFilter
            label={t("tr.rides.pickup")}
            future
            from={range.from}
            to={range.to}
            onChange={(from, to) => setRange({ from, to })}
          />
        </div>

        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <div
            // The rows before stay up, dimmed and out of reach, while the next ones load.
            aria-busy={isPlaceholderData || undefined}
            className={cn(
              "overflow-x-auto rounded-lg border bg-background",
              isPlaceholderData && "opacity-60"
            )}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tr.rides.pickupTime")}</TableHead>
                  <TableHead>{t("book.reference")}</TableHead>
                  <TableHead>{t("tr.rides.route")}</TableHead>
                  <TableHead>{t("tr.rides.category")}</TableHead>
                  <TableHead>{t("book.customer")}</TableHead>
                  <TableHead>{t("tr.actor.DRIVER")}</TableHead>
                  <TableHead>{t("book.payment")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody inert={isPlaceholderData || undefined}>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      {t("common.loading")}
                    </TableCell>
                  </TableRow>
                ) : !rows.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      {narrowed
                        ? t("tr.rides.noMatch")
                        : tab === "PENDING"
                          ? t("tr.rides.nonePending")
                          : t("tr.rides.none")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => {
                    const alerts = alertCount(r);
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer align-top"
                        onClick={() => router.push(`/transfers/rides/${r.id}`)}
                      >
                        {/* The board fits a 1280 px screen: the day above the
                            time, the alert under the reference, and names that
                            wrap rather than widen their column. */}
                        <TableCell className="text-sm">
                          <p>{rideDay(r.at, locale)}</p>
                          <p className="tabular-nums">{r.at.slice(11, 16)}</p>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/transfers/rides/${r.id}`}
                            className="font-mono text-sm font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.reference || "—"}
                          </Link>
                          {alerts ? (
                            <Badge className="mt-1 flex gap-1 bg-red-600 text-white">
                              <ShieldAlert />
                              {alerts > 1 ? t("tr.rides.alertTimes", { n: alerts }) : t("tr.rides.alert")}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="min-w-48 max-w-80 whitespace-normal text-sm">
                          {routeText(t, r)}
                          <p className="text-xs text-muted-foreground">{r.city}</p>
                        </TableCell>
                        <TableCell className="whitespace-normal text-sm">
                          {r.category?.name ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-normal text-sm">
                          <p>{r.customer?.name ?? "—"}</p>
                          <p className="whitespace-nowrap text-xs text-muted-foreground">
                            {t(isOne(locale, r.passengers) ? "tr.rides.passengers.one" : "tr.rides.passengers.other", {
                              n: r.passengers
                            })}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-normal text-sm">
                          {r.driver?.name ??
                            (r.status === "PENDING" ? (
                              <span className="whitespace-nowrap text-amber-700 dark:text-amber-400">
                                {t("tr.rides.assign")}
                              </span>
                            ) : (
                              "—"
                            ))}
                        </TableCell>
                        <TableCell>
                          {r.order ? (
                            <>
                              <Badge variant="secondary" className={PAYMENT_STYLES[r.order.paymentStatus]}>
                                {label(PAYMENT_STATUS, r.order.paymentStatus)}
                              </Badge>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                {label(PAYMENT_METHOD, r.order.paymentMethod)}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <RideStatusBadge status={r.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <Pager
          page={page}
          total={data?.total ?? 0}
          onPage={setPage}
          noun={t("tr.rides.noun")}
          plural={t("tr.rides.plural")}
        />
      </div>
    </AdminLayout>
  );
}
