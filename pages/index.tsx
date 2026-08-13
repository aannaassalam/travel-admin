import { getDashboard, getQueueCounts } from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDateTime,
  formatMoney,
  formatPercent
} from "@/lib/functions/format.lib";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  Clock,
  CreditCard,
  FileWarning,
  PackageX
} from "lucide-react";
import Link from "next/link";

/**
 * Dashboard per guide §4.
 *
 * Not "earnings, sales, revenue" — in a pre-purchased-inventory business those
 * hide what determines profitability. §4.1: the two metrics a naive build omits
 * are spoilage and at-risk inventory, and a month with strong revenue and 30%
 * spoilage is a losing month.
 */
export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", 30],
    queryFn: () => getDashboard(30)
  });
  const { data: queues } = useQuery({
    queryKey: ["queue-counts"],
    queryFn: getQueueCounts
  });

  const c = data?.currency ?? "USD";
  const h = data?.headline;
  const inv = data?.inventory;
  const a = data?.actions;

  const kpis = [
    { label: "Net revenue", value: formatMoney(h?.netRevenue, c), hint: "GMV minus cancellations and payment exceptions." },
    { label: "Gross margin", value: formatMoney(h?.grossMargin, c), hint: "Net revenue minus cost of inventory sold." },
    { label: "Margin %", value: formatPercent(h?.marginPercent), hint: "Gross margin ÷ net revenue." },
    { label: "Orders", value: h?.orders ?? "—", hint: "Paid orders in the period." },
    { label: "Conversion rate", value: formatPercent(h?.conversionRate), hint: "Needs the public site's search sessions — not live yet." },
    { label: "Cash outstanding", value: formatMoney(h?.cashOutstanding, c), hint: "Unpaid cash orders not yet collected." }
  ];

  /** §4.1: the tiles that reveal a losing month behind good revenue. */
  const capital = [
    { label: "At-risk inventory", value: formatMoney(inv?.atRiskValue, c), hint: `Unsold units expiring within ${inv?.atRiskWindowDays ?? 7} days, at cost.`, tone: "text-red-600 dark:text-red-400" },
    { label: "Spoilage / dead stock", value: formatMoney(inv?.spoilageValue, c), hint: "Cost of units that expired unsold — money lost.", tone: "text-red-600 dark:text-red-400" },
    { label: "Sell-through rate", value: formatPercent(inv?.sellThroughRate), hint: "Units sold ÷ purchased, for closed windows.", tone: "" }
  ];

  const actions = [
    { key: "atRiskInventory", label: "At-risk inventory", hint: "Unsold units expiring soon.", icon: PackageX, tone: "text-red-600 dark:text-red-400", href: "/inventory" },
    { key: "cashExpiring24h", label: "Cash orders expiring in 24h", hint: "Chase list with phone numbers.", icon: Clock, tone: "text-amber-600 dark:text-amber-400", href: "/bookings?queue=cash-pending" },
    { key: "enquiriesPastSla", label: "Unanswered enquiries past SLA", hint: "Enquiries with no first contact yet.", icon: FileWarning, tone: "text-amber-600 dark:text-amber-400", href: "/enquiries" },
    { key: "awaitingDocuments", label: "Orders awaiting documents", hint: "Paid but no e-ticket or voucher.", icon: Banknote, tone: "text-yellow-600 dark:text-yellow-500", href: "/bookings?queue=needs-action" },
    { key: "failedPayments24h", label: "Failed payments (24h)", hint: "Recoverable revenue.", icon: CreditCard, tone: "text-yellow-600 dark:text-yellow-500", href: "/bookings?queue=needs-action" },
    { key: "reversedPayments", label: "Reversed payments", hint: "Money the provider took back.", icon: AlertTriangle, tone: "text-red-600 dark:text-red-400", href: "/payments" }
  ];

  return (
    <AdminLayout
      title="Dashboard"
      description="Sell-through, margin and capital exposure — not just revenue"
    >
      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Headline · last 30 days</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {kpis.map(({ label, value, hint }) => (
              <Card key={label} className="gap-0 p-4" title={hint}>
                <p className="text-xs text-muted-foreground">{label}</p>
                {isLoading ? (
                  <Skeleton className="mt-2 h-7 w-24" />
                ) : (
                  <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
                )}
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Capital exposure
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {capital.map(({ label, value, hint, tone }) => (
              <Card key={label} className="gap-0 p-4" title={hint}>
                <p className="text-xs text-muted-foreground">{label}</p>
                {isLoading ? (
                  <Skeleton className="mt-2 h-7 w-28" />
                ) : (
                  <p className={`mt-2 text-xl font-semibold tabular-nums ${tone}`}>
                    {value}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Needs attention
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {actions.map(({ key, label, hint, icon: Icon, tone, href }) => {
              const count = a?.[key] ?? 0;
              return (
                <Link key={key} href={href}>
                  <Card className="h-full gap-0 p-4 transition-colors hover:bg-muted/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                      </div>
                      <Icon className={`size-4 shrink-0 ${count ? tone : "text-muted-foreground/40"}`} />
                    </div>
                    {isLoading ? (
                      <Skeleton className="mt-3 h-6 w-10" />
                    ) : (
                      <p
                        className={`mt-3 text-xl font-semibold tabular-nums ${
                          count ? tone : "text-muted-foreground/40"
                        }`}
                      >
                        {count}
                      </p>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Queues</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(queues ?? {}).map(([queue, count]) => (
              <Link
                key={queue}
                href={`/bookings?queue=${queue}`}
                className="rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
              >
                {queue.replace(/-/g, " ")}{" "}
                <span className="font-semibold tabular-nums">{count}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* §4.3: silent staleness destroys trust faster than visible lag. */}
        <p className="text-xs text-muted-foreground">
          Data as of {formatDateTime(data?.dataAsOf)} · figures in {c} base.
          Computed live from current data; this will move to overnight totals once
          volume makes the query cost noticeable.
        </p>
      </div>
    </AdminLayout>
  );
}
