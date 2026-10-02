import {
  getEnquirySummary,
  listEnquiries,
  setEnquiryStage,
  type Enquiry,
  type EnquiryPage
} from "@/api/functions/admin.api";
import EnquiryDialog, {
  type StageMove
} from "@/components/Enquiries/EnquiryDialog";
import {
  KIND_LABELS,
  NEXT_STAGE,
  STAGES,
  STAGE_LABELS,
  STAGE_STYLES,
  aboutLine,
  byUrgency,
  lossLabel,
  telHref,
  timeLine,
  waHref
} from "@/components/Enquiries/enquiry.lib";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOptimisticMutation } from "@/hooks/useOptimisticMutation";
import { useDebounce } from "@/hooks/utils/useDebounce";
import { formatDate, formatMoney } from "@/lib/functions/format.lib";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData
} from "@tanstack/react-query";
import {
  ArrowRight,
  LayoutGrid,
  List,
  MessageCircle,
  Phone,
  Search
} from "lucide-react";
import { useMemo, useState } from "react";

/**
 * §7: a small CRM, not a contact-form inbox. Property is enquiry-driven and
 * request-to-book is the recovery path for thin inventory — together a
 * meaningful share of revenue.
 *
 * §15 lists "no SLA or escalation on enquiries — leads simply go cold" as a
 * thing to avoid, so the overdue state is the loudest thing on the screen.
 */

type Pages = InfiniteData<EnquiryPage>;

const TIME_TONE = {
  overdue: "font-medium text-red-700 dark:text-red-400",
  soon: "font-medium text-amber-700 dark:text-amber-400",
  ok: "text-muted-foreground"
};

