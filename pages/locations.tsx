import {
  createLocation,
  createRoute,
  listLocations,
  listRoutes,
  updateLocation,
  updateRoute,
  type ServiceLocation
} from "@/api/functions/admin.api";
import ImageUploader from "@/components/Form/ImageUploader";
import { OptionSelect } from "@/components/Form/OptionSelect";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import {
  SortButton,
  sortRows,
  sortState,
  type Sort
} from "@/components/SortHead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useOptimisticMutation } from "@/hooks/useOptimisticMutation";
import { isOne } from "@/components/Transfers/transfers.lib";
import { label, VERTICAL } from "@/lib/functions/labels.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { AlertTriangle, ArrowRight, Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * Where the business operates.
 *
 * §12/§15: opening a city must not need a developer. Everything the public
 * search box offers — the suggestions, the popular-destination chips, the
 * homepage tiles — reads from this screen, and a listing cannot name a place
 * that is not on it.
 */

// TRANSFER: rides with a driver — the city is offered on the transfers page.
const VERTICALS = ["FLIGHT", "HOTEL", "BUS", "CAR", "ACTIVITY", "PROPERTY", "TRANSFER"] as const;
/** Only these two are sold as an origin→destination pair. */
const PAIR_VERTICALS = ["FLIGHT", "BUS"] as const;
/** "No flight routes yet." — one sentence per pair vertical, so each language words it. */
const NO_ROUTES: Record<string, TranslationKey> = {
  FLIGHT: "tr.loc.noRoutes.FLIGHT",
  BUS: "tr.loc.noRoutes.BUS"
};

const EMPTY = {
  name: "",
  province: "",
  iata: "",
  servesVerticals: [] as string[],
  sortOrder: 0,
  // The city's tile on the home page; "" for none.
  image: ""
};

