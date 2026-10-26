import {
  createPlace,
  deletePlace,
  listPlaces,
  updatePlace,
  type PlaceKind,
  type TransferPlace
} from "@/api/functions/transfers.api";
import DeleteButton from "@/components/DeleteButton";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import LocationPicker, { type Geo } from "@/components/Form/LocationPicker";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import {
  CitySelect,
  localName,
  mapsLink,
  message,
  PLACE_KIND
} from "@/components/Transfers/transfers.lib";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { label } from "@/lib/functions/labels.lib";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { MapPin, Pencil, Plus, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Places: the pick-up and drop-off points the office saves for each city —
 * the airport, the big hotels, the station. Customers see them as suggestions
 * when they type where they are going, so a ride can be booked without a map.
 */

const KINDS = Object.keys(PLACE_KIND) as PlaceKind[];

type Form = {
  city: string;
  name: Localized;
  kind: PlaceKind;
  geo: Geo;
  sortOrder: string;
  isActive: boolean;
};

const blank = (city = ""): Form => ({
  city,
  name: {},
  kind: "LANDMARK",
  geo: null,
  sortOrder: "0",
  isActive: true
});

export default function PlacesPage() {
  const queryClient = useQueryClient();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [draft, setDraft] = useState<Form>(blank());
  // The place the form is changing; null while it adds a new one.
  const [editing, setEditing] = useState<TransferPlace | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["places", { city }],
    queryFn: () => listPlaces({ city }),
    refetchOnMount: "always"
  });
  const needle = search.trim().toLowerCase();
  const matching = (data?.items ?? []).filter(
    (p) =>
      !needle || Object.values(p.name ?? {}).some((v) => v?.toLowerCase().includes(needle))
  );
  const { rows, pager } = usePaged(matching, `${needle}|${city}`);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["places"] });

  const close = () => {
    setDraft(blank());
    setEditing(null);
    setShowForm(false);
  };

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => {
      const body = {
        city: draft.city,
        name: draft.name,
        kind: draft.kind,
        lat: draft.geo?.lat,
        lng: draft.geo?.lng,
        sortOrder: Number(draft.sortOrder) || 0,
        isActive: draft.isActive
      };
      return editing
        ? updatePlace(editing.id, { ...body, version: editing.version })
        : createPlace(body);
    },
    meta: { showToast: false },
    onSuccess: () => {
      toast.success(
        `${editing ? "Place saved" : "Place added"} — the website suggests it within a minute`
      );
      close();
      refresh();
    },
    onError: (e) => {
      toast.error(message(e, "Could not save the place"));
      // 409: saved by someone else meanwhile. Re-read, or the same old version is refused again.
      if ((e as AxiosError).response?.status === 409) refresh();
    }
  });

  const { mutate: setActive } = useMutation({
    mutationFn: (p: TransferPlace) => updatePlace(p.id, { isActive: !p.isActive }),
    meta: { showToast: false },
    onSuccess: (_r, p) => {
      toast.success(p.isActive ? "Switched off — no longer suggested" : "Switched back on");
      refresh();
    },
    onError: (e) => toast.error(message(e, "Could not change it"))
  });

  const edit = (p: TransferPlace) => {
    setEditing(p);
    setDraft({
      city: p.city,
      name: p.name ?? {},
      kind: p.kind,
      geo: { lat: p.lat, lng: p.lng },
      sortOrder: String(p.sortOrder ?? 0),
      isActive: p.isActive
    });
    setShowForm(true);
  };

  const canSave = Boolean(draft.city && draft.name.fr?.trim() && draft.geo);
  const columns = canWrite ? 7 : 6;

  return (
    <AdminLayout
      title="Places"
      description="Pick-up and drop-off points suggested to customers, per city: the airport, the main hotels, the station…"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CitySelect any value={city} onChange={setCity} />
          {canWrite ? (
            <Button
              size="sm"
              className="ml-auto gap-2"
              onClick={() => {
                setEditing(null);
                setDraft(blank(city));
                setShowForm((open) => !open || Boolean(editing));
              }}
            >
              <Plus className="size-4" />
              Add place
            </Button>
          ) : null}
        </div>

        {canWrite && showForm ? (
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">
              {editing ? `Edit ${localName(editing.name)}` : "New place"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-4">
                <CitySelect
                  required
                  value={draft.city}
                  onChange={(next) => setDraft((d) => ({ ...d, city: next }))}
                />
                <LocalizedInput
                  label="Name"
                  required
                  maxLength={120}
                  placeholder="Aéroport de Ndjili, Hôtel Memling…"
                  value={draft.name}
                  onChange={(name) => setDraft((d) => ({ ...d, name }))}
                />
                <div>
                  <Label className="text-xs">Kind</Label>
                  <select
                    aria-label="Kind"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                    value={draft.kind}
                    onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as PlaceKind }))}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {PLACE_KIND[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Order</Label>
                  <Input
                    type="number"
                    step={1}
                    value={draft.sortOrder}
                    onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Lowest first among the suggestions.
                  </p>
                </div>
                <label className="flex items-center gap-3 text-sm">
                  <Switch
                    checked={draft.isActive}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, isActive: v }))}
                  />
                  Active — suggested to customers
                </label>
              </div>
              <div>
                <LocationPicker
                  label="Where it is *"
                  city={draft.city}
                  value={draft.geo}
                  onChange={(geo) => setDraft((d) => ({ ...d, geo }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  The pin is where the driver goes: put it at the entrance customers use.
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" disabled={!canSave || saving} onClick={() => save()}>
                {editing ? "Save place" : "Add place"}
              </Button>
              <Button size="sm" variant="ghost" onClick={close}>
                Cancel
              </Button>
            </div>
          </Card>
        ) : null}

        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Place</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead className="text-right">Order</TableHead>
                  <TableHead>Status</TableHead>
                  {canWrite ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : !rows.length ? (
                  <TableRow>
                    <TableCell colSpan={columns} className="py-10 text-center text-sm text-muted-foreground">
                      {needle || city
                        ? "No place matches that."
                        : "No places yet. Add the airport, the main hotels and the station of each city, and customers can pick them without a map."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((p) => (
                    <TableRow key={p.id} className={p.isActive ? "" : "opacity-60"}>
                      <TableCell>
                        <p className="font-medium">{localName(p.name)}</p>
                        {p.name.en && p.name.en !== p.name.fr ? (
                          <p className="text-xs text-muted-foreground">{p.name.en}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">{p.city}</TableCell>
                      <TableCell className="text-sm">{label(PLACE_KIND, p.kind)}</TableCell>
                      <TableCell>
                        <a
                          href={mapsLink(p.lat, p.lng)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:underline"
                          title="Open in Google Maps"
                        >
                          <MapPin className="size-3" />
                          {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                        </a>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {p.sortOrder}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.isActive ? "secondary" : "outline"}>
                          {p.isActive ? "Suggested" : "Switched off"}
                        </Badge>
                      </TableCell>
                      {canWrite ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Edit" onClick={() => edit(p)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setActive(p)}>
                              {p.isActive ? "Switch off" : "Switch on"}
                            </Button>
                            <DeleteButton
                              permission="inventory:delete"
                              what={`the place “${localName(p.name)}”`}
                              consequence="Rides already booked keep the address. Switching it off keeps it here instead."
                              onDelete={() => deletePlace(p.id)}
                              onDeleted={refresh}
                            />
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager {...pager} noun="place" />
      </div>
    </AdminLayout>
  );
}
