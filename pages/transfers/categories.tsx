import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  uploadTransferImage,
  type VehicleCategory
} from "@/api/functions/transfers.api";
import DeleteButton from "@/components/DeleteButton";
import AssetImage from "@/components/Form/AssetImage";
import ImageUploader from "@/components/Form/ImageUploader";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import MoneyInput, { formToMoney, moneyToForm } from "@/components/Form/MoneyInput";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { localName, message } from "@/components/Transfers/transfers.lib";
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
import { formatMoney } from "@/lib/functions/format.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Vehicle categories: what a ride costs. The customer picks a category
 * (Berline, SUV, Minibus…) and the server prices the ride from it — per km for
 * a journey, per hour for a driver at disposal — rounded up to the next 100 FC.
 * The two cost prices are what the office pays the driver and never leave
 * the admin surface.
 */

type Form = {
  name: Localized;
  description: Localized;
  image: string;
  seats: string;
  luggage: string;
  pricePerKm: Record<string, string>;
  pricePerHour: Record<string, string>;
  minimumFare: Record<string, string>;
  costPerKm: Record<string, string>;
  costPerHour: Record<string, string>;
  sortOrder: string;
  isActive: boolean;
};

const blank = (): Form => ({
  name: {},
  description: {},
  image: "",
  seats: "4",
  luggage: "",
  pricePerKm: moneyToForm(),
  pricePerHour: moneyToForm(),
  minimumFare: moneyToForm(),
  costPerKm: moneyToForm(),
  costPerHour: moneyToForm(),
  sortOrder: "0",
  isActive: true
});

/** A price box as the table shows it: the francs, or a dash for "not sold this way". */
const price = (m: { CDF?: number } | undefined, locale: string) =>
  m?.CDF ? formatMoney(m.CDF, "CDF", locale) : "—";

