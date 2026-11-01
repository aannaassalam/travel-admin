import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem
} from "@/components/ui/pagination";
import { useT } from "@/lib/i18n/useT";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

/** How many rows every list in the panel shows at a time. */
export const PAGE_SIZE = 15;

/** 1 … 4 5 6 … 12: both ends, the page you are on, and its neighbours. */
const pagesToShow = (page: number, pages: number): (number | "gap")[] => {
  const wanted = new Set([1, 2, page - 1, page, page + 1, pages - 1, pages]);
  const shown = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return shown.flatMap((n, i) =>
    i && n - shown[i - 1] > 1 ? (["gap", n] as const) : [n]
  );
};

/**
 * The row under a list: "Showing 16–30 of 87" and the pages to move between.
 * A list that fits on one page shows only its count.
 */
export default function Pager({
  page,
  total,
  onPage,
  pageSize = PAGE_SIZE,
  noun,
  plural
}: {
  page: number;
  /** Everything the list holds, not just the rows on screen. */
  total: number;
  onPage: (page: number) => void;
  pageSize?: number;
  /** "booking", "customer" — for the count, in the panel's language. */
  noun?: string;
  /** Pass it with `noun`; left out, an s is added (right in English only). */
  plural?: string;
}) {
  const { t } = useT();
  const one = noun ?? t("inv.pager.item");
  const many = plural ?? (noun ? `${noun}s` : t("inv.pager.items"));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  // The last row of the last page was archived, or the list got shorter while
  // on page 6: step back to the last page that exists rather than show none.
  useEffect(() => {
    if (total && page > pages) onPage(pages);
  }, [total, page, pages, onPage]);
  if (!total) return null;
  const current = Math.min(page, pages);
  const first = (current - 1) * pageSize + 1;
  const last = Math.min(total, current * pageSize);
  const count = t("inv.pager.count", { n: total, noun: total === 1 ? one : many });

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-xs tabular-nums text-muted-foreground">
        {pages > 1 ? t("inv.pager.showing", { first, last, count }) : count}
      </p>
      {pages > 1 ? (
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                disabled={current <= 1}
                onClick={() => onPage(current - 1)}
              >
                <ChevronLeft className="size-4 rtl:-scale-x-100" />
                <span className="hidden sm:inline">{t("inv.pager.previous")}</span>
              </Button>
            </PaginationItem>
            {pagesToShow(current, pages).map((n, i) =>
              n === "gap" ? (
                <PaginationItem key={`gap-${i}`}>
                  <PaginationEllipsis className="size-8" />
                </PaginationItem>
              ) : (
                <PaginationItem key={n}>
                  <Button
                    variant={n === current ? "outline" : "ghost"}
                    size="sm"
                    className="min-w-8 px-2 tabular-nums"
                    aria-label={t("inv.pager.page", { n })}
                    aria-current={n === current ? "page" : undefined}
                    onClick={() => onPage(n)}
                  >
                    {n}
                  </Button>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                disabled={current >= pages}
                onClick={() => onPage(current + 1)}
              >
                <span className="hidden sm:inline">{t("inv.pager.next")}</span>
                <ChevronRight className="size-4 rtl:-scale-x-100" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}

/**
 * The page a list is on. It goes back to 1 by itself whenever the filter
 * changes — page 4 of one search is not page 4 of the next, and clearing a
 * search starts again from the top rather than from wherever it was left.
 */
export function usePage(filterKey = "") {
  const [state, setState] = useState({ key: filterKey, page: 1 });
  // Adjusted while rendering, not in an effect: an effect would first fetch
  // the old page number against the new filter, then fetch again.
  if (state.key !== filterKey) setState({ key: filterKey, page: 1 });
  const page = state.key === filterKey ? state.page : 1;
  return [page, (next: number) => setState({ key: filterKey, page: next })] as const;
}

/**
 * For a list that arrives whole (users, roles, locations): the rows of the
 * current page, and what to hand <Pager> to move between them.
 */
export function usePaged<T>(items: T[], filterKey = "", pageSize = PAGE_SIZE) {
  const [page, setPage] = usePage(filterKey);
  const current = Math.min(page, Math.max(1, Math.ceil(items.length / pageSize)));
  return {
    rows: items.slice((current - 1) * pageSize, current * pageSize),
    pager: { page: current, total: items.length, onPage: setPage, pageSize }
  };
}
