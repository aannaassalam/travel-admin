import {
  AuditLogRow,
  getAuditLogSummary,
  listAuditLogs
} from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/utils/useDebounce";
import { formatDateTime, relativeTime } from "@/lib/functions/format.lib";
import { canOpenRoute, useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Lock, Search } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";

/**
 * §14.6: the audit log is immutable and append-only, and is NOT editable or
 * deletable from the UI under any circumstance — including by the super
 * administrator. There are deliberately no actions on this screen: with a
 * single account it is the only mechanism that can distinguish the owner's
 * actions from an attacker using the owner's session.
 */

type Category = "Sign-in" | "Access" | "Data" | "Sensitive" | "System";

const ACTIONS: Record<string, { label: string; category: Category }> = {
  LOGIN_SUCCESS: { label: "Signed in", category: "Sign-in" },
  LOGIN_FAILED: { label: "Failed sign-in", category: "Sign-in" },
  LOGOUT: { label: "Signed out", category: "Sign-in" },
  STEP_UP_SUCCESS: { label: "Password re-confirmed", category: "Sign-in" },
  STEP_UP_FAILED: {
    label: "Password re-confirmation failed",
    category: "Sign-in"
  },
  SESSIONS_REVOKED: { label: "Other devices signed out", category: "Access" },
  PASSWORD_CHANGED: { label: "Password changed", category: "Access" },
  ADMIN_ACCESS_CHANGED: { label: "Access changed", category: "Access" },
  BREAK_GLASS_ENABLED: {
    label: "Emergency access enabled",
    category: "Access"
  },
  CREATE: { label: "Created", category: "Data" },
  UPDATE: { label: "Updated", category: "Data" },
  DELETE: { label: "Archived", category: "Data" },
  PASSPORT_UNMASKED: { label: "Passport revealed", category: "Sensitive" },
  CUSTOMER_EXPORTED: { label: "Customers exported", category: "Sensitive" },
  FINANCIAL_EXPORTED: { label: "Financials exported", category: "Sensitive" },
  CASH_HOLDS_RELEASED: {
    label: "Expired cash holds released",
    category: "System"
  },
  CASH_REMINDERS_SENT: { label: "Cash reminders sent", category: "System" },
  PASSPORT_DATA_PURGED: {
    label: "Old passport data purged",
    category: "System"
  },
  INVENTORY_DRIFT_DETECTED: {
    label: "Inventory mismatch detected",
    category: "System"
  }
};

const RISKY = new Set([
  "LOGIN_FAILED",
  "STEP_UP_FAILED",
  "PASSPORT_UNMASKED",
  "CUSTOMER_EXPORTED",
  "FINANCIAL_EXPORTED",
  "BREAK_GLASS_ENABLED",
  "SESSIONS_REVOKED",
  "ADMIN_ACCESS_CHANGED",
  "PASSWORD_CHANGED"
]);

const CATEGORY_STYLES: Record<Category, string> = {
  "Sign-in": "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
  Access:
    "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-300",
  Data: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
  Sensitive:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  System:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
};

const titleCase = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

const describe = (action: string, actor: string) =>
  ACTIONS[action] ?? {
    label: titleCase(action),
    category: (actor === "system" ? "System" : "Data") as Category
  };

/** Where "On" links to. Pattern is the Next route (for canOpenRoute). */
const ENTITY_ROUTES: Record<
  string,
  { pattern: string; href: (id: string) => string }
> = {
  Order: { pattern: "/bookings/[id]", href: (id) => `/bookings/${id}` },
  Customer: { pattern: "/customers/[id]", href: (id) => `/customers/${id}` },
  Hotel: { pattern: "/inventory/[id]", href: (id) => `/inventory/${id}` },
  Listing: {
    pattern: "/inventory/listing/[id]",
    href: (id) => `/inventory/listing/${id}`
  },
  Restaurant: {
    pattern: "/inventory/restaurant/[id]",
    href: (id) => `/inventory/restaurant/${id}`
  },
  AdminUser: { pattern: "/users", href: () => "/users" },
  AccessRole: { pattern: "/roles", href: () => "/roles" },
  Settings: { pattern: "/settings", href: () => "/settings" },
  NotificationTemplate: {
    pattern: "/notifications",
    href: () => "/notifications"
  },
  PolicyVersion: { pattern: "/content", href: () => "/content" },
  Location: { pattern: "/locations", href: () => "/locations" },
  ServicedRoute: { pattern: "/locations", href: () => "/locations" },
  Enquiry: { pattern: "/enquiries", href: () => "/enquiries" }
};

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const EMPTY = {
  q: "",
  action: "",
  entityType: "",
  actorEmail: "",
  from: "",
  to: "",
  risky: false
};
type Filters = typeof EMPTY;

const PAGE = 50;

