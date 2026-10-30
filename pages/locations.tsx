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
import { label, VERTICAL } from "@/lib/functions/labels.lib";
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
    successMessage: "Location updated",
    errorMessage: "Could not change that location"
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
    errorMessage: "Could not change what that city sells"
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
      toast.success("Location added");
    },
    onError: (e) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ?? "Could not add"
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
      toast.success("Location saved");
    },
    onError: (e) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ?? "Could not save"
      )
  });

  const { mutate: addRoute } = useMutation({
    mutationFn: (body: { vertical: string; originId: string; destinationId: string }) =>
      createRoute(body),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routes", routeVertical] });
      toast.success("Route added");
    },
    onError: (e) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ?? "Could not add route"
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
    errorMessage: "Could not change that route"
  });

  const closeForm = () => {
    setDraft({ ...EMPTY });
    setEditing(null);
    setShowNew(false);
  };

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return toast.error("A name is required");
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
        `${l.name} still has ${l.listingCount} published listing${l.listingCount === 1 ? "" : "s"}.\n\nDeactivated, the city leaves the website's search and customers can no longer find them by it. Nothing is deleted, and you can activate it again at any time.\n\nDeactivate ${l.name}?`
      )
    ) {
      return;
    }
    toggleActive({ id: l.id, isActive });
  };

  const pairable = locations.filter((l) => l.servesVerticals.includes(routeVertical));

  return (
    <AdminLayout title="Locations">
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Serviced locations</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Everything the website offers comes from this list — search
                suggestions, popular destinations and the homepage tiles. A
                listing cannot be saved for a place that is not here. The first
                8 cities by position show on the home page; give each a photo.
              </p>
            </div>
            {canWrite && (
              <Button onClick={() => (showNew ? closeForm() : setShowNew(true))}>
                <Plus className="mr-1.5 size-4" />
                Add location
              </Button>
            )}
          </div>

          {canWrite && showNew && (
            <form
              onSubmit={submitNew}
              className="mt-5 grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <p className="text-sm font-medium sm:col-span-2 lg:col-span-4">
                {editing ? `Edit ${editing.name}` : "New location"}
                {editing ? (
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Changing the name also renames it on every hotel, restaurant
                    and listing in this city. The website address of the city
                    stays the same.
                  </span>
                ) : null}
              </p>
              <label className="text-sm">
                <span className="mb-1 block font-medium">City name</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Kolwezi"
                  autoFocus
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Province</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={draft.province}
                  onChange={(e) => setDraft({ ...draft, province: e.target.value })}
                  placeholder="Lualaba"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">
                  IATA / ICAO code <span className="text-muted-foreground">(flights only)</span>
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
                <span className="mb-1 block font-medium">Sells</span>
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
                  Position <span className="text-muted-foreground">(lowest first)</span>
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
                  label="Photo"
                  single
                  folder="locations"
                  value={draft.image ? [draft.image] : []}
                  onChange={(next) => setDraft({ ...draft, image: next[0] ?? "" })}
                />
              </div>
              <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
                <Button type="submit" disabled={adding || saving}>
                  {editing ? "Save changes" : "Save location"}
                </Button>
                <Button type="button" variant="ghost" onClick={closeForm}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {isLoading ? (
            <p className="mt-5 text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <QueryError onRetry={() => refetch()} />
          ) : (
            <div className="mt-5 overflow-x-auto">
              <div className="relative mb-3 max-w-xs">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="h-9 w-full rounded-md border bg-transparent pl-9 pr-3 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="City, province or IATA…"
                  aria-label="Search locations"
                />
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th aria-sort={sortState(sort, "city")} className="py-2">
                      <SortButton column="city" {...head}>
                        City
                      </SortButton>
                    </th>
                    <th aria-sort={sortState(sort, "iata")}>
                      <SortButton column="iata" {...head}>
                        IATA / ICAO
                      </SortButton>
                    </th>
                    <th aria-sort={sortState(sort, "sells")}>
                      <SortButton column="sells" {...head}>
                        Sells
                      </SortButton>
                    </th>
                    <th aria-sort={sortState(sort, "listings")}>
                      <SortButton column="listings" {...head}>
                        Listings
                      </SortButton>
                    </th>
                    <th aria-sort={sortState(sort, "status")}>
                      <SortButton column="status" {...head}>
                        Status
                      </SortButton>
                    </th>
                    {canWrite ? <th className="text-right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {!rows.length ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        {needle ? "No locations match that." : "No locations yet."}
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5">
                        <span className="font-medium">{l.name}</span>
                        {l.province && (
                          <span className="ml-2 text-xs text-muted-foreground">
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
                                  ? `Toggle ${label(VERTICAL, v)}`
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
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                        {/* The count is the warning: switching off a city that
                            still has inventory on sale strands it. */}
                        {l.isActive && l.listingCount > 0 ? (
                          <span
                            className="ml-1.5 inline-flex items-center align-middle text-amber-600"
                            title={`${l.listingCount} published listing(s) still name this city`}
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
                              Edit
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
                                  ? "Take this city off the website"
                                  : "Put this city back on the website"
                              }
                              onClick={() => setActive(l, !l.isActive)}
                            >
                              {l.isActive ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3">
                <Pager {...pager} noun="location" />
              </div>
            </div>
          )}
        </Card>

        {/* ------------------------------------------------------- routes */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Serviced routes</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Flights and coaches are sold as a pair, so the website only offers a
            destination once a route to it exists. Without this, listing two
            cities would imply we travel between every pair we touch.
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
                <span className="mb-1 block font-medium">From</span>
                <select
                  className="rounded-md border px-3 py-2"
                  value={pair.originId}
                  onChange={(e) => setPair({ ...pair, originId: e.target.value })}
                >
                  <option value="">Select…</option>
                  {pairable.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">To</span>
                <select
                  className="rounded-md border px-3 py-2"
                  value={pair.destinationId}
                  onChange={(e) => setPair({ ...pair, destinationId: e.target.value })}
                >
                  <option value="">Select…</option>
                  {pairable.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                onClick={() => {
                  if (!pair.originId || !pair.destinationId) return toast.error("Pick both ends");
                  addRoute({ vertical: routeVertical, ...pair });
                  setPair({ originId: "", destinationId: "" });
                }}
              >
                <Plus className="mr-1.5 size-4" />
                Add route
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
                    ? r.isActive ? "Live" : "Off"
                    : r.isActive ? "Switch this route off" : "Switch this route on"
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                  r.isActive ? "bg-background" : "opacity-45"
                )}
              >
                {r.origin?.name ?? "?"}
                <ArrowRight className="size-3.5 text-muted-foreground" />
                {r.destination?.name ?? "?"}
              </button>
            ))}
            {!routes?.items.length && (
              <p className="text-sm text-muted-foreground">
                No {routeVertical.toLowerCase()} routes yet.
              </p>
            )}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
