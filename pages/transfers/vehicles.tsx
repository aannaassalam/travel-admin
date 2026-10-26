import {
  createVehicle,
  deleteVehicle,
  listCategories,
  listVehicles,
  updateVehicle,
  uploadTransferImage,
  type Vehicle
} from "@/api/functions/transfers.api";
import DeleteButton from "@/components/DeleteButton";
import AssetImage from "@/components/Form/AssetImage";
import ImageUploader from "@/components/Form/ImageUploader";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { CitySelect, localName, message } from "@/components/Transfers/transfers.lib";
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
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Pencil, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Vehicles: the cars, per city, each of a category (which sets its price).
 * A driver is linked to the vehicle they drive under Drivers.
 */

// Number boxes hold text while typed; blank means "not set".
const BLANK = {
  city: "",
  category: "",
  make: "",
  model: "",
  year: "",
  color: "",
  plate: "",
  seats: "",
  image: "",
  isActive: true
};

// A blank box is sent as null, which the server takes as "clear it": seats go
// back to the category's. Left out instead, a seats override could never be
// removed once set.
const num = (text: string) => (text.trim() === "" ? null : Number(text));

export default function VehiclesPage() {
  const queryClient = useQueryClient();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [draft, setDraft] = useState({ ...BLANK });
  // The vehicle the form is changing; null while it adds a new one.
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["vehicles", { city, category }],
    queryFn: () => listVehicles({ city, category }),
    refetchOnMount: "always"
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
    staleTime: 60 * 1000
  });
  // The server fills the category in; a list loaded before it did falls back to ours.
  const categoryOf = (v: Vehicle) =>
    v.category ?? categories?.items.find((c) => c.id === v.categoryId);

  const needle = search.trim().toLowerCase();
  const matching = (data?.items ?? []).filter(
    (v) =>
      !needle ||
      [v.plate, v.make, v.model, v.color].some((s) => s?.toLowerCase().includes(needle))
  );
  const { rows, pager } = usePaged(matching, `${needle}|${city}|${category}`);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["vehicles"] });

  const close = () => {
    setDraft({ ...BLANK });
    setEditing(null);
    setShowForm(false);
  };

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => {
      const body = {
        city: draft.city,
        category: draft.category,
        make: draft.make.trim(),
        model: draft.model.trim(),
        year: num(draft.year),
        color: draft.color.trim(),
        plate: draft.plate.trim().toUpperCase(),
        seats: num(draft.seats),
        image: draft.image,
        isActive: draft.isActive
      };
      return editing
        ? updateVehicle(editing.id, { ...body, version: editing.version })
        : createVehicle(body);
    },
    meta: { showToast: false },
    onSuccess: () => {
      toast.success(editing ? "Vehicle saved" : "Vehicle added");
      close();
      refresh();
    },
    onError: (e) => {
      toast.error(message(e, "Could not save the vehicle"));
      // 409: saved by someone else meanwhile. Re-read, or the same old version is refused again.
      if ((e as AxiosError).response?.status === 409) refresh();
    }
  });

  const { mutate: setActive } = useMutation({
    mutationFn: (v: Vehicle) => updateVehicle(v.id, { isActive: !v.isActive }),
    meta: { showToast: false },
    onSuccess: (_r, v) => {
      toast.success(v.isActive ? "Switched off — not used for new rides" : "Switched back on");
      refresh();
    },
    onError: (e) => toast.error(message(e, "Could not change it"))
  });

  const edit = (v: Vehicle) => {
    setEditing(v);
    setDraft({
      city: v.city,
      category: v.categoryId ?? v.category?.id ?? "",
      make: v.make,
      model: v.model,
      year: v.year ? String(v.year) : "",
      color: v.color ?? "",
      plate: v.plate,
      seats: v.seats ? String(v.seats) : "",
      image: v.image ?? "",
      isActive: v.isActive
    });
    setShowForm(true);
  };

  const categoryOptions = (categories?.items ?? []).filter(
    (c) => c.isActive || c.id === draft.category
  );
  const columns = canWrite ? 7 : 6;
  const canSave =
    draft.city && draft.category && draft.make.trim() && draft.model.trim() && draft.plate.trim();

  return (
    <AdminLayout
      title="Vehicles"
      description="The cars that drive the rides, per city. The category sets the price; the driver who drives it is set under Drivers."
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Plate, make, model or colour"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CitySelect any value={city} onChange={setCity} />
          <select
            aria-label="Category"
            className="h-9 min-w-40 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {(categories?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {localName(c.name)}
              </option>
            ))}
          </select>
          {canWrite ? (
            <Button
              size="sm"
              className="ml-auto gap-2"
              onClick={() => {
                setEditing(null);
                setDraft({ ...BLANK, city, category });
                setShowForm((open) => !open || Boolean(editing));
              }}
            >
              <Plus className="size-4" />
              Add vehicle
            </Button>
          ) : null}
        </div>

        {canWrite && showForm ? (
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">
              {editing ? `Edit ${editing.plate}` : "New vehicle"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CitySelect
                required
                value={draft.city}
                onChange={(next) => setDraft((d) => ({ ...d, city: next }))}
              />
              <div>
                <Label className="text-xs">Category *</Label>
                <select
                  aria-label="Category"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                >
                  <option value="">Choose…</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {localName(c.name)}
                      {c.isActive ? "" : " (switched off)"}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Sets what the customer pays.{" "}
                  <Link href="/transfers/categories" className="underline underline-offset-2">
                    Vehicle categories
                  </Link>
                </p>
              </div>
              <div>
                <Label className="text-xs">Plate *</Label>
                <Input
                  value={draft.plate}
                  maxLength={20}
                  placeholder="1234 AB 05"
                  className="uppercase"
                  onChange={(e) => setDraft((d) => ({ ...d, plate: e.target.value.toUpperCase() }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">One plate per city.</p>
              </div>
              <div>
                <Label className="text-xs">Make *</Label>
                <Input
                  value={draft.make}
                  maxLength={60}
                  placeholder="Toyota"
                  onChange={(e) => setDraft((d) => ({ ...d, make: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Model *</Label>
                <Input
                  value={draft.model}
                  maxLength={60}
                  placeholder="Corolla"
                  onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Year</Label>
                  <Input
                    type="number"
                    min={1980}
                    max={2100}
                    value={draft.year}
                    onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Colour</Label>
                  <Input
                    value={draft.color}
                    maxLength={30}
                    placeholder="White"
                    onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Seats</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={draft.seats}
                    placeholder="category"
                    onChange={(e) => setDraft((d) => ({ ...d, seats: e.target.value }))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-3 self-end pb-2 text-sm">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, isActive: v }))}
                />
                Active — can be given to a driver
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <ImageUploader
                  label="Photo"
                  folder="transfers"
                  single
                  upload={uploadTransferImage}
                  value={draft.image ? [draft.image] : []}
                  onChange={(next) => setDraft((d) => ({ ...d, image: next[0] ?? "" }))}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" disabled={!canSave || saving} onClick={() => save()}>
                {editing ? "Save vehicle" : "Add vehicle"}
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
                  <TableHead>Plate</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="text-right">Seats</TableHead>
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
                      {needle || city || category
                        ? "No vehicle matches that."
                        : "No vehicles yet. Add the cars of each city, then give each driver theirs."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((v) => (
                    <TableRow key={v.id} className={v.isActive ? "" : "opacity-60"}>
                      <TableCell className="font-mono text-sm font-medium">{v.plate}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <AssetImage src={v.image} title={v.plate} className="h-9 w-14 object-cover" />
                          <div>
                            <p className="text-sm font-medium">
                              {v.make} {v.model}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {[v.year, v.color].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {localName(categoryOf(v)?.name) || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{v.city}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {v.seats ?? (
                          <span title="The category's">{categoryOf(v)?.seats ?? "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={v.isActive ? "secondary" : "outline"}>
                          {v.isActive ? "Active" : "Switched off"}
                        </Badge>
                      </TableCell>
                      {canWrite ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Edit" onClick={() => edit(v)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setActive(v)}>
                              {v.isActive ? "Switch off" : "Switch on"}
                            </Button>
                            <DeleteButton
                              permission="inventory:delete"
                              what={`the vehicle ${v.plate}`}
                              consequence="Refused while a ride is booked on it. Its drivers lose their vehicle until they are given another; past rides keep its details."
                              onDelete={() => deleteVehicle(v.id)}
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
        <Pager {...pager} noun="vehicle" />
      </div>
    </AdminLayout>
  );
}
