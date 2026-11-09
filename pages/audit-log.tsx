import {
  AuditLogRow,
  getAuditLogSummary,
  listAuditLogs
} from "@/api/functions/admin.api";
import DateRangeFilter from "@/components/DateRangeFilter";
import { OptionSelect } from "@/components/Form/OptionSelect";
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
import Pager, { PAGE_SIZE, usePage } from "@/components/Pager";
import SortHead, {
  SortButton,
  sortRows,
  sortState,
  type Sort
} from "@/components/SortHead";
import { useDebounce } from "@/hooks/utils/useDebounce";
import { formatDateTime, relativeTime } from "@/lib/functions/format.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { canOpenRoute, useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
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

/** The action codes as stored; each label is a key, shown in the panel's language. */
const ACTIONS: Record<string, { label: TranslationKey; category: Category }> = {
  LOGIN_SUCCESS: { label: "sys.audit.act.LOGIN_SUCCESS", category: "Sign-in" },
  LOGIN_FAILED: { label: "sys.audit.act.LOGIN_FAILED", category: "Sign-in" },
  LOGOUT: { label: "sys.audit.act.LOGOUT", category: "Sign-in" },
  STEP_UP_SUCCESS: { label: "sys.audit.act.STEP_UP_SUCCESS", category: "Sign-in" },
  STEP_UP_FAILED: {
    label: "sys.audit.act.STEP_UP_FAILED",
    category: "Sign-in"
  },
  SESSIONS_REVOKED: { label: "sys.audit.act.SESSIONS_REVOKED", category: "Access" },
  PASSWORD_CHANGED: { label: "sys.audit.act.PASSWORD_CHANGED", category: "Access" },
  ADMIN_ACCESS_CHANGED: { label: "sys.audit.act.ADMIN_ACCESS_CHANGED", category: "Access" },
  BREAK_GLASS_ENABLED: {
    label: "sys.audit.act.BREAK_GLASS_ENABLED",
    category: "Access"
  },
  CREATE: { label: "sys.audit.act.CREATE", category: "Data" },
  UPDATE: { label: "sys.audit.act.UPDATE", category: "Data" },
  DELETE: { label: "sys.audit.act.DELETE", category: "Data" },
  PURGE: { label: "sys.audit.act.PURGE", category: "Data" },
  PASSPORT_UNMASKED: { label: "sys.audit.act.PASSPORT_UNMASKED", category: "Sensitive" },
  CUSTOMER_EXPORTED: { label: "sys.audit.act.CUSTOMER_EXPORTED", category: "Sensitive" },
  FINANCIAL_EXPORTED: { label: "sys.audit.act.FINANCIAL_EXPORTED", category: "Sensitive" },
  CASH_HOLDS_RELEASED: {
    label: "sys.audit.act.CASH_HOLDS_RELEASED",
    category: "System"
  },
  CASH_REMINDERS_SENT: { label: "sys.audit.act.CASH_REMINDERS_SENT", category: "System" },
  PASSPORT_DATA_PURGED: {
    label: "sys.audit.act.PASSPORT_DATA_PURGED",
    category: "System"
  },
  INVENTORY_DRIFT_DETECTED: {
    label: "sys.audit.act.INVENTORY_DRIFT_DETECTED",
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
  "PASSWORD_CHANGED",
  "PURGE"
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

const CATEGORY_LABEL: Record<Category, TranslationKey> = {
  "Sign-in": "sys.audit.cat.signIn",
  Access: "sys.audit.cat.access",
  Data: "sys.audit.cat.data",
  Sensitive: "sys.audit.cat.sensitive",
  System: "sys.audit.cat.system"
};

type T = ReturnType<typeof useT>["t"];

const titleCase = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

/** An unknown code is shown as itself, made readable. */
const describe = (t: T, action: string, actor: string) => {
  const known = ACTIONS[action];
  return known
    ? { label: t(known.label), category: known.category }
    : {
        label: titleCase(action),
        category: (actor === "system" ? "System" : "Data") as Category
      };
};

/** Where "On" links to. Pattern is the Next route (for canOpenRoute). */
const ENTITY_ROUTES: Record<
  string,
  { pattern: string; href: (id: string) => string }
> = {
  Order: { pattern: "/bookings/[id]", href: (id) => `/bookings/${id}` },
  Customer: { pattern: "/customers/[id]", href: (id) => `/customers/${id}` },
  Hotel: { pattern: "/inventory/hotel/[id]", href: (id) => `/inventory/hotel/${id}` },
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
  SiteContent: { pattern: "/content", href: () => "/content" },
  Partner: { pattern: "/partners", href: () => "/partners" },
  Location: { pattern: "/locations", href: () => "/locations" },
  ServicedRoute: { pattern: "/locations", href: () => "/locations" },
  Enquiry: { pattern: "/enquiries", href: () => "/enquiries" },
  Review: { pattern: "/reviews", href: () => "/reviews" }
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

export default function AuditLogPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Newest first until a column heading is pressed.
  const [sort, setSort] = useState<Sort>("");
  const head = { sort, onSort: setSort };
  const q = useDebounce(filters.q, 300);
  const { admin } = useCan();
  const { t } = useT();

  const set = (patch: Partial<Filters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  const { data: summary } = useQuery({
    queryKey: ["audit-logs", "summary"],
    queryFn: getAuditLogSummary,
    refetchOnMount: "always"
  });

  const params: Record<string, string> = { limit: String(PAGE_SIZE) };
  if (q.trim()) params.q = q.trim();
  if (filters.action) params.action = filters.action;
  if (filters.entityType) params.entityType = filters.entityType;
  if (filters.actorEmail) params.actorEmail = filters.actorEmail;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.risky) params.risky = "1";
  if (sort) params.sort = sort;

  const [page, setPage] = usePage(JSON.stringify(params));
  const logs = useQuery({
    queryKey: ["audit-logs", params, page],
    queryFn: () => listAuditLogs({ ...params, page: String(page) }),
    // Everything done elsewhere in the panel since the last visit belongs here.
    refetchOnMount: "always",
    placeholderData: keepPreviousData
  });
  const rows = logs.data?.items ?? [];
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
      label: t("sys.audit.failedLogins"),
      window: t("sys.audit.win24h"),
      value: summary?.failedLogins24h,
      filter: { action: "LOGIN_FAILED", from: daysAgo(1) }
    },
    {
      label: t("sys.audit.stepUpFailed"),
      window: t("sys.audit.win7d"),
      value: summary?.stepUpFailed7d,
      filter: { action: "STEP_UP_FAILED", from: daysAgo(7) }
    },
    {
      label: t("sys.audit.exports"),
      window: t("sys.audit.win30d"),
      value: summary?.exports30d,
      filter: { q: "EXPORTED", from: daysAgo(30) }
    },
    {
      label: t("sys.audit.passportReveals"),
      window: t("sys.audit.win30d"),
      value: summary?.passportUnmasked30d,
      filter: { action: "PASSPORT_UNMASKED", from: daysAgo(30) }
    }
  ];

  const selectClass = "w-auto min-w-40";

  return (
    <AdminLayout
      title={t("audit.title")}
      description={t("sys.audit.description")}
    >
      <div className="flex flex-col gap-4">
        {summary && !summary.alertChannelConfigured ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              {t("sys.audit.noAlertBefore")} <code>ADMIN_ALERT_EMAIL</code>{" "}
              {t("sys.audit.noAlertAfter")}
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
                className="text-start"
                title={t("sys.audit.clickToFilter")}
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
            <p className="text-xs text-muted-foreground">{t("sys.audit.lastFailed")}</p>
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
              <p className="mt-2 text-sm text-muted-foreground">{t("sys.audit.none")}</p>
            )}
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder={t("sys.audit.search")}
              className="ps-9"
            />
          </div>
          <OptionSelect
            aria-label={t("sys.audit.action")}
            value={filters.action}
            onChange={(v) => set({ action: v })}
            className={selectClass}
            options={[
              { value: "", label: t("sys.audit.allActions") },
              ...(summary?.actions.map((a) => ({ value: a, label: describe(t, a, "").label })) ?? [])
            ]}
          />
          <OptionSelect
            aria-label={t("sys.audit.entityType")}
            value={filters.entityType}
            onChange={(v) => set({ entityType: v })}
            className={selectClass}
            options={[
              { value: "", label: t("sys.audit.allRecords") },
              // Record types are codes, shown as stored.
              ...(summary?.entityTypes.map((type) => ({ value: type, label: type })) ?? [])
            ]}
          />
          <OptionSelect
            aria-label={t("sys.audit.actor")}
            value={filters.actorEmail}
            onChange={(v) => set({ actorEmail: v })}
            className={cn(selectClass, "max-w-[200px]")}
            options={[
              { value: "", label: t("sys.audit.anyone") },
              ...(summary?.actors.map((a) => ({ value: a, label: a })) ?? [])
            ]}
          />
          <DateRangeFilter
            label={t("sys.audit.when")}
            from={filters.from}
            to={filters.to}
            onChange={(from, to) => set({ from, to })}
          />
          <label className="flex h-9 items-center gap-2 text-sm">
            <Switch
              checked={filters.risky}
              onCheckedChange={(v) => set({ risky: v })}
            />
            {t("sys.audit.riskyOnly")}
          </label>
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}>
              {t("sys.audit.clear")}
            </Button>
          ) : null}
        </div>

        <div
          // The rows of the order, page or search before stay up while the
          // next ones load — dimmed and out of reach, so they are not read as
          // the answer, nor pressed just as they change.
          aria-busy={logs.isPlaceholderData || undefined}
          className={cn(
            "rounded-lg border bg-background",
            logs.isPlaceholderData && "opacity-60"
          )}
        >
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="w-8" />
                <SortHead column="when" {...head}>
                  {t("sys.audit.when")}
                </SortHead>
                <SortHead column="what" {...head}>
                  {t("sys.audit.what")}
                </SortHead>
                <SortHead column="who" {...head}>
                  {t("sys.audit.who")}
                </SortHead>
                <SortHead column="on" {...head}>
                  {t("sys.audit.on")}
                </SortHead>
                <SortHead column="details" {...head}>
                  {t("sys.audit.details")}
                </SortHead>
                <SortHead column="ip" {...head}>
                  {t("sys.audit.ip")}
                </SortHead>
              </TableRow>
            </TableHeader>
            <TableBody inert={logs.isPlaceholderData || undefined}>
              {logs.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {t("common.loading")}
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
                    {t("sys.audit.noMatch")}
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

        <Pager
          page={page}
          total={logs.data?.total ?? 0}
          onPage={setPage}
          noun={t("sys.audit.noun")}
          plural={t("sys.audit.nouns")}
        />

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          <p>{t("sys.audit.immutableFooter")}</p>
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
  const { t } = useT();
  const what = describe(t, l.action, l.actorEmail);
  const route = l.entityType ? ENTITY_ROUTES[l.entityType] : undefined;
  const linkable =
    route && l.entityId && canOpenRoute(permissions, route.pattern);
  const rowsExported = (l.after as { rows?: number } | undefined)?.rows;
  const details =
    l.reason ||
    (typeof rowsExported === "number" ? t("sys.audit.rows", { n: rowsExported }) : "");

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
          aria-label={t("sys.audit.showDetails")}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <ChevronRight
            className={cn(
              "size-4 transition-transform",
              open ? "rotate-90" : "rtl:-scale-x-100"
            )}
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
          className={cn("ms-2 text-[10px]", CATEGORY_STYLES[what.category])}
        >
          {t(CATEGORY_LABEL[what.category])}
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
                  className="ms-1 font-mono text-muted-foreground hover:underline"
                  title={l.entityId}
                >
                  …{l.entityId.slice(-6)}
                </Link>
              ) : (
                <span
                  className="ms-1 font-mono text-muted-foreground"
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

/** A value as text, for ordering Before and After by what `Value` shows. */
const shown = (v: unknown) =>
  v === undefined || v === null
    ? ""
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);

