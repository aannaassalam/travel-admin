import {
  Dashboard,
  DateRange,
  Delta,
  getDashboard,
  getQueueCounts
} from "@/api/functions/admin.api";
import DateField from "@/components/DateField";
import { namedPeriods } from "@/components/DateRangeFilter";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import SortHead, { sortRows, type Sort } from "@/components/SortHead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  BASE_CURRENCY,
  formatDateTime,
  formatFrancs,
  formatMoney,
  formatOrderTotal,
  formatPercent,
  fromBase,
  relativeTime
} from "@/lib/functions/format.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { useDisplayCurrency } from "@/lib/displayCurrency";
import {
  anyStatus,
  label,
  PAYMENT_METHOD,
  VERTICAL
} from "@/lib/functions/labels.lib";
import { canOpenRoute, useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  FileWarning,
  type LucideIcon,
  MessageSquareWarning
} from "lucide-react";
import type { AxiosError } from "axios";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import { Fragment, useState } from "react";

const TrendChart = dynamic(() => import("@/components/Dashboard/TrendChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-[280px] w-full" />
});

const DAY_MS = 86400000;
const DEFAULT_RANGE_DAYS = 30;
/** How far after From the To can be: 366 days in all, the most the server serves. */
const MAX_SPAN_DAYS = 365;

/**
 * Every date here is a plain YYYY-MM-DD handled in UTC, because the server
 * buckets the daily series by UTC day. Doing the arithmetic in local time
 * would slide the window by a day for anyone east or west of Greenwich.
 */
const IS_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A real day, not only the shape of one: "2026-02-31" has the shape. */
const isDay = (v: string) => {
  if (!IS_DATE.test(v)) return false;
  const at = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === v;
};
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoShift = (iso: string, by: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);
/**
 * DD/MM/YYYY straight off the string. `formatDate` would parse it into a Date
 * and read it back with local getters, which shifts the day for anyone west
 * of Greenwich — these are plain calendar dates with no timezone to honour.
 */
const isoPretty = (iso: string) => iso.split("-").reverse().join("/");
/** Inclusive length: the same day twice is one day, not nought. */
const isoDays = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  ) + 1;

/** The dashboard's queue chips, named as the bookings page names its tabs. */
const QUEUE_LABELS: Record<string, TranslationKey> = {
  "needs-action": "book.queue.needsAction",
  "cash-pending": "book.queue.cashPending",
  "pending-document": "book.queue.pendingDocument",
  "pending-completion": "book.queue.pendingCompletion",
  "departing-soon": "book.queue.departingSoon",
  cancellations: "book.queue.cancellations"
};

/** A translation with React nodes in its {placeholders}: a date in bold, say. */
const rich = (text: string, nodes: Record<string, React.ReactNode>) =>
  text.split(/(\{\w+\})/).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{name && name in nodes ? nodes[name] : part}</Fragment>;
  });

const PAYMENT_STYLES: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  UNPAID: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  REVERSED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
};
const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  SUBMITTED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  CANCELLED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
};

const chip = (value: string, styles: Record<string, string>) => (
  <Badge variant="secondary" className={cn("font-normal", styles[value])}>
    {anyStatus(value)}
  </Badge>
);

/** "+12% vs previous 30 days" — or "—" when there is nothing to compare to. */
function DeltaLine({ d, days }: { d?: Delta; days: number }) {
  const { t } = useT();
  if (!d) return null;
  if (!d.previous) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        — {t("ops.dash.vsPrevious", { days })}
      </p>
    );
  }
  const pct = ((d.value - d.previous) / Math.abs(d.previous)) * 100;
  const up = pct >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-flex items-center font-medium tabular-nums",
          up
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400"
        )}
      >
        <Arrow className="size-3.5 rtl:-scale-x-100" />
        {up ? "+" : ""}
        {pct.toFixed(0)}%
      </span>
      {t("ops.dash.vsPrevious", { days })}
    </p>
  );
}

