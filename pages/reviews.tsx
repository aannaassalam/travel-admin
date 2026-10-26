import {
  approveReview,
  deleteReview,
  listReviews,
  rejectReview,
  type AdminReview
} from "@/api/functions/reviews.api";
import DeleteButton from "@/components/DeleteButton";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { PAGE_SIZE, usePage } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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
import { label, VERTICAL } from "@/lib/functions/labels.lib";
import { canOpenRoute, useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { BadgeCheck, Check, Search, Star, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Customer reviews. Nothing a customer writes is on the website until it is
 * approved here, and only approved reviews make an item's rating — so this
 * opens on the ones waiting.
 */

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected"
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
};

/** Where the item opens in this panel; the pattern decides who may follow it. */
const ITEM_ROUTE: Record<string, { pattern: string; href: (id: string) => string }> = {
  LISTING: { pattern: "/inventory/listing/[id]", href: (id) => `/inventory/listing/${id}` },
  HOTEL: { pattern: "/inventory/[id]", href: (id) => `/inventory/${id}` },
  RESTAURANT: { pattern: "/inventory/restaurant/[id]", href: (id) => `/inventory/restaurant/${id}` }
};

const message = (e: unknown, fallback: string) =>
  (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback;

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn("size-3.5", i <= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
        />
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const queryClient = useQueryClient();
  const { can, admin } = useCan();
  const canWrite = can("content:write");
  const showActions = canWrite || can("content:delete");

  // Waiting first: that is the work. "ALL" is every status.
  const [status, setStatus] = useState("PENDING");
  const [targetType, setTargetType] = useState("ALL");
  const [search, setSearch] = useState("");
  const q = useDebounce(search.trim(), 300);
  const filters = {
    status: status === "ALL" ? "" : status,
    targetType: targetType === "ALL" ? "" : targetType,
    q
  };
  const [page, setPage] = usePage(JSON.stringify(filters));

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["reviews", filters, page],
    queryFn: () => listReviews({ ...filters, page, limit: PAGE_SIZE }),
    // New reviews arrive from the website at any time.
    refetchOnMount: "always",
    placeholderData: keepPreviousData
  });
  const rows = data?.items ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reviews"] });

  const { mutate: moderate, isPending: moderating, variables } = useMutation({
    mutationFn: ({ review, to }: { review: AdminReview; to: "APPROVED" | "REJECTED" }) =>
      to === "APPROVED"
        ? approveReview(review.id, review.version)
        : rejectReview(review.id, review.version),
    meta: { showToast: false },
    onSuccess: (_r, { to }) => {
      toast.success(
        to === "APPROVED"
          ? "Approved — it is on the website and in the rating"
          : "Rejected — it stays off the website"
      );
      refresh();
    },
    // A 409: the customer rewrote it after this list loaded. The new words come up to be read.
    onError: (e) => {
      toast.error(
        (e as AxiosError).response?.status === 409
          ? "The customer changed this review since the list loaded. Read it again, then decide."
          : message(e, "Could not change it")
      );
      refresh();
    }
  });

  const narrowed = Boolean(q || targetType !== "ALL" || status !== "PENDING");

  return (
    <AdminLayout
      title="Customer reviews"
      description="What customers wrote. Only approved reviews appear on the website and the app, and only they make an item's rating."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Author or words in the review…"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px]" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="ALL">All statuses</SelectItem>
            </SelectContent>
          </Select>
          <Select value={targetType} onValueChange={setTargetType}>
            <SelectTrigger className="w-[180px]" aria-label="About">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Everything</SelectItem>
              <SelectItem value="LISTING">Flights, bus, cars, activities</SelectItem>
              <SelectItem value="HOTEL">Hotels</SelectItem>
              <SelectItem value="RESTAURANT">Restaurants</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <div
            // The rows before stay up, dimmed and out of reach, while the next ones load.
            aria-busy={isPlaceholderData || undefined}
            className={cn("overflow-x-auto rounded-lg border bg-background", isPlaceholderData && "opacity-60")}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Stars</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Status</TableHead>
                  {showActions ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody inert={isPlaceholderData || undefined}>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : !rows.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      {narrowed
                        ? "No reviews match."
                        : "No reviews waiting. New ones appear here as customers write them on the website or in the app."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => {
                    const route = ITEM_ROUTE[r.targetType];
                    const canOpen = route && canOpenRoute(admin?.permissions, route.pattern);
                    const busy = moderating && variables?.review.id === r.id;
                    return (
                      <TableRow key={r.id} className="align-top">
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(r.createdAt)}
                        </TableCell>
                        <TableCell className="max-w-56 whitespace-normal">
                          {!r.targetLabel ? (
                            <span className="text-sm text-muted-foreground">Item deleted</span>
                          ) : canOpen ? (
                            <Link href={route.href(r.target)} className="font-medium hover:underline">
                              {r.targetLabel}
                            </Link>
                          ) : (
                            <span className="font-medium">{r.targetLabel}</span>
                          )}
                          {r.targetVertical ? (
                            <p className="text-xs text-muted-foreground">{label(VERTICAL, r.targetVertical)}</p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Stars n={r.rating} />
                        </TableCell>
                        <TableCell className="min-w-64 max-w-md whitespace-pre-line break-words text-sm">
                          {r.comment || <span className="text-muted-foreground">No comment</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <p>{r.authorName}</p>
                          {/* Signed "Firstname L."; the full name helps tell two Patricks apart. */}
                          {r.customerName && r.customerName !== r.authorName ? (
                            <p className="text-xs text-muted-foreground">{r.customerName}</p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {r.verified ? (
                            // The website's own words for it, so the office reads what customers see.
                            <Badge
                              variant="secondary"
                              className="gap-1 whitespace-nowrap"
                              title="They had a paid or completed booking of this when they wrote it"
                            >
                              <BadgeCheck className="size-3.5" />
                              Booked with us
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_STYLES[r.status]}>
                            {label(STATUS_LABEL, r.status)}
                          </Badge>
                        </TableCell>
                        {showActions ? (
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {canWrite && r.status !== "APPROVED" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  disabled={busy}
                                  onClick={() => moderate({ review: r, to: "APPROVED" })}
                                >
                                  <Check className="size-4" />
                                  Approve
                                </Button>
                              ) : null}
                              {canWrite && r.status !== "REJECTED" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1.5"
                                  disabled={busy}
                                  onClick={() => moderate({ review: r, to: "REJECTED" })}
                                >
                                  <X className="size-4" />
                                  Reject
                                </Button>
                              ) : null}
                              <DeleteButton
                                permission="content:delete"
                                what={`the review by ${r.authorName}`}
                                consequence={
                                  r.status === "APPROVED"
                                    ? "It leaves the website and the item's rating."
                                    : "Rejecting keeps it off the website without deleting it."
                                }
                                onDelete={() => deleteReview(r.id)}
                                onDeleted={refresh}
                              />
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <Pager page={page} total={data?.total ?? 0} onPage={setPage} noun="review" />
      </div>
    </AdminLayout>
  );
}
