import {
  CsvSeparator,
  deactivateHotel,
  deactivateListing,
  deactivateRestaurant,
  deleteHotel,
  deleteListing,
  deleteRestaurant,
  downloadInventoryCsv,
  duplicateHotel,
  duplicateListing,
  duplicateRestaurant,
  listHotels,
  listRestaurants,
  listListings,
  type Money,
  publishHotel,
  publishListing,
  publishRestaurant
} from "@/api/functions/admin.api";
import { intlLocale } from "@/components/DateField";
import DeleteButton from "@/components/DeleteButton";
import AssetImage from "@/components/Form/AssetImage";
import { PromoNote } from "@/components/Form/PromotionFields";
import { CSV_FORMATS } from "@/components/Inventory/SpreadsheetImport";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { PAGE_SIZE, usePage } from "@/components/Pager";
import SortHead, { type Sort } from "@/components/SortHead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/functions/format.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { label, LISTING_STATUS } from "@/lib/functions/labels.lib";
import { tagText } from "@/lib/functions/localized.lib";
import { useDebounce } from "@/hooks/utils/useDebounce";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Copy, Download, Eye, EyeOff, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * §5.2: all seven verticals on one screen, switched by group — the same pattern
 * as the booking queues, so there is one place to look for inventory rather
 * than two.
 *
 * Hotels (hotel → room type) and restaurants (restaurant → menu item) are
 * different shapes, so each gets its own table; the other five share
 * one.
 */
const GROUP_KEYS = ["HOTEL", "RESTAURANT", "FLIGHT", "BUS", "CAR", "PROPERTY", "ACTIVITY"] as const;
const GROUPS = GROUP_KEYS.map((key) => {
  // `singular` and `plural` are explicit rather than derived — stripping a
  // trailing "s" turns "Properties" into "Propertie" and "Bus" into "Bu".
  // `add` is its own phrase: "New" agrees with the noun in French.
  const keys: Record<"label" | "singular" | "plural" | "add", TranslationKey> = {
    label: `inv.list.group.${key}`,
    singular: `inv.list.group.${key}.one`,
    plural: `inv.list.group.${key}.other`,
    add: `inv.list.group.${key}.new`
  };
  return { key: key as string, ...keys };
});

/**
 * The office chooses between two statuses, so those are the two it can filter
 * by. Expired and sold out are outcomes; they show under "All". There is no
 * Archive any more (2026-11-09): one archived before is listed as Inactive.
 */
const STATUS_FILTERS: { key: string; label: TranslationKey }[] = [
  { key: "", label: "inv.list.filter.all" },
  { key: "PUBLISHED", label: "inv.list.filter.PUBLISHED" },
  { key: "INACTIVE", label: "inv.list.filter.INACTIVE" }
];

/** On the website right now — so what it can be is taken down. */
const LIVE = ["PUBLISHED", "SOLD_OUT"];

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  INACTIVE: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ARCHIVED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  EXPIRED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  SOLD_OUT: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
};

/** One row of any of the three tables, as far as the actions care. */
interface Row {
  id: string;
  name: string;
  /** Where its edit screen is — "Open" on a refused publish goes here. */
  href: string;
}

type Act = (id: string) => Promise<unknown>;

