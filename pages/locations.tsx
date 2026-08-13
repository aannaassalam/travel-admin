import {
  createLocation,
  createRoute,
  listLocations,
  listRoutes,
  updateLocation,
  updateRoute,
  type ServiceLocation
} from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useOptimisticMutation } from "@/hooks/useOptimisticMutation";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { AlertTriangle, ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Where the business operates.
 *
 * §12/§15: opening a city must not need a developer. Everything the public
 * search box offers — the suggestions, the popular-destination chips, the
 * homepage tiles — reads from this screen, and a listing cannot name a place
 * that is not on it.
 */

const VERTICALS = ["FLIGHT", "HOTEL", "BUS", "CAR", "ACTIVITY", "PROPERTY"] as const;
/** Only these two are sold as an origin→destination pair. */
const PAIR_VERTICALS = ["FLIGHT", "BUS"] as const;

const EMPTY = {
  name: "",
  province: "",
  iata: "",
  servesVerticals: [] as string[],
  sortOrder: 0
};

export default function LocationsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ ...EMPTY });
  const [showNew, setShowNew] = useState(false);
  const [routeVertical, setRouteVertical] = useState<string>("FLIGHT");
  const [pair, setPair] = useState({ originId: "", destinationId: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: listLocations
  });
  const { data: routes } = useQuery({
    queryKey: ["routes", routeVertical],
    queryFn: () => listRoutes(routeVertical)
  });

  const locations = data?.items ?? [];

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

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return toast.error("A name is required");
    add(draft, {
      onSuccess: () => {
        setDraft({ ...EMPTY });
        setShowNew(false);
      }
    });
  }

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
                listing cannot be saved for a place that is not here.
              </p>
            </div>
            <Button onClick={() => setShowNew((v) => !v)}>
              <Plus className="mr-1.5 size-4" />
              Add location
            </Button>
          </div>

          {showNew && (
            <form
              onSubmit={submitNew}
              className="mt-5 grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4"
            >
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
                  IATA <span className="text-muted-foreground">(flights only)</span>
                </span>
                <input
                  className="w-full rounded-md border px-3 py-2 uppercase"
                  value={draft.iata}
                  maxLength={3}
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
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <Button type="submit" disabled={adding}>
                  Save location
                </Button>
              </div>
            </form>
          )}

          {isLoading ? (
            <p className="mt-5 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">City</th>
                    <th>IATA</th>
                    <th>Sells</th>
                    <th>Listings</th>
                    <th className="text-right">Live</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {locations.map((l) => (
                    <tr key={l.id} className={cn(!l.isActive && "opacity-50")}>
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
                              title={`Toggle ${v}`}
                              onClick={() => toggleVertical({ location: l, vertical: v })}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                l.servesVerticals.includes(v)
                                  ? "bg-primary/10 text-primary"
                                  : "text-muted-foreground/40 hover:text-muted-foreground"
                              )}
                            >
                              {v.slice(0, 4)}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="tabular-nums text-muted-foreground">{l.listingCount}</td>
                      <td className="text-right">
                        {/* The count is the warning: switching off a city that
                            still has inventory on sale strands it. */}
                        {l.isActive && l.listingCount > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-amber-600"
                            title={`${l.listingCount} published listing(s) still name this city`}
                          >
                            <AlertTriangle className="size-3.5" />
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => toggleActive({ id: l.id, isActive: !l.isActive })}
                          className={cn(
                            "ml-2 rounded-full px-2.5 py-1 text-xs font-semibold",
                            l.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {l.isActive ? "Live" : "Off"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

          <div className="mt-4 flex flex-wrap gap-2">
            {(routes?.items ?? []).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRoute({ id: r.id, isActive: !r.isActive })}
                title={r.isActive ? "Switch this route off" : "Switch this route on"}
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