function Stat({
  label,
  value,
  hint,
  delta,
  days,
  loading,
  tone
}: {
  label: string;
  value: string | number;
  hint: string;
  delta?: Delta;
  days: number;
  loading: boolean;
  tone?: string;
}) {
  return (
    <Card className="gap-0 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>
            {value}
          </p>
          <DeltaLine d={delta} days={days} />
        </>
      )}
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {hint}
      </p>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-medium text-muted-foreground">
      {children}
    </h2>
  );
}

/** Wraps a card in a link only when the page behind it would open. */
function MaybeLink({
  href,
  allowed,
  children
}: {
  href: string;
  allowed: boolean;
  children: React.ReactNode;
}) {
  return allowed ? (
    <Link href={href} className="block h-full">
      {children}
    </Link>
  ) : (
    <div className="h-full">{children}</div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { can, admin } = useCan();
  const { t, locale } = useT();
  const canOrders = can("orders:read");
  const serviceLabel = (v: string) => VERTICAL[v] ?? v;
  const open = (href: string) =>
    canOpenRoute(admin?.permissions, href.split("?")[0]);

  // The window lives in the URL, so a range can be shared and the back button
  // steps through it. Absent or malformed, it falls back to the last month.
  const today = isoToday();
  const asDate = (v: unknown, fallback: string) =>
    typeof v === "string" && isDay(v) ? v : fallback;
  const picked = {
    from: asDate(router.query.from, isoShift(today, -(DEFAULT_RANGE_DAYS - 1))),
    to: asDate(router.query.to, today)
  };
  // A hand-edited URL can arrive back-to-front; read it in the order it makes
  // sense rather than refusing to render.
  const range: DateRange =
    picked.from <= picked.to
      ? picked
      : { from: picked.to, to: picked.from };
  const days = isoDays(range.from, range.to);
  const daysText = t(days === 1 ? "ops.dash.days.one" : "ops.dash.days.other", { n: days });

  // A period longer than the server serves (366 days), from a hand-edited
  // address, comes back with its reason, shown below the fields.
  const setRange = (from: string, to: string) =>
    router.replace(
      { query: { ...router.query, from, to } },
      undefined,
      { shallow: true }
    );
  // Two fields, each free: an earlier From brings To along rather than
  // making a period longer than 366 days.
  const latestTo = (from: string) => {
    const limit = isoShift(from, MAX_SPAN_DAYS);
    return limit < today ? limit : today;
  };
  const setFrom = (from: string) =>
    setRange(from, range.to > latestTo(from) ? latestTo(from) : range.to);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard", range.from, range.to],
    queryFn: () => getDashboard(range),
    // The first screen of the day must not be yesterday's numbers.
    refetchOnMount: "always"
  });
  const { data: queues } = useQuery({
    queryKey: ["queue-counts"],
    queryFn: getQueueCounts,
    enabled: canOrders,
    refetchOnMount: "always"
  });

  // The figures arrive in francs. They are read in the currency chosen in the
  // header (this device's choice), at the office's rate, converted and rounded
  // exactly as the API converts a price.
  const { currency: cur, rates } = useDisplayCurrency();
  const rate = cur === BASE_CURRENCY ? undefined : (rates[cur] ?? undefined);
  // Francs are written FC, like every franc amount.
  const unit = (c: string) => (c === BASE_CURRENCY ? "FC" : c);
  const money = (cdf?: number) =>
    formatMoney(cdf === undefined ? undefined : fromBase(cdf, cur, rates), cur, locale);
  // A period the server will not serve (longer than a year) is refused in its
  // own words; retrying the same period would not help.
  const refusal = (error as AxiosError<{ message?: string }> | null)?.response;
  const refused = refusal?.status === 400 ? refusal.data?.message : undefined;

  const h = data?.headline;
  const cash = data?.cash;
  const a = data?.actions;
  const inv = data?.inventory;
  const hasSales = (data?.headline.bookings.value ?? 0) > 0;
  const maxVerticalRevenue = Math.max(
    1,
    ...(data?.byVertical.map((v) => v.revenue) ?? [0])
  );

  // "Recent bookings" arrives whole, so its headings order it here, each by
  // what its cell shows. Newest first until one is pressed.
  const [sort, setSort] = useState<Sort>("");
  const head = { sort, onSort: setSort };
  const recent = sortRows(data?.recentOrders ?? [], sort, {
    reference: (o) => o.reference,
    customer: (o) => o.customerName,
    services: (o) => o.services.map(serviceLabel).join(", "),
    total: (o) => o.total,
    payment: (o) => anyStatus(o.paymentStatus),
    status: (o) => anyStatus(o.status),
    when: (o) => Date.parse(o.createdAt)
  });

  const actions: {
    key: keyof Dashboard["actions"];
    label: string;
    hint: string;
    icon: LucideIcon;
    tone: string;
    href: string;
    hideWhenZero?: boolean;
  }[] = [
    {
      key: "awaitingCompletion",
      label: t("ops.dash.act.complete"),
      hint: t("ops.dash.act.completeHint"),
      icon: CheckCircle2,
      tone: "text-sky-600 dark:text-sky-400",
      href: "/bookings?queue=pending-completion"
    },
    {
      key: "cashExpiring24h",
      label: t("ops.dash.act.cashDue"),
      hint: t("ops.dash.act.cashDueHint"),
      icon: Clock,
      tone: "text-amber-600 dark:text-amber-400",
      href: "/bookings?queue=cash-pending"
    },
    {
      key: "awaitingDocuments",
      label: t("ops.dash.act.documents"),
      hint: t("ops.dash.act.documentsHint"),
      icon: FileWarning,
      tone: "text-amber-600 dark:text-amber-400",
      href: "/bookings?queue=pending-document"
    },
    {
      key: "departingSoon",
      label: t("ops.dash.act.departing"),
      hint: t("ops.dash.act.departingHint"),
      icon: CalendarClock,
      tone: "text-sky-600 dark:text-sky-400",
      href: "/bookings?queue=departing-soon"
    },
    {
      key: "enquiriesOverdue",
      label: t("ops.dash.act.enquiries"),
      hint: t("ops.dash.act.enquiriesHint"),
      icon: MessageSquareWarning,
      tone: "text-red-600 dark:text-red-400",
      href: "/enquiries"
    },
    {
      key: "failedPayments24h",
      label: t("ops.dash.act.failed"),
      hint: t("ops.dash.act.failedHint"),
      icon: CreditCard,
      tone: "text-red-600 dark:text-red-400",
      href: "/bookings?queue=needs-action",
      hideWhenZero: true
    },
    {
      key: "reversedPayments",
      label: t("ops.dash.act.reversed"),
      hint: t("ops.dash.act.reversedHint"),
      icon: AlertTriangle,
      tone: "text-red-600 dark:text-red-400",
      href: "/payments",
      hideWhenZero: true
    }
  ];

  return (
    <AdminLayout
      title={t("nav.dashboard")}
      description={t("ops.dash.description")}
    >
      <div className="flex flex-col gap-8">
        {/* Period */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {rich(t("ops.dash.showing"), {
                from: <span className="font-medium text-foreground">{isoPretty(range.from)}</span>,
                to: <span className="font-medium text-foreground">{isoPretty(range.to)}</span>,
                days: daysText
              })}
            </p>
          </div>
          {/* The days are UTC's (see above), so "today" is UTC's today. */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <Label className="text-xs">{t("ops.dash.from")}</Label>
              <DateField
                aria-label={t("ops.dash.from")}
                clearable={false}
                max={range.to}
                value={range.from}
                onChange={setFrom}
              />
            </div>
            <div className="w-40">
              <Label className="text-xs">{t("ops.dash.to")}</Label>
              <DateField
                aria-label={t("ops.dash.to")}
                clearable={false}
                min={range.from}
                max={latestTo(range.from)}
                value={range.to}
                onChange={(to) => setRange(range.from, to)}
              />
            </div>
            <div role="group" aria-label={t("ops.dash.quickPeriods")} className="flex flex-wrap gap-1">
              {namedPeriods(today, t).map((p) => {
                const on = range.from === p.from && range.to === p.to;
                return (
                  <Button
                    key={p.key}
                    size="sm"
                    variant={on ? "secondary" : "outline"}
                    aria-pressed={on}
                    className="font-normal"
                    onClick={() => setRange(p.from, p.to)}
                  >
                    {p.name}
                  </Button>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("ops.dash.periodLimit")}
          </p>
        </div>

        {isError ? (
          // Without this the skeletons resolve to an all-zero dashboard, which
          // reads as "business is dead" rather than "the figures didn't load".
          // The period stays above it, where a refused one is put right.
          <QueryError
            message={refused}
            onRetry={refused ? undefined : () => refetch()}
          />
        ) : (
        <>
        {/* Headline */}
        <section>
          <SectionTitle>{t("ops.dash.sales", { period: daysText })}</SectionTitle>
          {/* Never six to a row: a month in francs ("100 000 000 FC") does not
              break like "USD 35,131.58" did, and ran out of a card that narrow. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat
              label={t("ops.dash.revenue")}
              value={money(h?.revenue.value)}
              hint={t("ops.dash.revenueHint")}
              delta={h?.revenue}
              days={days}
              loading={isLoading}
            />
            <Stat
              label={t("ops.dash.paidBookings")}
              value={h?.bookings.value ?? "—"}
              hint={t("ops.dash.paidBookingsHint")}
              delta={h?.bookings}
              days={days}
              loading={isLoading}
            />
            <Stat
              label={t("ops.dash.averageBooking")}
              value={money(h?.averageBooking.value)}
              hint={t("ops.dash.averageBookingHint")}
              delta={h?.averageBooking}
              days={days}
              loading={isLoading}
            />
            <Stat
              label={t("ops.dash.profit")}
              value={money(h?.grossMargin.value)}
              hint={t("ops.dash.profitHint", { percent: formatPercent(h?.marginPercent.value) })}
              delta={h?.grossMargin}
              days={days}
              loading={isLoading}
            />
            <Stat
              label={t("ops.dash.newCustomers")}
              value={h?.newCustomers.value ?? "—"}
              hint={t("ops.dash.newCustomersHint")}
              delta={h?.newCustomers}
              days={days}
              loading={isLoading}
            />
            <Stat
              label={t("ops.dash.enquiriesWon")}
              value={h?.enquiriesWon.value ?? "—"}
              hint={t("ops.dash.enquiriesWonHint")}
              delta={h?.enquiriesWon}
              days={days}
              loading={isLoading}
            />
          </div>
        </section>

        {/* Cash */}
        <section>
          <SectionTitle>{t("ops.dash.moneyToCollect")}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <MaybeLink
              href="/bookings?queue=cash-pending"
              allowed={open("/bookings")}
            >
              <Stat
                label={t("ops.dash.cashOwed")}
                value={money(cash?.outstanding.amount)}
                hint={t(
                  cash?.outstanding.count === 1 ? "ops.dash.cashOwedHint.one" : "ops.dash.cashOwedHint.other",
                  { n: cash?.outstanding.count ?? 0 }
                )}
                days={days}
                loading={isLoading}
                tone="text-amber-600 dark:text-amber-400"
              />
            </MaybeLink>
            <MaybeLink
              href="/bookings?queue=cash-pending"
              allowed={open("/bookings")}
            >
              <Stat
                label={t("ops.dash.holdsExpiring")}
                value={cash?.expiring24h ?? "—"}
                hint={t("ops.dash.holdsExpiringHint")}
                days={days}
                loading={isLoading}
                tone={cash?.expiring24h ? "text-red-600 dark:text-red-400" : ""}
              />
            </MaybeLink>
            <Stat
              label={t("ops.dash.cashCollected")}
              value={money(cash?.collectedInPeriod)}
              hint={t("ops.dash.cashCollectedHint")}
              days={days}
              loading={isLoading}
              tone="text-emerald-600 dark:text-emerald-400"
            />
          </div>
        </section>

        {/* Trend + by service */}
        <section className="grid gap-3 lg:grid-cols-[3fr_2fr]">
          <Card className="min-w-0 gap-0 p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{t("ops.dash.revenuePerDay")}</p>
              <p className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block size-2.5 rounded-sm bg-chart-1" />
                  {t("ops.dash.revenueUnit", { unit: unit(cur) })}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3 bg-chart-2" />
                  {t("ops.dash.bookings")}
                </span>
              </p>
            </div>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : hasSales ? (
              <TrendChart
                data={(data?.series ?? []).map((d) => ({
                  ...d,
                  revenue: fromBase(d.revenue, cur, rates) ?? 0
                }))}
                currency={cur}
                compact={isMobile}
              />
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                {t("ops.dash.noPaidBookings")}
              </div>
            )}
          </Card>

          <Card className="min-w-0 gap-0 p-4">
            <p className="mb-3 text-sm font-medium">{t("ops.dash.salesByService")}</p>
            {isLoading ? (
              <div className="flex flex-col gap-3">
                {Object.keys(VERTICAL).map((k) => (
                  <Skeleton key={k} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {data?.byVertical.map((v) => {
                  const marginPct = v.revenue ? (v.margin / v.revenue) * 100 : null;
                  return (
                    <li key={v.vertical}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium">{serviceLabel(v.vertical)}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {v.bookings} · {money(v.revenue)}
                          {marginPct !== null ? (
                            <span className="ms-1 text-emerald-600 dark:text-emerald-400">
                              {t("ops.dash.profitPercent", { percent: formatPercent(marginPct) })}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded bg-muted">
                        <div
                          className="h-full rounded bg-chart-1"
                          style={{ width: `${(v.revenue / maxVerticalRevenue) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        {/* Actions */}
        <section>
          <SectionTitle>{t("ops.dash.needsAttention")}</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            {actions
              .filter(({ key, hideWhenZero }) => !hideWhenZero || (a?.[key] ?? 0) > 0)
              .map(({ key, label, hint, icon: Icon, tone, href }) => {
                const count = a?.[key] ?? 0;
                const linked = open(href);
                return (
                  <MaybeLink key={key} href={href} allowed={linked}>
                    <Card
                      className={cn(
                        "h-full gap-0 p-4",
                        linked && "transition-colors hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{label}</p>
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            count ? tone : "text-muted-foreground/40"
                          )}
                        />
                      </div>
                      {isLoading ? (
                        <Skeleton className="mt-3 h-7 w-10" />
                      ) : (
                        <p
                          className={cn(
                            "mt-2 text-2xl font-semibold tabular-nums",
                            count ? tone : "text-muted-foreground/40"
                          )}
                        >
                          {count}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        {hint}
                      </p>
                    </Card>
                  </MaybeLink>
                );
              })}
          </div>
        </section>

        {/* Recent + top sellers */}
        <section
          className={cn(
            "grid gap-3",
            // Side by side only where the table has room for all its columns.
            data?.recentOrders ? "2xl:grid-cols-[3fr_2fr]" : ""
          )}
        >
          {data?.recentOrders || (isLoading && canOrders) ? (
            <div className="min-w-0">
              <SectionTitle>{t("ops.dash.recentBookings")}</SectionTitle>
              <div className="overflow-x-auto rounded-lg border bg-background">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <SortHead column="reference" {...head}>
                        {t("book.reference")}
                      </SortHead>
                      <SortHead column="customer" {...head}>
                        {t("book.customer")}
                      </SortHead>
                      <SortHead column="services" {...head}>
                        {t("ops.dash.services")}
                      </SortHead>
                      <SortHead column="total" align="right" className="text-end" {...head}>
                        {t("common.total")}
                      </SortHead>
                      <SortHead column="payment" {...head}>
                        {t("book.payment")}
                      </SortHead>
                      <SortHead column="status" {...head}>
                        {t("common.status")}
                      </SortHead>
                      <SortHead column="when" {...head}>
                        {t("ops.dash.when")}
                      </SortHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          {t("common.loading")}
                        </TableCell>
                      </TableRow>
                    ) : !data?.recentOrders?.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                          {t("ops.dash.noBookings")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      recent.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell>
                            <Link
                              href={`/bookings/${o.id}`}
                              className="font-mono text-sm font-medium hover:underline"
                            >
                              {o.reference}
                            </Link>
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate">
                            {o.customerName || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {o.services.map(serviceLabel).join(", ") || "—"}
                          </TableCell>
                          {/* A booking is what it was charged, not today's conversion. */}
                          <TableCell className="text-end font-medium tabular-nums">
                            {formatOrderTotal(o, locale)}
                          </TableCell>
                          <TableCell>
                            {chip(o.paymentStatus, PAYMENT_STYLES)}
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {label(PAYMENT_METHOD, o.paymentMethod)}
                            </div>
                          </TableCell>
                          <TableCell>{chip(o.status, STATUS_STYLES)}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {relativeTime(o.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          <div className="min-w-0">
            <SectionTitle>{t("ops.dash.topSellers", { period: daysText })}</SectionTitle>
            <Card className="gap-0 p-4">
              {isLoading ? (
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : !data?.topListings.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("ops.dash.noBookingsInPeriod")}
                </p>
              ) : (
                <ol className="flex flex-col divide-y">
                  {data.topListings.map((top, i) => (
                    <li
                      key={`${top.listingLabel}-${i}`}
                      className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      <span className="w-5 shrink-0 text-sm tabular-nums text-muted-foreground">
                        {i + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{top.listingLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {serviceLabel(top.vertical)} · {t("ops.dash.sold", { n: top.units })}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {money(top.revenue)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </section>

        {/* Inventory */}
        <section>
          <SectionTitle>{t("nav.inventory")}</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MaybeLink href="/inventory" allowed={open("/inventory")}>
              <Stat
                label={t("ops.dash.liveForSale")}
                value={inv?.published ?? "—"}
                hint={t("ops.dash.liveForSaleHint", { n: inv?.inactive ?? 0 })}
                days={days}
                loading={isLoading}
              />
            </MaybeLink>
          </div>
        </section>

        {canOrders ? (
          <section>
            <SectionTitle>{t("dash.queues")}</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {Object.entries(queues ?? {})
                // The work waiting to be done. "Completed" and "all" are tabs
                // on the bookings page, not queues.
                .filter(([queue]) => queue !== "completed" && queue !== "all")
                .map(([queue, count]) => (
                <Link
                  key={queue}
                  href={`/bookings?queue=${queue}`}
                  className="rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
                >
                  {QUEUE_LABELS[queue] ? (
                    t(QUEUE_LABELS[queue])
                  ) : (
                    <span className="capitalize">{queue.replace(/-/g, " ")}</span>
                  )}{" "}
                  <span className="font-semibold tabular-nums">{count}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("ops.dash.dataAsOf", { date: formatDateTime(data?.dataAsOf), unit: unit(cur) })}
          {rate
            ? t("ops.dash.convertedAt", { currency: cur, rate: formatFrancs(rate, locale, 2) })
            : null}
        </p>
        </>
        )}
      </div>
    </AdminLayout>
  );
}