export default function LocationsPage() {
  const { t, locale } = useT();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ ...EMPTY });
  const [showNew, setShowNew] = useState(false);
  // The location the form is changing; null while it is adding a new one.
  const [editing, setEditing] = useState<ServiceLocation | null>(null);
  const [search, setSearch] = useState("");
  const [routeVertical, setRouteVertical] = useState<string>("FLIGHT");
  const [pair, setPair] = useState({ originId: "", destinationId: "" });
  // Both lists are inventory:read, which is what opens this page. Adding and
  // every toggle are inventory:write; without it the toggles only show state.
  const { can } = useCan();
  const canWrite = can("inventory:write");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["locations"],
    queryFn: listLocations,
    // "On sale here" changes whenever inventory is published or taken down.
    refetchOnMount: "always"
  });
  const { data: routes } = useQuery({
    queryKey: ["routes", routeVertical],
    queryFn: () => listRoutes(routeVertical)
  });

  const locations = data?.items ?? [];
  const needle = search.trim().toLowerCase();
  const matching = needle
    ? locations.filter((l) =>
        [l.name, l.province, l.iata].some((v) => v?.toLowerCase().includes(needle))
      )
    : locations;
  // By position (lowest first), as the server sends them, until a column
  // heading is pressed.
  const [sort, setSort] = useState<Sort>("");
  const head = { sort, onSort: setSort };
  // The order is worked out when a heading is pressed — or the list itself
  // gains or loses a row — and then held. These rows carry their own switches:
  // re-ordered the moment "Deactivate" or a product chip was pressed, the row
  // jumped away under the pointer and the next click landed on another city.
  const present = matching.map((l) => l.id).join();
  const held = useMemo(
    () =>
      sortRows(matching, sort, {
        city: (l) => l.name,
        iata: (l) => l.iata,
        // The products switched on, as the column spells them.
        sells: (l) =>
          VERTICALS.filter((v) => l.servesVerticals.includes(v))
            .map((v) => v.slice(0, 4))
            .join(" "),
        listings: (l) => l.listingCount,
        // Active first, going up.
        status: (l) => !l.isActive
      }).map((l) => l.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sort, present]
  );
  const place = new Map(held.map((id, i) => [id, i]));
  const { rows, pager } = usePaged(
    [...matching].sort(
      (a, b) => (place.get(a.id) ?? 0) - (place.get(b.id) ?? 0)
    ),
    `${needle}|${sort}`
  );

  /** A pure toggle — the result is exactly the click, so it shows at once. */
  const { mutate: toggleActive } = useOptimisticMutation<
    unknown,
    { id: string; isActive: boolean },
    { items: ServiceLocation[] }
  >({
    mutationFn: ({ id, isActive }) => updateLocation(id, { isActive }),
    queryKey: ["locations"],
    apply: (previous, { id, isActive }) =>
      previous && {
        ...previous,
        items: previous.items.map((l) => (l.id === id ? { ...l, isActive } : l))
      },
    successMessage: t("tr.loc.toast.updated"),
    errorMessage: t("tr.loc.toast.updateFailed")
  });

  /** Same for which products a city sells. */
  const { mutate: toggleVertical } = useOptimisticMutation<
    unknown,
    { location: ServiceLocation; vertical: string },
    { items: ServiceLocation[] }
  >({
    mutationFn: ({ location, vertical }) =>
      updateLocation(location.id, {
        servesVerticals: location.servesVerticals.includes(vertical)
          ? location.servesVerticals.filter((v) => v !== vertical)
          : [...location.servesVerticals, vertical]
      }),
    queryKey: ["locations"],
    apply: (previous, { location, vertical }) =>
      previous && {
        ...previous,
        items: previous.items.map((l) =>
          l.id === location.id
            ? {
                ...l,
                servesVerticals: l.servesVerticals.includes(vertical)
                  ? l.servesVerticals.filter((v) => v !== vertical)
                  : [...l.servesVerticals, vertical]
              }
            : l
        )
      },
    errorMessage: t("tr.loc.toast.sellsFailed")
  });

  /**
   * Creates are deliberately NOT optimistic: the server mints the id and the
   * slug and can refuse a duplicate, so there is nothing honest to draw until
   * it answers — a row with no id is one nothing else on this page can act on.
   */
  const { mutate: add, isPending: adding } = useMutation({
    mutationFn: (body: typeof EMPTY) =>
      createLocation({
        ...body,
        iata: body.iata || undefined,
        sortOrder: Number(body.sortOrder) || 0
      }),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast.success(t("tr.loc.toast.added"));
    },
    onError: (e) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ?? t("tr.loc.toast.addFailed")
      )
  });

  /**
   * Not optimistic either: the server may refuse the new name (blank, or
   * already another location's), and a rename moves every hotel, restaurant
   * and listing in that city along with it.
   */
  const { mutate: saveEdit, isPending: saving } = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof EMPTY }) =>
      updateLocation(id, {
        ...body,
        // Sent even when blank, so a code can be removed.
        iata: body.iata,
        sortOrder: Number(body.sortOrder) || 0
      }),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      toast.success(t("tr.loc.toast.saved"));
    },
    onError: (e) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ?? t("tr.loc.toast.saveFailed")
      )
  });

  const { mutate: addRoute } = useMutation({
    mutationFn: (body: { vertical: string; originId: string; destinationId: string }) =>
      createRoute(body),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routes", routeVertical] });
      toast.success(t("tr.loc.toast.routeAdded"));
    },
    onError: (e) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ?? t("tr.loc.toast.routeAddFailed")
      )
  });

  const { mutate: toggleRoute } = useOptimisticMutation<
    unknown,
    { id: string; isActive: boolean },
    { items: { id: string; isActive: boolean }[] }
  >({
    mutationFn: ({ id, isActive }) => updateRoute(id, { isActive }),
    queryKey: ["routes", routeVertical],
    apply: (previous, { id, isActive }) =>
      previous && {
        ...previous,
        items: previous.items.map((r) => (r.id === id ? { ...r, isActive } : r))
      },
    errorMessage: t("tr.loc.toast.routeFailed")
  });

  const closeForm = () => {
    setDraft({ ...EMPTY });
    setEditing(null);
    setShowNew(false);
  };

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return toast.error(t("tr.loc.nameRequired"));
    if (editing) saveEdit({ id: editing.id, body: draft }, { onSuccess: closeForm });
    else add(draft, { onSuccess: closeForm });
  }

  const edit = (l: ServiceLocation) => {
    setDraft({
      name: l.name,
      province: l.province ?? "",
      iata: l.iata ?? "",
      servesVerticals: l.servesVerticals,
      sortOrder: l.sortOrder,
      // Copied, or saving the edit would clear the photo.
      image: l.image ?? ""
    });
    setEditing(l);
    setShowNew(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Off the website's search and tiles; nothing is deleted. Asks when it strands stock. */
  const setActive = (l: ServiceLocation, isActive: boolean) => {
    if (
      !isActive &&
      l.listingCount > 0 &&
      !window.confirm(
        t(isOne(locale, l.listingCount) ? "tr.loc.confirmOff.one" : "tr.loc.confirmOff.other", {
          name: l.name,
          n: l.listingCount
        })
      )
    ) {
      return;
    }
    toggleActive({ id: l.id, isActive });
  };

  const pairable = locations.filter((l) => l.servesVerticals.includes(routeVertical));

  return (
    <AdminLayout title={t("nav.locations")}>
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("tr.loc.title")}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {t("tr.loc.intro")}
              </p>
            </div>
            {canWrite && (
              <Button onClick={() => (showNew ? closeForm() : setShowNew(true))}>
                <Plus className="me-1.5 size-4" />
                {t("tr.loc.add")}
              </Button>
            )}
          </div>

          {canWrite && showNew && (
            <form
              onSubmit={submitNew}
              className="mt-5 grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <p className="text-sm font-medium sm:col-span-2 lg:col-span-4">
                {editing ? t("tr.loc.editTitle", { name: editing.name }) : t("tr.loc.newTitle")}
                {editing ? (
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {t("tr.loc.renameHint")}
                  </span>
                ) : null}
              </p>
              <label className="text-sm">
                <span className="mb-1 block font-medium">{t("tr.loc.cityName")}</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Kolwezi"
                  autoFocus
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">{t("tr.loc.province")}</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={draft.province}
                  onChange={(e) => setDraft({ ...draft, province: e.target.value })}
                  placeholder="Lualaba"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">
                  {t("tr.loc.code")}{" "}
                  <span className="text-muted-foreground">{t("tr.loc.flightsOnly")}</span>
                </span>
                <input
                  className="w-full rounded-md border px-3 py-2 uppercase"
                  value={draft.iata}
                  // 3 for IATA; 4 for an airfield known only by its ICAO code.
                  maxLength={4}
                  onChange={(e) => setDraft({ ...draft, iata: e.target.value.toUpperCase() })}
                  placeholder="KWZ"
                />
              </label>
              <div className="text-sm">
                <span className="mb-1 block font-medium">{t("tr.loc.sells")}</span>
                <div className="flex flex-wrap gap-1">
                  {VERTICALS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          servesVerticals: draft.servesVerticals.includes(v)
                            ? draft.servesVerticals.filter((x) => x !== v)
                            : [...draft.servesVerticals, v]
                        })
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium",
                        draft.servesVerticals.includes(v)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {label(VERTICAL, v)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="text-sm">
                <span className="mb-1 block font-medium">
                  {t("tr.loc.position")}{" "}
                  <span className="text-muted-foreground">{t("tr.loc.lowestFirst")}</span>
                </span>
                <input
                  type="number"
                  className="w-full rounded-md border px-3 py-2"
                  value={draft.sortOrder}
                  onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                />
              </label>
              <div className="sm:col-span-2 lg:col-span-4">
                <ImageUploader
                  label={t("tr.loc.photo")}
                  single
                  folder="locations"
                  value={draft.image ? [draft.image] : []}
                  onChange={(next) => setDraft({ ...draft, image: next[0] ?? "" })}
                />
              </div>
              <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
                <Button type="submit" disabled={adding || saving}>
                  {editing ? t("tr.loc.saveChanges") : t("tr.loc.save")}
                </Button>
                <Button type="button" variant="ghost" onClick={closeForm}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          )}

          {isLoading ? (
            <p className="mt-5 text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : isError ? (
            <QueryError onRetry={() => refetch()} />
          ) : (
            <div className="mt-5 overflow-x-auto">
              <div className="relative mb-3 max-w-xs">
                <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="h-9 w-full rounded-md border bg-transparent ps-9 pe-3 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("tr.loc.searchPlaceholder")}
                  aria-label={t("tr.loc.searchAria")}
                />
              </div>
              <table className="w-full text-sm">
                <thead className="text-start text-xs uppercase text-muted-foreground">
                  <tr>
                    <th aria-sort={sortState(sort, "city")} className="py-2">
                      <SortButton column="city" {...head}>
                        {t("common.city")}
                      </SortButton>
                    </th>
                    <th aria-sort={sortState(sort, "iata")}>
                      <SortButton column="iata" {...head}>
                        {t("tr.loc.codeColumn")}
                      </SortButton>
                    </th>
                    <th aria-sort={sortState(sort, "sells")}>
                      <SortButton column="sells" {...head}>
                        {t("tr.loc.sells")}
                      </SortButton>
                    </th>
                    <th aria-sort={sortState(sort, "listings")}>
                      <SortButton column="listings" {...head}>
                        {t("tr.loc.listings")}
                      </SortButton>
                    </th>
                    <th aria-sort={sortState(sort, "status")}>
                      <SortButton column="status" {...head}>
                        {t("common.status")}
                      </SortButton>
                    </th>
                    {canWrite ? <th className="text-end">{t("common.actions")}</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {!rows.length ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        {needle ? t("tr.loc.noMatch") : t("tr.loc.empty")}
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5">
                        <span className="font-medium">{l.name}</span>
                        {l.province && (
                          <span className="ms-2 text-xs text-muted-foreground">
                            {l.province}
                          </span>
                        )}
                      </td>
                      <td className="tabular-nums text-muted-foreground">{l.iata || "—"}</td>
                      <td>
                        <div className="flex flex-wrap gap-1 py-1">
                          {VERTICALS.map((v) => (
                            <button
                              key={v}
                              type="button"
                              title={
                                canWrite
                                  ? t("tr.loc.toggle", { name: label(VERTICAL, v) })
                                  : label(VERTICAL, v)
                              }
                              disabled={!canWrite}
                              onClick={() => toggleVertical({ location: l, vertical: v })}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                l.servesVerticals.includes(v)
                                  ? "bg-primary/10 text-primary"
                                  : "text-muted-foreground/40 enabled:hover:text-muted-foreground"
                              )}
                            >
                              {v.slice(0, 4)}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="tabular-nums text-muted-foreground">{l.listingCount}</td>
                      <td>
                        {l.isActive ? (
                          <Badge
                            variant="secondary"
                            className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          >
                            {t("tr.loc.active")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{t("tr.loc.inactive")}</Badge>
                        )}
                        {/* The count is the warning: switching off a city that
                            still has inventory on sale strands it. */}
                        {l.isActive && l.listingCount > 0 ? (
                          <span
                            className="ms-1.5 inline-flex items-center align-middle text-amber-600"
                            title={t("tr.loc.stillListed", { n: l.listingCount })}
                          >
                            <AlertTriangle className="size-3.5" />
                          </span>
                        ) : null}
                      </td>
                      {canWrite ? (
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1.5 px-2 text-xs"
                              onClick={() => edit(l)}
                            >
                              <Pencil className="size-3.5" />
                              {t("common.edit")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "h-7 w-[86px] px-2 text-xs",
                                !l.isActive &&
                                  "text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                              )}
                              title={
                                l.isActive
                                  ? t("tr.loc.offTitle")
                                  : t("tr.loc.onTitle")
                              }
                              onClick={() => setActive(l, !l.isActive)}
                            >
                              {l.isActive ? t("tr.loc.deactivate") : t("tr.loc.activate")}
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3">
                <Pager {...pager} noun={t("tr.loc.noun")} plural={t("tr.loc.plural")} />
              </div>
            </div>
          )}
        </Card>

        {/* ------------------------------------------------------- routes */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold">{t("tr.loc.routesTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("tr.loc.routesIntro")}
          </p>

          <div className="mt-4 flex gap-1">
            {PAIR_VERTICALS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setRouteVertical(v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  routeVertical === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {canWrite && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">{t("tr.loc.from")}</span>
                <OptionSelect
                  className="min-w-48"
                  value={pair.originId}
                  onChange={(v) => setPair({ ...pair, originId: v })}
                  options={[
                    { value: "", label: t("tr.loc.select") },
                    ...pairable.map((l) => ({ value: l.id, label: l.name }))
                  ]}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">{t("tr.loc.to")}</span>
                <OptionSelect
                  className="min-w-48"
                  value={pair.destinationId}
                  onChange={(v) => setPair({ ...pair, destinationId: v })}
                  options={[
                    { value: "", label: t("tr.loc.select") },
                    ...pairable.map((l) => ({ value: l.id, label: l.name }))
                  ]}
                />
              </label>
              <Button
                onClick={() => {
                  if (!pair.originId || !pair.destinationId) return toast.error(t("tr.loc.pickBoth"));
                  addRoute({ vertical: routeVertical, ...pair });
                  setPair({ originId: "", destinationId: "" });
                }}
              >
                <Plus className="me-1.5 size-4" />
                {t("tr.loc.addRoute")}
              </Button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {(routes?.items ?? []).map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={!canWrite}
                onClick={() => toggleRoute({ id: r.id, isActive: !r.isActive })}
                title={
                  !canWrite
                    ? r.isActive ? t("tr.loc.routeLive") : t("tr.loc.routeOff")
                    : r.isActive ? t("tr.loc.routeSwitchOff") : t("tr.loc.routeSwitchOn")
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                  r.isActive ? "bg-background" : "opacity-45"
                )}
              >
                {r.origin?.name ?? "?"}
                <ArrowRight className="size-3.5 text-muted-foreground rtl:-scale-x-100" />
                {r.destination?.name ?? "?"}
              </button>
            ))}
            {!routes?.items.length && (
              <p className="text-sm text-muted-foreground">
                {t(NO_ROUTES[routeVertical])}
              </p>
            )}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