export default function EnquiriesPage() {
  const { can } = useCan();
  // Moving a stage needs enquiries:write; without it the board is read-only.
  const canWrite = can("enquiries:write");
  const isMobile = useIsMobile();

  const [search, setSearch] = useState("");
  const q = useDebounce(search.trim(), 300);
  const [kind, setKind] = useState("ALL");
  const [overdue, setOverdue] = useState(false);
  const [view, setView] = useState<"board" | "list">("board");
  const [selected, setSelected] = useState<Enquiry | null>(null);
  const [openLost, setOpenLost] = useState(false);
  const listView = isMobile || view === "list";

  const params: Record<string, string> = { limit: "100" };
  if (q) params.q = q;
  if (kind !== "ALL") params.kind = kind;
  if (overdue) params.overdue = "1";
  const queryKey = ["enquiries", params];

  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
      queryKey,
      queryFn: ({ pageParam }) =>
        listEnquiries(pageParam ? { ...params, cursor: pageParam } : params),
      initialPageParam: "",
      getNextPageParam: (last) => last.nextCursor ?? undefined
    });
  const { data: summary } = useQuery({
    queryKey: ["enquiries-summary"],
    queryFn: getEnquirySummary
  });

  const items = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.items),
    [data]
  );
  const slaHours = data?.pages[0]?.slaHours ?? summary?.slaHours ?? 4;

  /**
   * Moving a stage is a pipeline drag: the operator does several in a row while
   * working a list, so waiting for a round trip on each one is the difference
   * between working the queue and watching it. The new stage is exactly what
   * was clicked, so it can be shown at once and rolled back if refused.
   */
  const { mutate: move } = useOptimisticMutation<unknown, StageMove, Pages>({
    mutationFn: ({ id, ...body }) => setEnquiryStage(id, body),
    queryKey,
    apply: (previous, { id, stage, lossReason }) =>
      previous && {
        ...previous,
        pages: previous.pages.map((p) => ({
          ...p,
          items: p.items.map((e) =>
            e.id === id
              ? {
                  ...e,
                  stage,
                  lossReason: lossReason ?? e.lossReason,
                  // Moving off NEW is first contact; the clock stops.
                  firstContactAt:
                    stage === "NEW"
                      ? e.firstContactAt
                      : (e.firstContactAt ?? new Date().toISOString()),
                  slaBreached: stage === "NEW" ? e.slaBreached : false
                }
              : e
          )
        }))
      },
    successMessage: "Enquiry updated",
    errorMessage: "Could not move that enquiry"
  });

  const open = (e: Enquiry, lost = false) => {
    setOpenLost(lost);
    setSelected(e);
  };

  const byStage = (stage: string) =>
    items.filter((e) => e.stage === stage).sort(byUrgency);

  const loadMore = hasNextPage ? (
    <div className="flex justify-center">
      <Button
        variant="outline"
        size="sm"
        disabled={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      >
        {isFetchingNextPage ? "Loading…" : "Load more"}
      </Button>
    </div>
  ) : null;

  return (
    <AdminLayout
      title="Enquiries"
      description={`Property enquiries and requests to book. Reply to every new enquiry within ${slaHours}h — the clock stops at the first call or stage move.`}
    >
      <div className="flex flex-col gap-4">
        {/* Header strip: the pipeline at a glance. */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {STAGES.map((s) => (
            <span
              key={s}
              className={cn(
                "rounded-full px-2.5 py-1 tabular-nums",
                STAGE_STYLES[s]
              )}
            >
              {STAGE_LABELS[s]} {summary?.byStage[s] ?? "–"}
            </span>
          ))}
          <span
            className={cn(
              "rounded-full px-2.5 py-1 font-medium tabular-nums",
              summary?.overdue
                ? "bg-red-600 text-white dark:bg-red-700"
                : "bg-muted text-muted-foreground"
            )}
          >
            {summary?.overdue ?? "–"} overdue
          </span>
          <span className="ml-auto text-muted-foreground">
            Won last 30 days:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {summary?.wonLast30d.count ?? "–"}
            </span>
            {summary?.wonLast30d.value ? (
              <span className="tabular-nums">
                {" "}
                · {formatMoney(summary.wonLast30d.value)}
              </span>
            ) : null}
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone or reference…"
              className="pl-9"
            />
          </div>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-[160px]" aria-label="Kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All kinds</SelectItem>
              <SelectItem value="PROPERTY">Property</SelectItem>
              <SelectItem value="REQUEST_TO_BOOK">Request to book</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={overdue} onCheckedChange={setOverdue} />
            Overdue only
          </label>
          {!isMobile ? (
            <div className="ml-auto flex rounded-md border p-0.5">
              {(
                [
                  ["board", LayoutGrid, "Board"],
                  ["list", List, "List"]
                ] as const
              ).map(([key, Icon, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs",
                    view === key
                      ? "bg-foreground text-background font-medium"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : listView ? (
          <div className="overflow-x-auto rounded-lg border bg-background">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>About</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Waiting</TableHead>
                  <TableHead className="text-right">Quoted</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!items.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {q || overdue || kind !== "ALL"
                        ? "No enquiries match."
                        : "No enquiries yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  [...items].sort(byUrgency).map((e) => {
                    const time = timeLine(e);
                    return (
                      <TableRow
                        key={e.id}
                        className="cursor-pointer"
                        onClick={() => open(e)}
                      >
                        <TableCell className="font-mono text-xs">
                          {e.reference}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{e.customerName}</div>
                          <div className="text-xs text-muted-foreground">
                            {e.phone}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate">
                          {aboutLine(e)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {KIND_LABELS[e.kind] ?? e.kind}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={STAGE_STYLES[e.stage]}
                          >
                            {STAGE_LABELS[e.stage] ?? e.stage}
                          </Badge>
                          {e.lossReason ? (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {lossLabel(e.lossReason)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell
                          className={cn("text-xs", TIME_TONE[time.tone])}
                        >
                          {time.text}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {e.quotedAmount ? formatMoney(e.quotedAmount) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(e.createdAt)}
                        </TableCell>
                        <TableCell onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex gap-1">
                            <a href={telHref(e.phone)} aria-label="Call">
                              <Button
                                variant="outline"
                                size="icon"
                                className="size-7"
                              >
                                <Phone className="size-3.5" />
                              </Button>
                            </a>
                            <a
                              href={waHref(e.phone)}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="WhatsApp"
                            >
                              <Button
                                variant="outline"
                                size="icon"
                                className="size-7"
                              >
                                <MessageCircle className="size-3.5" />
                              </Button>
                            </a>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => open(e)}
                            >
                              Open
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          /* Pipeline board — NEW → CONTACTED → QUALIFIED → QUOTED → WON | LOST */
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-3">
              {STAGES.map((stage) => {
                const column = byStage(stage);
                return (
                  <div key={stage} className="w-[272px] shrink-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          STAGE_STYLES[stage]
                        )}
                      >
                        {STAGE_LABELS[stage]}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {column.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {!column.length ? (
                        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                          Empty
                        </div>
                      ) : (
                        column.map((e) => {
                          const time = timeLine(e);
                          return (
                            <Card
                              key={e.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => open(e)}
                              onKeyDown={(ev) => ev.key === "Enter" && open(e)}
                              className={cn(
                                "cursor-pointer gap-0 p-3 transition-colors hover:border-foreground/30",
                                // §13: never colour alone — the time line says it too.
                                e.slaBreached &&
                                  "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="truncate text-sm font-medium">
                                  {e.customerName}
                                </p>
                                <Badge
                                  variant="outline"
                                  className="shrink-0 text-[10px]"
                                >
                                  {KIND_LABELS[e.kind] ?? e.kind}
                                </Badge>
                              </div>
                              <p className="mt-0.5 truncate text-xs">
                                {aboutLine(e)}
                              </p>
                              {e.message ? (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {e.message}
                                </p>
                              ) : null}
                              {e.quotedAmount ? (
                                <p className="mt-1 text-xs font-medium tabular-nums">
                                  Quoted {formatMoney(e.quotedAmount)}
                                </p>
                              ) : null}
                              {e.lossReason ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {lossLabel(e.lossReason)}
                                </p>
                              ) : null}
                              <p
                                className={cn(
                                  "mt-2 text-[11px]",
                                  TIME_TONE[time.tone]
                                )}
                              >
                                {time.text}
                              </p>

                              <div
                                className="mt-2 flex flex-wrap gap-1"
                                onClick={(ev) => ev.stopPropagation()}
                              >
                                <a href={telHref(e.phone)}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-[11px]"
                                  >
                                    <Phone className="size-3" />
                                    Call
                                  </Button>
                                </a>
                                <a
                                  href={waHref(e.phone)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-[11px]"
                                  >
                                    <MessageCircle className="size-3" />
                                    WhatsApp
                                  </Button>
                                </a>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => open(e)}
                                >
                                  Open
                                </Button>
                              </div>

                              {canWrite && NEXT_STAGE[stage] ? (
                                <div
                                  className="mt-2 flex gap-1"
                                  onClick={(ev) => ev.stopPropagation()}
                                >
                                  <Button
                                    size="sm"
                                    className="h-7 flex-1 gap-1 text-[11px]"
                                    onClick={() =>
                                      move({
                                        id: e.id,
                                        stage: NEXT_STAGE[stage]
                                      })
                                    }
                                  >
                                    {STAGE_LABELS[NEXT_STAGE[stage]]}
                                    <ArrowRight className="size-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-[11px]"
                                    onClick={() => open(e, true)}
                                  >
                                    Lost
                                  </Button>
                                </div>
                              ) : null}
                            </Card>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loadMore}

        <p className="text-xs text-muted-foreground">
          Quote → payment link is not built yet: it needs the same mandatory
          no-refund consent capture as normal checkout, and a quote-generated
          order without consent evidence would be the weakest link in the whole
          dispute-defence chain.
        </p>
      </div>

      <EnquiryDialog
        enquiry={selected}
        canWrite={canWrite}
        openLost={openLost}
        onClose={() => setSelected(null)}
        onMove={move}
        onUpdated={setSelected}
      />
    </AdminLayout>
  );
}