export default function VehicleCategoriesPage() {
  const queryClient = useQueryClient();
  const { can } = useCan();
  const { locale } = useT();
  const canWrite = can("inventory:write");
  const [draft, setDraft] = useState<Form>(blank());
  // The category the form is changing; null while it adds a new one.
  const [editing, setEditing] = useState<VehicleCategory | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
    refetchOnMount: "always"
  });
  const { rows, pager } = usePaged(data?.items ?? []);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["categories"] });

  const close = () => {
    setDraft(blank());
    setEditing(null);
    setShowForm(false);
  };

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => {
      const body = {
        name: draft.name,
        description: draft.description,
        image: draft.image,
        seats: Number(draft.seats),
        luggage: draft.luggage.trim(),
        pricePerKm: formToMoney(draft.pricePerKm),
        pricePerHour: formToMoney(draft.pricePerHour),
        minimumFare: formToMoney(draft.minimumFare),
        costPerKm: formToMoney(draft.costPerKm),
        costPerHour: formToMoney(draft.costPerHour),
        sortOrder: Number(draft.sortOrder) || 0,
        isActive: draft.isActive
      };
      return editing
        ? updateCategory(editing.id, { ...body, version: editing.version })
        : createCategory(body);
    },
    meta: { showToast: false },
    onSuccess: () => {
      toast.success(
        `${editing ? "Category saved" : "Category added"} — new quotes use these prices at once`
      );
      close();
      refresh();
    },
    onError: (e) => {
      toast.error(message(e, "Could not save the category"));
      // 409: saved by someone else meanwhile. Re-read, or the same old version is refused again.
      if ((e as AxiosError).response?.status === 409) refresh();
    }
  });

  const { mutate: setActive } = useMutation({
    mutationFn: (c: VehicleCategory) => updateCategory(c.id, { isActive: !c.isActive }),
    meta: { showToast: false },
    onSuccess: (_r, c) => {
      toast.success(
        c.isActive ? "Switched off — no longer offered to customers" : "Switched back on"
      );
      refresh();
    },
    onError: (e) => toast.error(message(e, "Could not change it"))
  });

  const edit = (c: VehicleCategory) => {
    setEditing(c);
    setDraft({
      name: c.name ?? {},
      description: c.description ?? {},
      image: c.image ?? "",
      seats: String(c.seats ?? ""),
      luggage: c.luggage ?? "",
      pricePerKm: moneyToForm(c.pricePerKm),
      pricePerHour: moneyToForm(c.pricePerHour),
      minimumFare: moneyToForm(c.minimumFare),
      costPerKm: moneyToForm(c.costPerKm),
      costPerHour: moneyToForm(c.costPerHour),
      sortOrder: String(c.sortOrder ?? 0),
      isActive: c.isActive
    });
    setShowForm(true);
  };

  const seats = Number(draft.seats);
  const priced =
    (formToMoney(draft.pricePerKm)?.CDF ?? 0) > 0 ||
    (formToMoney(draft.pricePerHour)?.CDF ?? 0) > 0;
  const canSave = Boolean(draft.name.fr?.trim()) && seats >= 1 && seats <= 60;
  const columns = canWrite ? 8 : 7;

  return (
    <AdminLayout
      title="Vehicle categories"
      description="What a ride costs: per km for a journey, per hour for a driver at disposal, by category of vehicle. Prices in whole francs, rounded up to the next 100 FC on each quote."
    >
      <div className="flex flex-col gap-5">
        {canWrite ? (
          <div className="flex">
            <Button
              size="sm"
              className="ml-auto gap-2"
              onClick={() => {
                setEditing(null);
                setDraft(blank());
                setShowForm((open) => !open || Boolean(editing));
              }}
            >
              <Plus className="size-4" />
              Add category
            </Button>
          </div>
        ) : null}

        {canWrite && showForm ? (
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">
              {editing ? `Edit ${localName(editing.name)}` : "New category"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <LocalizedInput
                label="Name"
                required
                maxLength={60}
                placeholder="Berline, SUV, Minibus…"
                value={draft.name}
                onChange={(name) => setDraft((d) => ({ ...d, name }))}
              />
              <div className="sm:col-span-2">
                <LocalizedInput
                  label="Description"
                  multiline
                  rows={2}
                  maxLength={300}
                  placeholder="Climatisée, 4 passagers, 2 valises…"
                  value={draft.description}
                  onChange={(description) => setDraft((d) => ({ ...d, description }))}
                />
              </div>
              <div>
                <Label className="text-xs">Seats (passengers) *</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={draft.seats}
                  onChange={(e) => setDraft((d) => ({ ...d, seats: e.target.value }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A customer with more passengers sees the category as too small.
                </p>
              </div>
              <div>
                <Label className="text-xs">Luggage</Label>
                <Input
                  value={draft.luggage}
                  maxLength={60}
                  placeholder="2 large suitcases"
                  onChange={(e) => setDraft((d) => ({ ...d, luggage: e.target.value }))}
                />
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
                  Lowest first in the list customers compare.
                </p>
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  What the customer pays
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <MoneyInput
                    label="Price per km (journey)"
                    value={draft.pricePerKm}
                    onChange={(pricePerKm) => setDraft((d) => ({ ...d, pricePerKm }))}
                    hint="Distance × this, at least the minimum fare. Blank: not sold by the km."
                  />
                  <MoneyInput
                    label="Price per hour (at disposal)"
                    value={draft.pricePerHour}
                    onChange={(pricePerHour) => setDraft((d) => ({ ...d, pricePerHour }))}
                    hint="Hours × this, 1 to 12 hours. Blank: not sold by the hour."
                  />
                  <MoneyInput
                    label="Minimum fare (journey)"
                    value={draft.minimumFare}
                    onChange={(minimumFare) => setDraft((d) => ({ ...d, minimumFare }))}
                    hint="A short journey never costs less than this. Blank: no minimum."
                  />
                </div>
                {!priced ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" role="alert">
                    Give a price per km or per hour (or both): without one the category cannot be
                    active, as there is nothing to quote.
                  </p>
                ) : null}
              </div>

              <div className="sm:col-span-2 lg:col-span-3 rounded-md border border-dashed p-3">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  What the office pays the driver — never shown to customers
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <MoneyInput
                    label="Cost per km"
                    value={draft.costPerKm}
                    onChange={(costPerKm) => setDraft((d) => ({ ...d, costPerKm }))}
                    hint="Makes the margin on each ride. Never shown to customers."
                  />
                  <MoneyInput
                    label="Cost per hour"
                    value={draft.costPerHour}
                    onChange={(costPerHour) => setDraft((d) => ({ ...d, costPerHour }))}
                    hint="Same, for rides by the hour. Never shown to customers."
                  />
                </div>
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <ImageUploader
                  label="Picture"
                  folder="transfers"
                  single
                  upload={uploadTransferImage}
                  value={draft.image ? [draft.image] : []}
                  onChange={(next) => setDraft((d) => ({ ...d, image: next[0] ?? "" }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Shown on the category card customers choose from.
                </p>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, isActive: v }))}
                />
                Active — offered to customers
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" disabled={!canSave || saving} onClick={() => save()}>
                {editing ? "Save category" : "Add category"}
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
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Seats</TableHead>
                  <TableHead className="text-right">Per km</TableHead>
                  <TableHead className="text-right">Per hour</TableHead>
                  <TableHead className="text-right">Minimum</TableHead>
                  <TableHead className="text-right">Cost km / h</TableHead>
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
                      No categories yet. Add one with a price per km or per hour, and transfers
                      can be quoted on the website.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((c) => (
                    <TableRow key={c.id} className={c.isActive ? "" : "opacity-60"}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <AssetImage src={c.image} title={localName(c.name)} className="h-10 w-14 object-cover" />
                          <div>
                            <p className="font-medium">{localName(c.name)}</p>
                            <p className="text-xs text-muted-foreground">
                              {[
                                c.name.en && c.name.en !== c.name.fr ? c.name.en : "",
                                c.luggage,
                                c.vehicleCount
                                  ? `${c.vehicleCount} vehicle${c.vehicleCount === 1 ? "" : "s"}`
                                  : "no vehicle yet"
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.seats}</TableCell>
                      <TableCell className="text-right tabular-nums">{price(c.pricePerKm, locale)}</TableCell>
                      <TableCell className="text-right tabular-nums">{price(c.pricePerHour, locale)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {price(c.minimumFare, locale)}
                      </TableCell>
                      {/* Admin only: the driver's share never reaches the public API. */}
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {price(c.costPerKm, locale)} / {price(c.costPerHour, locale)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.isActive ? "secondary" : "outline"}>
                          {c.isActive ? "Offered" : "Switched off"}
                        </Badge>
                      </TableCell>
                      {canWrite ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Edit" onClick={() => edit(c)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setActive(c)}>
                              {c.isActive ? "Switch off" : "Switch on"}
                            </Button>
                            <DeleteButton
                              permission="inventory:delete"
                              what={`the category “${localName(c.name)}”`}
                              consequence="Only a category no vehicle is of can be deleted; rides already booked keep their price. Switching it off keeps it here instead."
                              disabled={Boolean(c.vehicleCount)}
                              onDelete={() => deleteCategory(c.id)}
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
        <Pager {...pager} noun="category" plural="categories" />
      </div>
    </AdminLayout>
  );
}