function Changes({ row: l }: { row: AuditLogRow }) {
  // As recorded until a heading is pressed; each open row keeps its own order.
  const [sort, setSort] = useState<Sort>("");
  const head = { sort, onSort: setSort };
  const { t } = useT();
  const keys = sortRows(
    Array.from(
      new Set([...Object.keys(l.before ?? {}), ...Object.keys(l.after ?? {})])
    ),
    sort,
    {
      field: (k) => k,
      before: (k) => shown(l.before?.[k]),
      after: (k) => shown(l.after?.[k])
    }
  );
  return (
    <div className="flex flex-col gap-3 text-xs">
      {keys.length ? (
        <div className="overflow-x-auto">
          <table className="w-full max-w-3xl text-start">
            <thead className="text-muted-foreground">
              <tr>
                <th
                  aria-sort={sortState(sort, "field")}
                  className="w-40 pb-1 pe-3 font-medium"
                >
                  <SortButton column="field" {...head}>
                    {t("sys.audit.field")}
                  </SortButton>
                </th>
                <th
                  aria-sort={sortState(sort, "before")}
                  className="pb-1 pe-3 font-medium"
                >
                  <SortButton column="before" {...head}>
                    {t("sys.audit.before")}
                  </SortButton>
                </th>
                <th
                  aria-sort={sortState(sort, "after")}
                  className="pb-1 font-medium"
                >
                  <SortButton column="after" {...head}>
                    {t("sys.audit.after")}
                  </SortButton>
                </th>
              </tr>
            </thead>
            <tbody className="align-top">
              {keys.map((k) => (
                <tr key={k} className="border-t">
                  <td className="py-1 pe-3 font-mono">{k}</td>
                  <td className="py-1 pe-3">
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
        <p className="text-muted-foreground">{t("sys.audit.noChanges")}</p>
      )}
      {l.reason ? (
        <p>
          <span className="text-muted-foreground">{t("sys.audit.reason")}</span>
          {l.reason}
        </p>
      ) : null}
      {l.userAgent ? (
        <p className="break-all text-muted-foreground">
          <span>{t("sys.audit.device")}</span>
          {l.userAgent}
        </p>
      ) : null}
    </div>
  );
}
