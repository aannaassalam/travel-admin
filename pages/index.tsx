import {
  Dashboard,
  DashboardDays,
  Delta,
  getDashboard,
  getQueueCounts
} from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  relativeTime
} from "@/lib/functions/format.lib";
import {
  anyStatus,
  label,
  PAYMENT_METHOD
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
  MessageSquareWarning,
  PackageX
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";

const TrendChart = dynamic(() => import("@/components/Dashboard/TrendChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-[280px] w-full" />
});

const PERIODS: DashboardDays[] = [7, 30, 90];

const VERTICAL_LABELS: Record<string, string> = {
  HOTEL: "Hotels",
  FLIGHT: "Flights",
  BUS: "Bus",
  CAR: "Car hire",
  ACTIVITY: "Activities",
  PROPERTY: "Property",
  RESTAURANT: "Restaurants"
};
const serviceLabel = (v: string) => VERTICAL_LABELS[v] ?? v;

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
  if (!d) return null;
  if (!d.previous) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        — vs previous {days} days
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
        <Arrow className="size-3.5" />
        {up ? "+" : ""}
        {pct.toFixed(0)}%
      </span>
      vs previous {days} days
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
  const canOrders = can("orders:read");
  const open = (href: string) =>
    canOpenRoute(admin?.permissions, href.split("?")[0]);

  const queried = Number(router.query.days);
  const days: DashboardDays = PERIODS.includes(queried as DashboardDays)
    ? (queried as DashboardDays)
    : 30;
  const setDays = (d: DashboardDays) =>
    router.replace({ query: { ...router.query, days: d } }, undefined, {
      shallow: true
    });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard", days],
    queryFn: () => getDashboard(days)
  });
  const { data: queues } = useQuery({
    queryKey: ["queue-counts"],
    queryFn: getQueueCounts,
    enabled: canOrders
  });

  const c = data?.currency ?? "USD";
  const h = data?.headline;
  const cash = data?.cash;
  const a = data?.actions;
  const inv = data?.inventory;
  const hasSales = (data?.headline.bookings.value ?? 0) > 0;
  const maxVerticalRevenue = Math.max(
    1,
    ...(data?.byVertical.map((v) => v.revenue) ?? [0])
  );

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
      key: "awaitingConfirmation",
      label: "Bookings to confirm",
      hint: "Customers are waiting for a yes.",
      icon: CheckCircle2,
      tone: "text-sky-600 dark:text-sky-400",
      href: "/bookings?queue=awaiting-confirmation"
    },
    {
      key: "cashExpiring24h",
      label: "Cash due in 24h",
      hint: "Call these customers before the hold expires.",
      icon: Clock,
      tone: "text-amber-600 dark:text-amber-400",
      href: "/bookings?queue=cash-pending"
    },
    {
      key: "awaitingDocuments",
      label: "Paid, documents not sent",
      hint: "Tickets or vouchers still to issue.",
      icon: FileWarning,
      tone: "text-amber-600 dark:text-amber-400",
      href: "/bookings?queue=needs-action"
    },
    {
      key: "departingSoon",
      label: "Travelling in 48h",
      hint: "Confirmed trips leaving soon.",
      icon: CalendarClock,
      tone: "text-sky-600 dark:text-sky-400",
      href: "/bookings?queue=departing-soon"
    },
    {
      key: "enquiriesOverdue",
      label: "Enquiries not answered",
      hint: "Past the reply time you set in Settings.",
      icon: MessageSquareWarning,
      tone: "text-red-600 dark:text-red-400",
      href: "/enquiries"
    },
    {
      key: "stockAtRisk",
      label: "Stock expiring unsold",
      hint: `Nights and seats departing within ${inv?.atRiskWindowDays ?? 7} days.`,
      icon: PackageX,
      tone: "text-red-600 dark:text-red-400",
      href: "/inventory"
    },
    {
      key: "failedPayments24h",
      label: "Failed payments (24h)",
      hint: "Online payments that did not go through.",
      icon: CreditCard,
      tone: "text-red-600 dark:text-red-400",
      href: "/bookings?queue=needs-action",
      hideWhenZero: true
    },
    {
      key: "reversedPayments",
      label: "Reversed payments",
      hint: "Money the provider took back.",
      icon: AlertTriangle,
      tone: "text-red-600 dark:text-red-400",
      href: "/payments",
      hideWhenZero: true
    }
  ];

  return (
    <AdminLayout
      title="Dashboard"
      description="How the business is doing, at a glance"
    >
      {isError ? (
        // Without this the skeletons resolve to an all-zero dashboard, which
        // reads as "business is dead" rather than "the figures didn't load".
        <QueryError onRetry={() => refetch()} />
      ) : (
      <div className="flex flex-col gap-8">
        {/* Period */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing the last <span className="font-medium text-foreground">{days} days</span>
          </p>
          <div className="flex gap-1 rounded-lg border bg-background p-1">
            {PERIODS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm transition-colors",
                  d === days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {d} days
              </button>
            ))}
          </div>
        </div>

        {/* Headline */}
        <section>
          <SectionTitle>Sales · last {days} days</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="Revenue"
              value={formatMoney(h?.revenue.value, c)}
              hint="Money from paid bookings made in this period."
              delta={h?.revenue}
              days={days}
              loading={isLoading}
            />
            <Stat
              label="Paid bookings"
              value={h?.bookings.value ?? "—"}
              hint="Bookings that were paid and not cancelled."
              delta={h?.bookings}
              days={days}
              loading={isLoading}
            />
            <Stat
              label="Average booking"
              value={formatMoney(h?.averageBooking.value, c)}
              hint="Revenue divided by paid bookings."
              delta={h?.averageBooking}
              days={days}
              loading={isLoading}
            />
            <Stat
              label="Profit (gross margin)"
              value={formatMoney(h?.grossMargin.value, c)}
              hint={`Revenue minus what the stock cost you · ${formatPercent(h?.marginPercent.value)} of revenue.`}
              delta={h?.grossMargin}
              days={days}
              loading={isLoading}
            />
            <Stat
              label="New customers"
              value={h?.newCustomers.value ?? "—"}
              hint="People who signed up in this period."
              delta={h?.newCustomers}
              days={days}
              loading={isLoading}
            />
            <Stat
              label="Enquiries won"
              value={h?.enquiriesWon.value ?? "—"}
              hint="Property and other enquiries that turned into a sale."
              delta={h?.enquiriesWon}
              days={days}
              loading={isLoading}
            />
          </div>
        </section>

        {/* Cash */}
        <section>
          <SectionTitle>Money to collect</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <MaybeLink
              href="/bookings?queue=cash-pending"
              allowed={open("/bookings")}
            >
              <Stat
                label="Cash still owed"
                value={formatMoney(cash?.outstanding.amount, c)}
                hint={`${cash?.outstanding.count ?? 0} booking${cash?.outstanding.count === 1 ? "" : "s"} reserved but not yet paid.`}
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
                label="Holds expiring in 24h"
                value={cash?.expiring24h ?? "—"}
                hint="Bookings that cancel themselves if the cash does not arrive."
                days={days}
                loading={isLoading}
                tone={cash?.expiring24h ? "text-red-600 dark:text-red-400" : ""}
              />
            </MaybeLink>
            <Stat
              label="Cash collected"
              value={formatMoney(cash?.collectedInPeriod, c)}
              hint={`Cash received at the counter in the last ${days} days.`}
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
              <p className="text-sm font-medium">Revenue per day</p>
              <p className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block size-2.5 rounded-sm bg-chart-1" />
                  Revenue ({c})
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3 bg-chart-2" />
                  Bookings
                </span>
              </p>
            </div>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : hasSales ? (
              <TrendChart data={data?.series ?? []} currency={c} compact={isMobile} />
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                No paid bookings in this period yet.
              </div>
            )}
          </Card>

          <Card className="min-w-0 gap-0 p-4">
            <p className="mb-3 text-sm font-medium">Sales by service</p>
            {isLoading ? (
              <div className="flex flex-col gap-3">
                {Object.keys(VERTICAL_LABELS).map((k) => (
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
                          {v.bookings} · {formatMoney(v.revenue, c)}
                          {marginPct !== null ? (
                            <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                              {formatPercent(marginPct)} profit
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
          <SectionTitle>Needs attention today</SectionTitle>
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
              <SectionTitle>Recent bookings</SectionTitle>
              <div className="overflow-x-auto rounded-lg border bg-background">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Services</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : !data?.recentOrders?.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                          No bookings yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.recentOrders.map((o) => (
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
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatMoney(o.total, c)}
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
            <SectionTitle>Top sellers · last {days} days</SectionTitle>
            <Card className="gap-0 p-4">
              {isLoading ? (
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : !data?.topListings.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No bookings in this period yet.
                </p>
              ) : (
                <ol className="flex flex-col divide-y">
                  {data.topListings.map((t, i) => (
                    <li
                      key={`${t.listingLabel}-${i}`}
                      className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      <span className="w-5 shrink-0 text-sm tabular-nums text-muted-foreground">
                        {i + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.listingLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {serviceLabel(t.vertical)} · {t.units} sold
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {formatMoney(t.revenue, c)}
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
          <SectionTitle>Inventory health</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MaybeLink href="/inventory" allowed={open("/inventory")}>
              <Stat
                label="Live for sale"
                value={inv?.published ?? "—"}
                hint={`Hotels, listings and restaurants customers can book · ${inv?.draft ?? 0} in draft, ${inv?.paused ?? 0} paused.`}
                days={days}
                loading={isLoading}
              />
            </MaybeLink>
            <MaybeLink href="/inventory" allowed={open("/inventory")}>
              <Stat
                label="Stock at risk"
                value={formatMoney(inv?.atRiskValue, c)}
                hint={`What you paid for nights and seats that leave within ${inv?.atRiskWindowDays ?? 7} days and are still unsold.`}
                days={days}
                loading={isLoading}
                tone={inv?.atRiskValue ? "text-amber-600 dark:text-amber-400" : ""}
              />
            </MaybeLink>
            <Stat
              label="Lost on unsold stock"
              value={formatMoney(inv?.spoilageValue, c)}
              hint="Hotel nights that passed without being sold, at what they cost you."
              days={days}
              loading={isLoading}
              tone={inv?.spoilageValue ? "text-red-600 dark:text-red-400" : ""}
            />
            <Stat
              label="Sold before expiry"
              value={formatPercent(inv?.sellThroughRate)}
              hint="Share of past hotel nights that were sold before the date passed."
              days={days}
              loading={isLoading}
            />
          </div>
        </section>

        {canOrders ? (
          <section>
            <SectionTitle>Queues</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {Object.entries(queues ?? {}).map(([queue, count]) => (
                <Link
                  key={queue}
                  href={`/bookings?queue=${queue}`}
                  className="rounded-md border bg-background px-3 py-1.5 text-sm capitalize hover:bg-muted"
                >
                  {queue.replace(/-/g, " ")}{" "}
                  <span className="font-semibold tabular-nums">{count}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Data as of {formatDateTime(data?.dataAsOf)} · figures in {c}
        </p>
      </div>
      )}
    </AdminLayout>
  );
}