export default function AuditLogPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const q = useDebounce(filters.q, 300);
  const { admin } = useCan();

  const set = (patch: Partial<Filters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  const { data: summary } = useQuery({
    queryKey: ["audit-logs", "summary"],
    queryFn: getAuditLogSummary
  });

  const params: Record<string, string> = { limit: String(PAGE) };
  if (q.trim()) params.q = q.trim();
  if (filters.action) params.action = filters.action;
  if (filters.entityType) params.entityType = filters.entityType;
  if (filters.actorEmail) params.actorEmail = filters.actorEmail;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.risky) params.risky = "1";

  const logs = useInfiniteQuery({
    queryKey: ["audit-logs", params],
    queryFn: ({ pageParam }) =>
      listAuditLogs(pageParam ? { ...params, cursor: pageParam } : params),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined
  });
  const rows = logs.data?.pages.flatMap((p) => p.items) ?? [];
  const dirty = JSON.stringify(filters) !== JSON.stringify(EMPTY);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cards = [
    {
      label: "Failed sign-ins",
      window: "24h",
      value: summary?.failedLogins24h,
      filter: { action: "LOGIN_FAILED", from: daysAgo(1) }
    },
    {
      label: "Password re-confirmation failures",
      window: "7d",
      value: summary?.stepUpFailed7d,
      filter: { action: "STEP_UP_FAILED", from: daysAgo(7) }
    },
    {
      label: "Data exports",
      window: "30d",
      value: summary?.exports30d,
      filter: { q: "EXPORTED", from: daysAgo(30) }
    },
    {
      label: "Passport reveals",
      window: "30d",
      value: summary?.passportUnmasked30d,
      filter: { action: "PASSPORT_UNMASKED", from: daysAgo(30) }
    }
  ];

  const selectClass =
    "h-9 rounded-md border bg-transparent px-2 text-sm min-w-0";

  return (
    <AdminLayout
      title="Audit log"
      description="Who did what, when, and from where. Append-only."
    >
      <div className="flex flex-col gap-4">
        {summary && !summary.alertChannelConfigured ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Out-of-band alert email is not set, so security alerts only reach
              the server log. Set <code>ADMIN_ALERT_EMAIL</code> on the server
              to receive them.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map((c) => {
            const active =
              (c.filter.action && filters.action === c.filter.action) ||
              (c.filter.q && filters.q === c.filter.q);
            return (
              <button
                key={c.label}
                type="button"
                onClick={() =>
                  setFilters(active ? EMPTY : { ...EMPTY, ...c.filter })
                }
                className="text-left"
                title="Click to filter the list"
              >
                <Card
                  className={cn(
                    "h-full gap-0 p-4 transition-colors hover:bg-muted/50",
                    active && "border-foreground"
                  )}
                >
                  <p className="text-xs text-muted-foreground">
                    {c.label} <span className="opacity-70">({c.window})</span>
                  </p>
                  {c.value === undefined ? (
                    <Skeleton className="mt-2 h-7 w-12" />
                  ) : (
                    <p
                      className={cn(
                        "mt-2 text-xl font-semibold tabular-nums",
                        c.value > 0 && "text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {c.value}
                    </p>
                  )}
                </Card>
              </button>
            );
          })}
          <Card className="gap-0 p-4 sm:col-span-2 lg:col-span-1">
            <p className="text-xs text-muted-foreground">Last failed sign-in</p>
            {summary === undefined ? (
              <Skeleton className="mt-2 h-7 w-32" />
            ) : summary.lastFailedLogin ? (
              <div className="mt-2 text-sm">
                <p className="truncate font-medium">
                  {summary.lastFailedLogin.actorEmail}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">
                    {summary.lastFailedLogin.ip}
                  </span>
                  {" · "}
                  {relativeTime(summary.lastFailedLogin.createdAt)}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">None</p>
            )}
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Search who, what, record id, reason…"
              className="pl-9"
            />
          </div>
          <select
            aria-label="Action"
            value={filters.action}
            onChange={(e) => set({ action: e.target.value })}
            className={selectClass}
          >
            <option value="">All actions</option>
            {summary?.actions.map((a) => (
              <option key={a} value={a}>
                {describe(a, "").label}
              </option>
            ))}
          </select>
          <select
            aria-label="Entity type"
            value={filters.entityType}
            onChange={(e) => set({ entityType: e.target.value })}
            className={selectClass}
          >
            <option value="">All records</option>
            {summary?.entityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            aria-label="Actor"
            value={filters.actorEmail}
            onChange={(e) => set({ actorEmail: e.target.value })}
            className={cn(selectClass, "max-w-[200px]")}
          >
            <option value="">Anyone</option>
            {summary?.actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="From"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => set({ from: e.target.value })}
            className={selectClass}
          />
          <input
            type="date"
            aria-label="To"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => set({ to: e.target.value })}
            className={selectClass}
          />
          <label className="flex h-9 items-center gap-2 text-sm">
            <Switch
              checked={filters.risky}
              onCheckedChange={(v) => set({ risky: v })}
            />
            Risky only
          </label>
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}>
              Clear
            </Button>
          ) : null}
        </div>

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>When</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>On</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-muted-foreground"
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              ) : logs.isError ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <QueryError onRetry={() => logs.refetch()} />
                  </TableCell>
                </TableRow>
              ) : !rows.length ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No entries match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((l) => (
                  <Fragment key={l.id}>
                    <LogRow
                      row={l}
                      open={expanded.has(l.id)}
                      onToggle={() => toggle(l.id)}
                      permissions={admin?.permissions}
                    />
                    {expanded.has(l.id) ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={7}
                          className="bg-muted/30 px-4 py-3"
                        >
                          <Changes row={l} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {rows.length} {rows.length === 1 ? "entry" : "entries"}
            {logs.hasNextPage ? " (more available)" : ""}
          </span>
          {logs.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              disabled={logs.isFetchingNextPage}
              onClick={() => logs.fetchNextPage()}
            >
              {logs.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          <p>
            This log cannot be edited or deleted from anywhere in the panel,
            including by you: the database refuses it. Retained a minimum of two
            years. Copying it to append-only external storage is not yet
            configured.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}

function LogRow({
  row: l,
  open,
  onToggle,
  permissions
}: {
  row: AuditLogRow;
  open: boolean;
  onToggle: () => void;
  permissions?: string[];
}) {
  const what = describe(l.action, l.actorEmail);
  const route = l.entityType ? ENTITY_ROUTES[l.entityType] : undefined;
  const linkable =
    route && l.entityId && canOpenRoute(permissions, route.pattern);
  const rowsExported = (l.after as { rows?: number } | undefined)?.rows;
  const details =
    l.reason ||
    (typeof rowsExported === "number" ? `${rowsExported} rows` : "");

  return (
    <TableRow
      className={cn(
        RISKY.has(l.action) && "bg-amber-50/60 dark:bg-amber-950/30"
      )}
    >
      <TableCell className="px-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label="Show details"
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <ChevronRight
            className={cn("size-4 transition-transform", open && "rotate-90")}
          />
        </button>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="text-xs">{formatDateTime(l.createdAt)}</div>
        <div className="text-[11px] text-muted-foreground">
          {relativeTime(l.createdAt)}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span title={l.action} className="text-sm">
          {what.label}
        </span>
        <Badge
          variant="secondary"
          className={cn("ml-2 text-[10px]", CATEGORY_STYLES[what.category])}
        >
          {what.category}
        </Badge>
      </TableCell>
      <TableCell
        className={cn(
          "max-w-[200px] truncate text-sm",
          l.actorEmail === "system" && "italic text-muted-foreground"
        )}
        title={l.actorEmail}
      >
        {l.actorEmail}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {l.entityType ? (
          <>
            <span>{l.entityType}</span>
            {l.entityId ? (
              linkable ? (
                <Link
                  href={route.href(l.entityId)}
                  className="ml-1 font-mono text-muted-foreground hover:underline"
                  title={l.entityId}
                >
                  …{l.entityId.slice(-6)}
                </Link>
              ) : (
                <span
                  className="ml-1 font-mono text-muted-foreground"
                  title={l.entityId}
                >
                  …{l.entityId.slice(-6)}
                </span>
              )
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell
        className="max-w-[260px] truncate text-xs text-muted-foreground"
        title={details}
      >
        {details || "—"}
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {l.ip}
      </TableCell>
    </TableRow>
  );
}

const Value = ({ v }: { v: unknown }) => {
  if (v === undefined || v === null || v === "")
    return <span className="text-muted-foreground">—</span>;
  if (typeof v === "object")
    return (
      <pre className="max-h-40 max-w-[360px] overflow-auto rounded bg-muted px-2 py-1 text-[11px]">
        {JSON.stringify(v, null, 2)}
      </pre>
    );
  const s = String(v);
  return (
    <span className="break-words" title={s.length > 120 ? s : undefined}>
      {s.length > 120 ? `${s.slice(0, 120)}…` : s}
    </span>
  );
};

function Changes({ row: l }: { row: AuditLogRow }) {
  const keys = Array.from(
    new Set([...Object.keys(l.before ?? {}), ...Object.keys(l.after ?? {})])
  );
  return (
    <div className="flex flex-col gap-3 text-xs">
      {keys.length ? (
        <div className="overflow-x-auto">
          <table className="w-full max-w-3xl text-left">
            <thead className="text-muted-foreground">
              <tr>
                <th className="w-40 pb-1 pr-3 font-medium">Field</th>
                <th className="pb-1 pr-3 font-medium">Before</th>
                <th className="pb-1 font-medium">After</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {keys.map((k) => (
                <tr key={k} className="border-t">
                  <td className="py-1 pr-3 font-mono">{k}</td>
                  <td className="py-1 pr-3">
                    <Value v={l.before?.[k]} />
                  </td>
                  <td className="py-1">
                    <Value v={l.after?.[k]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground">No field changes recorded.</p>
      )}
      {l.reason ? (
        <p>
          <span className="text-muted-foreground">Reason: </span>
          {l.reason}
        </p>
      ) : null}
      {l.userAgent ? (
        <p className="break-all text-muted-foreground">
          <span>Device: </span>
          {l.userAgent}
        </p>
      ) : null}
    </div>
  );
}
