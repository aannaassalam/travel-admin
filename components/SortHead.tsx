import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A column heading that orders its table: pressed once, first to last; again,
 * last to first; a third time, back to the list's own order.
 *
 * The order is one string — "" (the list's own), "name" or "-name". It is
 * what the API takes as `?sort=` for a list the server pages, and what
 * `sortRows` reads for a list that is all in the browser.
 */
export type Sort = string;

export const nextSort = (sort: Sort, column: string): Sort =>
  sort === column ? `-${column}` : sort === `-${column}` ? "" : column;

/** For `aria-sort` on the heading cell. */
export const sortState = (sort: Sort, column: string) =>
  sort === column
    ? ("ascending" as const)
    : sort === `-${column}`
      ? ("descending" as const)
      : ("none" as const);

/** The button inside the heading; on its own for a table built from plain `<th>`. */
export function SortButton({
  column,
  sort,
  onSort,
  align,
  inset,
  children
}: {
  /** The column's key: what `sort` holds, and what the API or `sortRows` knows it by. */
  column: string;
  sort: Sort;
  onSort: (next: Sort) => void;
  /** "right" for a column of figures, so the heading stays over them. */
  align?: "right";
  /**
   * Inside a padded heading cell (SortHead's): the button reaches into that
   * padding, so its words line up with the cells below. In a plain `<th>`
   * with no padding of its own that reach would be cut off — leave it out.
   */
  inset?: boolean;
  children: ReactNode;
}) {
  const state = sortState(sort, column);
  const Icon =
    state === "ascending"
      ? ArrowUp
      : state === "descending"
        ? ArrowDown
        : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(nextSort(sort, column))}
      title={
        state === "none"
          ? "Sort, first to last"
          : state === "ascending"
            ? "Sorted first to last — press for last to first"
            : "Sorted last to first — press for the usual order"
      }
      className={cn(
        "flex items-center gap-1.5 rounded py-1 hover:bg-muted",
        align === "right" && "ml-auto",
        inset
          ? cn("px-2", align === "right" ? "-mr-2" : "-ml-2")
          : align === "right"
            ? "pl-2"
            : "pr-2"
      )}
    >
      {children}
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          state === "none" && "text-muted-foreground/50"
        )}
      />
    </button>
  );
}

export default function SortHead({
  className,
  ...button
}: React.ComponentProps<typeof SortButton> & { className?: string }) {
  return (
    <TableHead
      aria-sort={sortState(button.sort, button.column)}
      className={className}
    >
      <SortButton inset {...button} />
    </TableHead>
  );
}

const french = new Intl.Collator("fr", { sensitivity: "base", numeric: true });
type Value = string | number | boolean | Date | null | undefined;

/**
 * Orders a list that is all in the browser, by the column `sort` names.
 * `by` gives each column the value it orders on. Text the way a person files
 * it (accents and case ignored, "10" after "9"); nothing before something, as
 * the server orders its lists; rows that tie keep the order they came in.
 */
export function sortRows<T>(
  rows: T[],
  sort: Sort,
  by: Record<string, (row: T) => Value>
): T[] {
  const column = sort.replace(/^-/, "");
  const value = Object.hasOwn(by, column) ? by[column] : undefined;
  if (!sort || !value) return rows;
  const direction = sort.startsWith("-") ? -1 : 1;
  const empty = (v: Value) => v === null || v === undefined || v === "";
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (empty(x) || empty(y)) {
      return direction * (empty(x) === empty(y) ? 0 : empty(x) ? -1 : 1);
    }
    return (
      direction *
      (typeof x === "string" || typeof y === "string"
        ? french.compare(String(x), String(y))
        : Number(x) - Number(y))
    );
  });
}