const refusal = (e: unknown, fallback: string) =>
  (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback;

/** First gallery image, or a visible gap where one should be. */
const Thumb = ({ src }: { src?: string }) => {
  const { t } = useT();
  return (
    <AssetImage
      src={src}
      className="size-9 shrink-0"
      title={src ? undefined : t("inv.list.noImage")}
    />
  );
};

const Translations = ({ map }: { map: Record<string, boolean> }) => (
  <span className="font-mono text-xs">
    {Object.entries(map).map(([loc, done]) => (
      <span key={loc} className={done ? "text-emerald-600" : "text-muted-foreground/50"}>
        {loc.toUpperCase()}
        {done ? "✓" : "✗"}{" "}
      </span>
    ))}
  </span>
);

const Status = ({ value }: { value: string }) => (
  <Badge variant="secondary" className={STATUS_STYLES[value]}>
    {label(LISTING_STATUS, value)}
  </Badge>
);

export default function InventoryPage() {
  const router = useRouter();
  const group = (router.query.group as string) || "HOTEL";
  const current = GROUPS.find((g) => g.key === group) ?? GROUPS[0];
  const isHotels = group === "HOTEL";
  const isProperty = group === "PROPERTY";
  // Restaurants are a third shape — parent plus a menu, no per-date lots and
  // no allotment — so they get their own query and their own columns.
  const isRestaurants = group === "RESTAURANT";
  // Buses and flights are routes on a timetable, with no stock to count.
  const isRoutes = group === "BUS" || group === "FLIGHT";

  const [q, setQ] = useState("");
  // Global search's "See all" row lands here with the term already applied.
  useEffect(() => {
    if (typeof router.query.q === "string") setQ(router.query.q);
  }, [router.query.q]);
  const [status, setStatus] = useState("");
  const queryClient = useQueryClient();
  // The three lists and the export are inventory:read, which is what opens
  // this page. Create, copy, publish and deactivate are inventory:write.
  // Deleting for good is inventory:delete, which the bin checks for itself.
  // The spreadsheet import is not offered here (2026-11-09); the export is.
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const { t, locale } = useT();
  // A listing the conversion to francs has not reached yet: its dollars, as
  // dollars — its franc figures are the 0 the server fills in, not a price.
  const price = (base: number, m?: Money) =>
    typeof m?.USD === "number" ? formatMoney(m.USD, "USD") : formatMoney(base, "CDF", locale);

  // Newest first until a column heading is pressed: then first to last, last
  // to first, and back. Kept per group — their columns are not the same, and
  // an order by Supplier means nothing to the list of buses.
  const [sorts, setSorts] = useState<Record<string, Sort>>({});
  // Own keys only: the group comes from the address, and `?group=constructor`
  // must not find Object's.
  const sort = Object.hasOwn(sorts, group) ? sorts[group] : "";
  const setSort = (next: Sort) => setSorts((all) => ({ ...all, [group]: next }));
  const head = { sort, onSort: setSort };
  const term = useDebounce(q.trim(), 300);
  // Searched, ordered and cut into pages by the server, so a name sorts across
  // the whole group and not only the rows that happen to be on screen.
  const [page, setPage] = usePage(`${group}|${term}|${status}|${sort}`);
  const narrowed = { q: term, status, sort, page, limit: PAGE_SIZE };
  const paged = {
    // Coming back from a detail screen, the list must show what was done there.
    refetchOnMount: "always",
    // The rows stay up while the next page loads, instead of blinking empty.
    placeholderData: keepPreviousData
  } as const;
  const hotels = useQuery({
    queryKey: ["hotels", narrowed],
    queryFn: () => listHotels(narrowed),
    enabled: isHotels,
    ...paged
  });
  const listings = useQuery({
    queryKey: ["listings", group, narrowed],
    queryFn: () => listListings({ ...narrowed, vertical: group }),
    enabled: !isHotels && !isRestaurants,
    ...paged
  });
  const restaurants = useQuery({
    queryKey: ["restaurants", narrowed],
    queryFn: () => listRestaurants(narrowed),
    enabled: isRestaurants,
    ...paged
  });

  // Showing the rows of the order, page or search before, while the next load.
  const stale = (isHotels ? hotels : isRestaurants ? restaurants : listings)
    .isPlaceholderData;

  /** Done once the list on screen has been read again. */
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hotels"] }),
      queryClient.invalidateQueries({ queryKey: ["listings"] }),
      queryClient.invalidateQueries({ queryKey: ["restaurants"] })
    ]);

  /** The same action, on whichever of the three shapes this group is. */
  const byShape = (hotel: Act, restaurant: Act, listing: Act) =>
    isHotels ? hotel : isRestaurants ? restaurant : listing;

  /** §5.1: clone is the highest-leverage feature in the module. */
  const { mutate: duplicate, isPending: duplicating } = useMutation({
    mutationFn: ({ id }: Row) =>
      byShape(duplicateHotel, duplicateRestaurant, duplicateListing)(id),
    meta: { showToast: false },
    // Handed back, so Copy stays unavailable until the list has been read
    // again: the rows move when the copy arrives, and a second press in that
    // moment would land on another row.
    onSuccess: (_r, row) => {
      toast.success(t("inv.list.copied", { name: row.name }));
      return invalidate();
    },
    onError: (e) => toast.error(refusal(e, t("inv.list.copyFailed")))
  });

  /**
   * Publishing is also how something inactive comes back. The server checks it
   * is fit to show first, and says what is missing when it is not — so the
   * refusal offers the way to the screen where that gets fixed.
   */
  const { mutate: publish, isPending: publishing } = useMutation({
    mutationFn: ({ id }: Row) =>
      byShape(publishHotel, publishRestaurant, publishListing)(id),
    meta: { showToast: false },
    // Handed back for the same reason as Copy's: ordered by Status or
    // Updated, or under the Inactive filter, the published row moves away and
    // another row's Publish takes its place.
    onSuccess: (_r, row) => {
      toast.success(t("inv.list.published", { name: row.name }));
      return invalidate();
    },
    onError: (e, row) =>
      toast.error(refusal(e, t("inv.list.publishFailed")), {
        action: { label: t("inv.list.open"), onClick: () => router.push(row.href) }
      })
  });

  /**
   * Taking something down asks first: off the website, still in this list,
   * one click from live again. Deleting for good is the bin beside it, which
   * asks for itself.
   */
  const [pending, setPending] = useState<Row | null>(null);

  const { mutate: confirm, isPending: confirming } = useMutation({
    mutationFn: ({ id }: Row) =>
      byShape(deactivateHotel, deactivateRestaurant, deactivateListing)(id),
    meta: { showToast: false },
    onSuccess: (_r, done) => {
      setPending(null);
      invalidate();
      toast.success(t("inv.list.deactivated", { name: done.name }));
    },
    onError: (e) => toast.error(refusal(e, t("inv.list.actionFailed")))
  });

  const { mutate: exportCsv, isPending: exporting } = useMutation({
    mutationFn: (sep: CsvSeparator) => downloadInventoryCsv(group, "export", sep),
    meta: { showToast: false },
    onSuccess: (name) => toast.success(t("inv.list.exported", { name })),
    onError: () => toast.error(t("inv.list.exportFailed"))
  });

  const data = isHotels
    ? hotels.data
    : isRestaurants
      ? restaurants.data
      : listings.data;
  const loading = isHotels
    ? hotels.isLoading
    : isRestaurants
      ? restaurants.isLoading
      : listings.isLoading;
  const filtered = Boolean(term || status);
  const newHref = isHotels
    ? "/inventory/hotel/new"
    : isRestaurants
      ? "/inventory/restaurant/new"
      : `/inventory/listing/new?vertical=${group}`;

  const actions = (row: Row, rowStatus: string) =>
    canWrite ? (
      <div className="flex items-center justify-end gap-1">
        {LIVE.includes(rowStatus) ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            title={t("inv.list.takeDown")}
            onClick={() => setPending(row)}
          >
            <EyeOff className="size-3.5" />
            {t("inv.list.deactivate")}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
            title={t("inv.list.putUp")}
            disabled={publishing}
            onClick={() => publish(row)}
          >
            <Eye className="size-3.5" />
            {t("common.publish")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          title={t("inv.list.copy")}
          aria-label={t("inv.list.copy")}
          disabled={duplicating}
          onClick={() => duplicate(row)}
        >
          <Copy className="size-4" />
        </Button>
        {/* Only in this cell, so only beside the other actions: an admin who
            may delete and not edit does it from the record's own page. */}
        <DeleteButton
          permission="inventory:delete"
          what={
            isHotels
              ? t("inv.list.delete.hotel", { name: row.name })
              : isRestaurants
                ? t("inv.list.delete.restaurant", { name: row.name })
                : t("inv.list.delete.listing", { name: row.name })
          }
          consequence={
            isHotels
              ? t("inv.list.delete.hotelConsequence")
              : isRestaurants
                ? t("inv.list.delete.restaurantConsequence")
                : t("inv.list.delete.listingConsequence")
          }
          onDelete={(confirmed) =>
            (isHotels
              ? deleteHotel
              : isRestaurants
                ? deleteRestaurant
                : deleteListing)(row.id, confirmed)
          }
          onDeleted={() => {
            invalidate();
            // A hotel's own page shows the copy kept in memory while it reads
            // the hotel again: with none to show, it says "not found".
            if (isHotels) queryClient.removeQueries({ queryKey: ["hotel", row.id] });
          }}
        />
      </div>
    ) : null;

  return (
    <AdminLayout
      title={t("inv.title")}
      description={t("inv.list.description")}
    >
      <div className="flex flex-col gap-4">
        {/* Group switcher — same pattern as the booking queues. */}
        <div className="flex flex-wrap gap-1 border-b pb-2">
          {GROUPS.map(({ key, label }) => (
            <Link
              key={key}
              href={`/inventory?group=${key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                group === key
                  ? "bg-foreground font-medium text-background"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t(label)}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 max-w-sm flex-1">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.search")}
              className="ps-9"
            />
          </div>

          <div
            className="flex gap-1 rounded-lg border bg-background p-1"
            role="group"
            aria-label={t("inv.list.filterByStatus")}
          >
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={status === f.key}
                onClick={() => setStatus(f.key)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm transition-colors",
                  status === f.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {t(f.label)}
              </button>
            ))}
          </div>

          <div className="ms-auto flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={exporting}>
                  <Download className="size-4" />
                  {exporting ? t("inv.list.exporting") : t("inv.list.export")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("inv.list.exportFor", { plural: t(current.plural) })}</DropdownMenuLabel>
                {CSV_FORMATS.map((f) => (
                  <DropdownMenuItem key={f.sep} onSelect={() => exportCsv(f.sep)}>
                    {t(f.label)}
                    <span className="ms-auto ps-4 text-xs text-muted-foreground">
                      {t(f.hint)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {canWrite ? (
              <Link href={newHref}>
                <Button className="gap-2">
                  <Plus className="size-4" />
                  {t(current.add)}
                </Button>
              </Link>
            ) : null}
          </div>
        </div>

        <div
          // The rows of the order, page or search before stay up while the
          // next ones load — dimmed and out of reach, so they are not read as
          // the answer, nor pressed just as they change.
          aria-busy={stale || undefined}
          className={cn(
            "rounded-lg border bg-background",
            stale && "opacity-60"
          )}
        >
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <SortHead column="name" {...head}>
                  {isHotels
                    ? t("inv.hotel")
                    : isRestaurants
                      ? t("inv.list.col.restaurant")
                      : t("inv.list.col.title")}
                </SortHead>
                <SortHead column="city" {...head}>
                  {isRoutes ? t("inv.list.col.route") : t("common.city")}
                </SortHead>
                <SortHead column="status" {...head}>
                  {t("common.status")}
                </SortHead>
                {isHotels ? (
                  <>
                    <SortHead column="translations" {...head}>
                      {t("inv.translations")}
                    </SortHead>
                    <SortHead column="supplier" {...head}>
                      {t("inv.supplier")}
                    </SortHead>
                    <SortHead column="updated" {...head}>
                      {t("common.updated")}
                    </SortHead>
                  </>
                ) : isRestaurants ? (
                  <>
                    <SortHead column="translations" {...head}>
                      {t("inv.translations")}
                    </SortHead>
                    <SortHead column="zones" align="right" {...head}>
                      {t("inv.list.col.zones")}
                    </SortHead>
                    <SortHead column="updated" {...head}>
                      {t("common.updated")}
                    </SortHead>
                  </>
                ) : isProperty ? (
                  <>
                    <SortHead column="sell" align="right" {...head}>
                      {t("inv.list.col.price")}
                    </SortHead>
                    <SortHead column="translations" {...head}>
                      {t("inv.translations")}
                    </SortHead>
                    <SortHead column="updated" {...head}>
                      {t("common.updated")}
                    </SortHead>
                  </>
                ) : (
                  <>
                    <SortHead column="cost" align="right" {...head}>
                      {t("inv.list.col.cost")}
                    </SortHead>
                    <SortHead column="sell" align="right" {...head}>
                      {t("inv.list.col.sell")}
                    </SortHead>
                    <SortHead column="margin" align="right" {...head}>
                      {t("inv.list.col.margin")}
                    </SortHead>
                    {isRoutes ? (
                      <TableHead>{t("inv.list.col.agencyDepartures")}</TableHead>
                    ) : (
                      <SortHead column="available" align="right" {...head}>
                        {t("inv.list.col.available")}
                      </SortHead>
                    )}
                  </>
                )}
                {canWrite ? <TableHead className="text-end">{t("common.actions")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody inert={stale || undefined}>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : !data?.items.length ? (
                // §13: empty states explain what to do next.
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      {filtered
                        ? t("inv.list.noMatch", { plural: t(current.plural) })
                        : t("inv.list.nothingYet", { label: t(current.label) })}
                    </p>
                    {canWrite && !filtered ? (
                      <Link href={newHref}>
                        <Button size="sm" className="mt-3 gap-2">
                          <Plus className="size-4" />
                          {t("inv.list.addFirst")}
                        </Button>
                      </Link>
                    ) : null}
                  </TableCell>
                </TableRow>
              ) : isRestaurants ? (
                restaurants.data!.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Thumb src={r.images?.[0]} />
                        <div className="min-w-0">
                          <Link
                            href={`/inventory/restaurant/${r.id}`}
                            className="font-medium hover:underline"
                          >
                            {r.displayName}
                          </Link>
                          {r.cuisines?.length ? (
                            <span className="ms-2 text-xs text-muted-foreground">
                              {r.cuisines.map((c) => tagText(r.tagTranslations, c)).join(" · ")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{r.city}</TableCell>
                    <TableCell>
                      <Status value={r.status} />
                    </TableCell>
                    <TableCell>
                      <Translations map={r.translations} />
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {/* A published restaurant with no zone cannot price a
                          delivery, so zero is a defect worth showing in red. */}
                      <span className={r.deliveryZones?.length ? "" : "text-red-600"}>
                        {r.deliveryZones?.length ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.updatedAt)}
                    </TableCell>
                    {canWrite ? (
                      <TableCell>
                        {actions(
                          {
                            id: r.id,
                            name: r.displayName,
                            href: `/inventory/restaurant/${r.id}`
                          },
                          r.status
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              ) : isHotels ? (
                hotels.data!.items.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Thumb src={h.images?.[0]} />
                        <div className="min-w-0">
                          <Link
                            href={`/inventory/hotel/${h.id}`}
                            className="font-medium hover:underline"
                          >
                            {h.displayName}
                          </Link>
                          <span className="ms-2 text-xs text-muted-foreground">
                            {"★".repeat(h.stars)}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{h.city}</TableCell>
                    <TableCell>
                      <Status value={h.status} />
                    </TableCell>
                    <TableCell>
                      <Translations map={h.translations} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {h.supplierName || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(h.updatedAt)}
                    </TableCell>
                    {canWrite ? (
                      <TableCell>
                        {actions(
                          { id: h.id, name: h.displayName, href: `/inventory/hotel/${h.id}` },
                          h.status
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              ) : (
                listings.data!.items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Thumb src={l.images?.[0]} />
                        <Link
                          href={`/inventory/listing/${l.id}`}
                          className="font-medium hover:underline"
                        >
                          {l.displayTitle}
                        </Link>
                        {isRoutes && l.tripScope === "INTERNATIONAL" ? (
                          <Badge variant="outline" className="border-sky-300 text-sky-700 dark:text-sky-300">
                            {t("trip.INTERNATIONAL")}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {isRoutes
                        ? `${l.city} → ${String(l.attributes?.destination ?? "?")}`
                        : l.city}
                    </TableCell>
                    <TableCell>
                      <Status value={l.status} />
                    </TableCell>
                    {isProperty ? (
                      <>
                        <TableCell className="text-end tabular-nums">
                          {price(l.sellPriceBase, l.sellPrice)}
                          <PromoNote item={l} locale={locale} />
                        </TableCell>
                        <TableCell>
                          <Translations map={l.translations} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(l.updatedAt)}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-end tabular-nums text-muted-foreground">
                          {price(l.costPriceBase, l.costPrice)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {price(l.sellPriceBase, l.sellPrice)}
                          {/* The main price's promotion, else the biggest on a car rate or a fare. */}
                          <PromoNote item={l} locale={locale} />
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {typeof l.sellPrice?.USD === "number" || typeof l.costPrice?.USD === "number"
                            ? "—"
                            : formatMoney(l.margin, "CDF", locale)}
                        </TableCell>
                        {isRoutes ? (
                          <TableCell className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {l.supplierName || t("inv.list.noAgency")}
                            </span>
                            <br />
                            {timetableSummary(l.attributes, t, locale) || t("inv.list.noDepartures")}
                          </TableCell>
                        ) : (
                          <TableCell className="text-end tabular-nums">
                            {l.available}/{l.quantityTotal}
                          </TableCell>
                        )}
                      </>
                    )}
                    {canWrite ? (
                      <TableCell>
                        {actions(
                          {
                            id: l.id,
                            name: l.displayTitle,
                            href: `/inventory/listing/${l.id}`
                          },
                          l.status
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Pager
          page={page}
          total={data?.total ?? 0}
          onPage={setPage}
          noun={t(current.singular)}
          plural={t(current.plural)}
        />

        {isProperty ? (
          <p className="text-xs text-muted-foreground">
            {t("inv.list.propertyNote")}
          </p>
        ) : null}
      </div>

      <AlertDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("inv.list.confirm.deactivate", { name: pending?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("inv.list.confirm.deactivateBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirming}
              onClick={(e) => {
                // Keep the dialog up while the request is in flight, so a slow
                // network cannot look like a no-op and invite a second click.
                e.preventDefault();
                if (pending) confirm(pending);
              }}
            >
              {confirming ? t("inv.list.working") : t("inv.list.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

/** "Daily 06:30, 14:00" for a bus, "Mon 08:00 · Wed 15:45" for a flight. */
function timetableSummary(
  attributes: Record<string, unknown> | undefined,
  t: ReturnType<typeof useT>["t"],
  locale: string
) {
  const daily = (attributes?.dailyTimes as string[] | undefined) ?? [];
  const weekly = (attributes?.weeklyTimes as { day: number; time: string }[] | undefined) ?? [];
  // 0 is Sunday: 4 January 2026 was one. "Sun", "Mon"… in English, as before.
  const dayName = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short" });
  return [
    daily.length ? t("inv.list.daily", { times: daily.join(", ") }) : "",
    ...weekly.map((w) => `${dayName.format(new Date(2026, 0, 4 + w.day))} ${w.time}`)
  ]
    .filter(Boolean)
    .join(" · ");
}
