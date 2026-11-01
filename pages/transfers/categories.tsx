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
import { isOne, localName, message } from "@/components/Transfers/transfers.lib";
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
  const { t, locale } = useT();
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
      toast.success(editing ? t("tr.cat.saved") : t("tr.cat.added"));
      close();
      refresh();
    },
    onError: (e) => {
      toast.error(message(e, t("tr.cat.saveFailed")));
      // 409: saved by someone else meanwhile. Re-read, or the same old version is refused again.
      if ((e as AxiosError).response?.status === 409) refresh();
    }
  });

  const { mutate: setActive } = useMutation({
    mutationFn: (c: VehicleCategory) => updateCategory(c.id, { isActive: !c.isActive }),
    meta: { showToast: false },
    onSuccess: (_r, c) => {
      toast.success(c.isActive ? t("tr.cat.switchedOffToast") : t("tr.cat.switchedOnToast"));
      refresh();
    },
    onError: (e) => toast.error(message(e, t("tr.cat.changeFailed")))
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
      title={t("nav.transfers.categories")}
      description={t("tr.cat.description")}
    >
      <div className="flex flex-col gap-5">
        {canWrite ? (
          <div className="flex">
            <Button
              size="sm"
              className="ms-auto gap-2"
              onClick={() => {
                setEditing(null);
                setDraft(blank());
                setShowForm((open) => !open || Boolean(editing));
              }}
            >
              <Plus className="size-4" />
              {t("tr.cat.add")}
            </Button>
          </div>
        ) : null}

        {canWrite && showForm ? (
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">
              {editing ? t("tr.cat.edit", { name: localName(editing.name) }) : t("tr.cat.new")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <LocalizedInput
                label={t("common.name")}
                required
                maxLength={60}
                placeholder={t("tr.cat.namePlaceholder")}
                value={draft.name}
                onChange={(name) => setDraft((d) => ({ ...d, name }))}
              />
              <div className="sm:col-span-2">
                <LocalizedInput
                  label={t("tr.cat.descriptionLabel")}
                  multiline
                  rows={2}
                  maxLength={300}
                  placeholder={t("tr.cat.descriptionPlaceholder")}
                  value={draft.description}
                  onChange={(description) => setDraft((d) => ({ ...d, description }))}
                />
              </div>
              <div>
                <Label className="text-xs">{t("tr.cat.seats")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={draft.seats}
                  onChange={(e) => setDraft((d) => ({ ...d, seats: e.target.value }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("tr.cat.seatsHint")}
                </p>
              </div>
              <div>
                <Label className="text-xs">{t("tr.cat.luggage")}</Label>
                <Input
                  value={draft.luggage}
                  maxLength={60}
                  placeholder={t("tr.cat.luggagePlaceholder")}
                  onChange={(e) => setDraft((d) => ({ ...d, luggage: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">{t("tr.cat.order")}</Label>
                <Input
                  type="number"
                  step={1}
                  value={draft.sortOrder}
                  onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("tr.cat.orderHint")}
                </p>
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("tr.cat.customerPays")}
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <MoneyInput
                    label={t("tr.cat.pricePerKm")}
                    value={draft.pricePerKm}
                    onChange={(pricePerKm) => setDraft((d) => ({ ...d, pricePerKm }))}
                    hint={t("tr.cat.pricePerKmHint")}
                  />
                  <MoneyInput
                    label={t("tr.cat.pricePerHour")}
                    value={draft.pricePerHour}
                    onChange={(pricePerHour) => setDraft((d) => ({ ...d, pricePerHour }))}
                    hint={t("tr.cat.pricePerHourHint")}
                  />
                  <MoneyInput
                    label={t("tr.cat.minimumFare")}
                    value={draft.minimumFare}
                    onChange={(minimumFare) => setDraft((d) => ({ ...d, minimumFare }))}
                    hint={t("tr.cat.minimumFareHint")}
                  />
                </div>
                {!priced ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" role="alert">
                    {t("tr.cat.needPrice")}
                  </p>
                ) : null}
              </div>

              <div className="sm:col-span-2 lg:col-span-3 rounded-md border border-dashed p-3">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("tr.cat.officePays")}
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <MoneyInput
                    label={t("tr.cat.costPerKm")}
                    value={draft.costPerKm}
                    onChange={(costPerKm) => setDraft((d) => ({ ...d, costPerKm }))}
                    hint={t("tr.cat.costPerKmHint")}
                  />
                  <MoneyInput
                    label={t("tr.cat.costPerHour")}
                    value={draft.costPerHour}
                    onChange={(costPerHour) => setDraft((d) => ({ ...d, costPerHour }))}
                    hint={t("tr.cat.costPerHourHint")}
                  />
                </div>
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <ImageUploader
                  label={t("tr.cat.picture")}
                  folder="transfers"
                  single
                  upload={uploadTransferImage}
                  value={draft.image ? [draft.image] : []}
                  onChange={(next) => setDraft((d) => ({ ...d, image: next[0] ?? "" }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("tr.cat.pictureHint")}
                </p>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, isActive: v }))}
                />
                {t("tr.cat.active")}
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" disabled={!canSave || saving} onClick={() => save()}>
                {editing ? t("tr.cat.save") : t("tr.cat.add")}
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
                  <TableHead>{t("tr.cat.colCategory")}</TableHead>
                  <TableHead className="text-end">{t("tr.cat.colSeats")}</TableHead>
                  <TableHead className="text-end">{t("tr.cat.colPerKm")}</TableHead>
                  <TableHead className="text-end">{t("tr.cat.colPerHour")}</TableHead>
                  <TableHead className="text-end">{t("tr.cat.colMinimum")}</TableHead>
                  <TableHead className="text-end">{t("tr.cat.colCost")}</TableHead>
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
                      {t("tr.cat.empty")}
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
                                  ? t(isOne(locale, c.vehicleCount) ? "tr.cat.vehicles.one" : "tr.cat.vehicles.other", {
                                      n: c.vehicleCount
                                    })
                                  : t("tr.cat.noVehicle")
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{c.seats}</TableCell>
                      <TableCell className="text-end tabular-nums">{price(c.pricePerKm, locale)}</TableCell>
                      <TableCell className="text-end tabular-nums">{price(c.pricePerHour, locale)}</TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {price(c.minimumFare, locale)}
                      </TableCell>
                      {/* Admin only: the driver's share never reaches the public API. */}
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {price(c.costPerKm, locale)} / {price(c.costPerHour, locale)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.isActive ? "secondary" : "outline"}>
                          {c.isActive ? t("tr.cat.offered") : t("tr.cat.switchedOff")}
                        </Badge>
                      </TableCell>
                      {canWrite ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" title={t("common.edit")} onClick={() => edit(c)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setActive(c)}>
                              {c.isActive ? t("tr.cat.switchOff") : t("tr.cat.switchOn")}
                            </Button>
                            <DeleteButton
                              permission="inventory:delete"
                              what={t("tr.cat.deleteWhat", { name: localName(c.name) })}
                              consequence={t("tr.cat.deleteConsequence")}
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
        <Pager {...pager} noun={t("tr.cat.noun")} plural={t("tr.cat.plural")} />
      </div>
    </AdminLayout>
  );
}
