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
import { OptionSelect } from "@/components/Form/OptionSelect";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import {
  CitySelect,
  localName,
  mapsLink,
  message,
  named,
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
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Link2, MapPin, Pencil, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Places: the pick-up and drop-off points the office saves for each city —
 * the airport, the big hotels, the station. Customers see them as suggestions
 * when they type where they are going, so a ride can be booked without a map.
 */

// The office's own kinds; restaurants and parkings arrive by themselves.
const KINDS = (Object.keys(PLACE_KIND) as PlaceKind[]).filter((k) => k !== "RESTAURANT" && k !== "PARKING");

/** Where a copied place is edited: its hotel, restaurant or parking. */
const SOURCE_PAGE = {
  HOTEL: (id: string) => `/inventory/hotel/${id}`,
  RESTAURANT: (id: string) => `/inventory/restaurant/${id}`,
  PARKING: (id: string) => `/vehicle-sales/parkings/${id}`
} as const;

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
  const { t } = useT();
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
      toast.success(editing ? t("tr.places.saved") : t("tr.places.added"));
      close();
      refresh();
    },
    onError: (e) => {
      toast.error(message(e, t("tr.places.saveFailed")));
      // 409: saved by someone else meanwhile. Re-read, or the same old version is refused again.
      if ((e as AxiosError).response?.status === 409) refresh();
    }
  });

  const { mutate: setActive } = useMutation({
    mutationFn: (p: TransferPlace) => updatePlace(p.id, { isActive: !p.isActive }),
    meta: { showToast: false },
    onSuccess: (_r, p) => {
      toast.success(p.isActive ? t("tr.places.switchedOffToast") : t("tr.places.switchedOnToast"));
      refresh();
    },
    onError: (e) => toast.error(message(e, t("tr.places.changeFailed")))
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
      title={t("nav.transfers.places")}
      description={t("tr.places.description")}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-8"
              placeholder={t("common.name")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CitySelect any value={city} onChange={setCity} />
          {canWrite ? (
            <Button
              size="sm"
              className="ms-auto gap-2"
              onClick={() => {
                setEditing(null);
                setDraft(blank(city));
                setShowForm((open) => !open || Boolean(editing));
              }}
            >
              <Plus className="size-4" />
              {t("tr.places.add")}
            </Button>
          ) : null}
        </div>

        {canWrite && showForm ? (
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">
              {editing ? t("tr.places.edit", { name: localName(editing.name) }) : t("tr.places.new")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-4">
                <CitySelect
                  required
                  value={draft.city}
                  onChange={(next) => setDraft((d) => ({ ...d, city: next }))}
                />
                <LocalizedInput
                  label={t("common.name")}
                  required
                  maxLength={120}
                  placeholder={t("tr.places.namePlaceholder")}
                  value={draft.name}
                  onChange={(name) => setDraft((d) => ({ ...d, name }))}
                />
                <div>
                  <Label className="text-xs">{t("tr.places.kind")}</Label>
                  <OptionSelect
                    aria-label={t("tr.places.kind")}
                    value={draft.kind}
                    onChange={(v) => setDraft((d) => ({ ...d, kind: v as PlaceKind }))}
                    options={KINDS.map((k) => ({ value: k, label: t(PLACE_KIND[k]) }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("tr.places.order")}</Label>
                  <Input
                    type="number"
                    step={1}
                    value={draft.sortOrder}
                    onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("tr.places.orderHint")}
                  </p>
                </div>
                <label className="flex items-center gap-3 text-sm">
                  <Switch
                    checked={draft.isActive}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, isActive: v }))}
                  />
                  {t("tr.places.active")}
                </label>
              </div>
              <div>
                <LocationPicker
                  label={t("tr.places.where")}
                  city={draft.city}
                  value={draft.geo}
                  onChange={(geo) => setDraft((d) => ({ ...d, geo }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("tr.places.pinHint")}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" disabled={!canSave || saving} onClick={() => save()}>
                {editing ? t("tr.places.save") : t("tr.places.add")}
              </Button>
              <Button size="sm" variant="ghost" onClick={close}>
                {t("common.cancel")}
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
                  <TableHead>{t("tr.places.colPlace")}</TableHead>
                  <TableHead>{t("common.city")}</TableHead>
                  <TableHead>{t("tr.places.kind")}</TableHead>
                  <TableHead>{t("tr.places.colPosition")}</TableHead>
                  <TableHead className="text-end">{t("tr.places.order")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  {canWrite ? <TableHead className="text-end">{t("common.actions")}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">
                      {t("common.loading")}
                    </TableCell>
                  </TableRow>
                ) : !rows.length ? (
                  <TableRow>
                    <TableCell colSpan={columns} className="py-10 text-center text-sm text-muted-foreground">
                      {needle || city ? t("tr.places.emptyFiltered") : t("tr.places.empty")}
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
                        {p.source ? (
                          <Link
                            href={SOURCE_PAGE[p.source.kind](p.source.id)}
                            title={t("tr.places.linkedHint")}
                            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                          >
                            <Link2 className="size-3" />
                            {t(`tr.places.linked.${p.source.kind}`)}
                          </Link>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">{p.city}</TableCell>
                      <TableCell className="text-sm">{named(t, PLACE_KIND, p.kind)}</TableCell>
                      <TableCell>
                        <a
                          href={mapsLink(p.lat, p.lng)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:underline"
                          title={t("tr.places.openMaps")}
                        >
                          <MapPin className="size-3" />
                          <span dir="ltr">
                            {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                          </span>
                        </a>
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {p.sortOrder}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.isActive ? "secondary" : "outline"}>
                          {p.isActive ? t("tr.places.suggested") : t("tr.places.switchedOff")}
                        </Badge>
                      </TableCell>
                      {canWrite ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {/* A copied place is edited on its own page; here only on/off. */}
                            {p.source ? null : (
                              <Button variant="ghost" size="icon" title={t("common.edit")} onClick={() => edit(p)}>
                                <Pencil className="size-4" />
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => setActive(p)}>
                              {p.isActive ? t("tr.places.switchOff") : t("tr.places.switchOn")}
                            </Button>
                            {p.source ? null : (
                              <DeleteButton
                                permission="inventory:delete"
                                what={t("tr.places.deleteWhat", { name: localName(p.name) })}
                                consequence={t("tr.places.deleteConsequence")}
                                onDelete={() => deletePlace(p.id)}
                                onDeleted={refresh}
                              />
                            )}
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
        <Pager {...pager} noun={t("tr.places.noun")} plural={t("tr.places.plural")} />
      </div>
    </AdminLayout>
  );
}
