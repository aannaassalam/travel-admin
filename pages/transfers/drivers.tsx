import {
  createDriver,
  deleteDriver,
  listDrivers,
  listVehicles,
  setDriverPassword,
  updateDriver,
  uploadTransferImage,
  vehicleText,
  type Driver
} from "@/api/functions/transfers.api";
import DeleteButton from "@/components/DeleteButton";
import AssetImage from "@/components/Form/AssetImage";
import ImageUploader from "@/components/Form/ImageUploader";
import { OptionSelect } from "@/components/Form/OptionSelect";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import SetupChecklist from "@/components/Transfers/SetupChecklist";
import {
  CitySelect,
  linked,
  message,
  rebase,
  sameCity,
  Stars
} from "@/components/Transfers/transfers.lib";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
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
import useLatestRef from "@/hooks/utils/useLatestRef";
import { formatDate } from "@/lib/functions/format.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { KeyRound, Pencil, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Drivers: who drives the rides, per city, each with the vehicle they drive.
 * A driver signs in to the driver portal on the website with their phone and
 * a password the office sets here; they get the portal link by SMS when added
 * and each ride by SMS when it is assigned.
 */

const BLANK = {
  name: "",
  phone: "",
  city: "",
  vehicle: "",
  licenceNumber: "",
  photo: "",
  isActive: true
};

/** A driver as the form's boxes hold it. */
const toDraft = (d: Driver): typeof BLANK => ({
  name: d.name,
  phone: d.phone,
  city: d.city,
  vehicle: d.vehicleId ?? d.vehicle?.id ?? "",
  licenceNumber: d.licenceNumber ?? "",
  photo: d.photo ?? "",
  isActive: d.isActive
});

/** A password the office can read out on the phone: a word and four digits. */
const WORDS = ["Fleuve", "Soleil", "Route", "Congo", "Safari", "Palmier", "Kivu", "Lualaba"];
const suggest = () =>
  `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${1000 + Math.floor(Math.random() * 9000)}`;

const availableNow = (d: Driver) => d.isActive && Boolean(d.vehicle) && !d.onRideNow;

/**
 * Sets the portal password and shows it once. It is never sent by SMS — an
 * SMS sits on a handset for good — so the office tells the driver itself.
 */
function PasswordDialog({ driver, onClose }: { driver: Driver | null; onClose: () => void }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const { mutate, isPending } = useMutation({
    mutationFn: () => setDriverPassword(driver?.id ?? "", password),
    meta: { showToast: false },
    onSuccess: () => {
      setShown(password);
      setPassword("");
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
    onError: (e) => toast.error(message(e, t("tr.drivers.passwordFailed")))
  });
  const close = () => {
    setPassword("");
    setShown(null);
    onClose();
  };
  const ready = password.length >= 8;

  return (
    <Dialog open={Boolean(driver)} onOpenChange={(open) => !open && !isPending && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {shown
              ? t("tr.drivers.passwordSet")
              : t("tr.drivers.setPasswordFor", { name: driver?.name ?? t("tr.drivers.theDriver") })}
          </DialogTitle>
          <DialogDescription>
            {shown ? t("tr.drivers.passwordShownHint") : t("tr.drivers.passwordHint")}
          </DialogDescription>
        </DialogHeader>
        {shown ? (
          <p className="select-all rounded-md border bg-muted p-3 text-center font-mono text-lg tracking-wide">
            {shown}
          </p>
        ) : (
          <div>
            <Label className="text-xs">{t("tr.drivers.newPassword")}</Label>
            <Input
              autoFocus
              value={password}
              minLength={8}
              placeholder={t("tr.drivers.atLeast8")}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ready && !isPending && mutate()}
            />
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={() => setPassword(suggest())}
            >
              {t("tr.drivers.suggest")}
            </Button>
          </div>
        )}
        <DialogFooter>
          {shown ? (
            <Button onClick={close}>{t("tr.drivers.done")}</Button>
          ) : (
            <>
              <Button variant="ghost" disabled={isPending} onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button disabled={!ready || isPending} onClick={() => mutate()}>
                {isPending ? t("tr.drivers.saving") : t("tr.drivers.setPassword")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DriversPage() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [draft, setDraft] = useState({ ...BLANK });
  // The driver the form is changing; null while it adds a new one.
  const [editing, setEditing] = useState<Driver | null>(null);
  // The same, read after an await: the form may have moved on meanwhile.
  const editingNow = useLatestRef(editing);
  const [showForm, setShowForm] = useState(false);
  const [passwordFor, setPasswordFor] = useState<Driver | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["drivers", { city }],
    queryFn: () => listDrivers({ city }),
    // "On a ride now" changes as drivers press Start.
    refetchOnMount: "always"
  });
  // Every vehicle, for the form: it offers those of the driver's city.
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles", {}],
    queryFn: () => listVehicles(),
    staleTime: 60 * 1000
  });

  const needle = search.trim().toLowerCase();
  const matching = (data?.items ?? []).filter(
    (d) =>
      (!needle || [d.name, d.phone, d.licenceNumber].some((v) => v?.toLowerCase().includes(needle))) &&
      (!freeOnly || availableNow(d))
  );
  const { rows, pager } = usePaged(matching, `${needle}|${city}|${freeOnly}`);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["drivers"] });
    // The checklist above counts drivers with a vehicle.
    queryClient.invalidateQueries({ queryKey: ["transfer-setup"] });
  };

  const close = () => {
    setDraft({ ...BLANK });
    setEditing(null);
    setShowForm(false);
  };

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => {
      const body = {
        ...draft,
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        licenceNumber: draft.licenceNumber.trim(),
        // "" is the blank choice; the server wants none, not an empty id.
        vehicle: draft.vehicle || null
      };
      return editing
        ? updateDriver(editing.id, { ...body, version: editing.version })
        : createDriver(body);
    },
    meta: { showToast: false },
    onSuccess: (result) => {
      toast.success(editing ? t("tr.drivers.saved") : t("tr.drivers.added"));
      // A new driver cannot sign in yet: straight on to the password.
      const added = !editing ? result?.driver : undefined;
      close();
      refresh();
      if (added) setPasswordFor(added);
    },
    onError: async (e) => {
      // 409: saved meanwhile (a Switch off on its row, say). The form takes the
      // new version and keeps what was typed; the boxes not typed in take the
      // new values, so the next Save is neither refused nor undoes that change.
      if ((e as AxiosError).response?.status === 409 && editing) {
        refresh();
        const fresh = (await listDrivers().catch(() => undefined))?.items.find(
          (d) => d.id === editing.id
        );
        // Unless the form has moved on to another driver while this loaded.
        const base = editingNow.current;
        if (fresh && base?.id === fresh.id) {
          setDraft((d) => rebase(d, toDraft(base), toDraft(fresh)));
          setEditing(fresh);
        }
        toast.error(t("tr.drivers.conflict"));
        return;
      }
      toast.error(message(e, t("tr.drivers.saveFailed")));
    }
  });

  const { mutate: setActive } = useMutation({
    mutationFn: (d: Driver) => updateDriver(d.id, { isActive: !d.isActive }),
    meta: { showToast: false },
    onSuccess: (_r, d) => {
      toast.success(d.isActive ? t("tr.drivers.switchedOffToast") : t("tr.drivers.switchedBackOn"));
      refresh();
    },
    onError: (e) => toast.error(message(e, t("tr.drivers.changeFailed")))
  });

  const edit = (d: Driver) => {
    setEditing(d);
    setDraft(toDraft(d));
    setShowForm(true);
  };

  // The vehicles the form offers: active ones of the driver's city (however
  // its name was typed), plus the one already chosen even if it has moved or
  // been switched off.
  const cityVehicles = (vehicles?.items ?? []).filter(
    (v) => v.isActive && sameCity(v.city, draft.city)
  );
  const vehicleOptions = (vehicles?.items ?? []).filter(
    (v) => cityVehicles.includes(v) || v.id === draft.vehicle
  );
  const columns = canWrite ? 7 : 6;

  return (
    <AdminLayout
      title={t("nav.transfers.drivers")}
      description={t("tr.drivers.description")}
    >
      <div className="flex flex-col gap-5">
        {/* Without the rides board (orders:read) the Transfers area opens here. */}
        {can("orders:read") ? null : <SetupChecklist />}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-8"
              placeholder={t("tr.drivers.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CitySelect any value={city} onChange={setCity} />
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={freeOnly} onCheckedChange={setFreeOnly} />
            {t("tr.drivers.available")}
          </label>
          {canWrite ? (
            <Button
              size="sm"
              className="ms-auto gap-2"
              onClick={() => {
                setEditing(null);
                setDraft({ ...BLANK, city });
                setShowForm((open) => !open || Boolean(editing));
              }}
            >
              <Plus className="size-4" />
              {t("tr.drivers.add")}
            </Button>
          ) : null}
        </div>

        {canWrite && showForm ? (
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">
              {editing ? t("tr.drivers.editName", { name: editing.name }) : t("tr.drivers.new")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-xs">{t("tr.drivers.fullName")}</Label>
                <Input
                  value={draft.name}
                  maxLength={120}
                  placeholder="Jean-Pierre Mbala"
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">{t("tr.drivers.phone")}</Label>
                <Input
                  type="tel"
                  value={draft.phone}
                  placeholder="+243 81 000 00 00"
                  onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("tr.drivers.phoneHint")}
                </p>
              </div>
              <CitySelect
                required
                value={draft.city}
                onChange={(next) =>
                  // A vehicle of another city is no longer theirs to drive.
                  setDraft((d) => ({ ...d, city: next, vehicle: next === d.city ? d.vehicle : "" }))
                }
              />
              <div>
                <Label className="text-xs">{t("tr.drivers.vehicle")}</Label>
                <OptionSelect
                  aria-label={t("tr.drivers.vehicle")}
                  disabled={!draft.city}
                  value={draft.vehicle}
                  onChange={(id) => setDraft((d) => ({ ...d, vehicle: id }))}
                  options={[
                    {
                      value: "",
                      label: draft.city ? t("tr.drivers.noneYet") : t("tr.drivers.cityFirst")
                    },
                    ...vehicleOptions.map((v) => ({
                      value: v.id,
                      label: (
                        <>
                          {v.plate} · {v.make} {v.model}
                          {v.isActive ? "" : t("tr.drivers.offSuffix")}
                        </>
                      )
                    }))
                  ]}
                />
                {draft.city && vehicles && !cityVehicles.length ? (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                    {linked(
                      t("tr.drivers.noVehicleIn", { city: draft.city }),
                      <Link href="/transfers/vehicles" className="underline underline-offset-2">
                        {t("nav.transfers.vehicles")}
                      </Link>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("tr.drivers.noVehicleHint")}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">{t("tr.drivers.licence")}</Label>
                <Input
                  value={draft.licenceNumber}
                  maxLength={60}
                  onChange={(e) => setDraft((d) => ({ ...d, licenceNumber: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-3 self-end pb-2 text-sm">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, isActive: v }))}
                />
                {t("tr.drivers.activeSwitch")}
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <ImageUploader
                  label={t("tr.drivers.photo")}
                  folder="transfers"
                  single
                  upload={uploadTransferImage}
                  value={draft.photo ? [draft.photo] : []}
                  onChange={(next) => setDraft((d) => ({ ...d, photo: next[0] ?? "" }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("tr.drivers.photoHint")}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                disabled={!draft.name.trim() || !draft.phone.trim() || !draft.city || saving}
                onClick={() => save()}
              >
                {editing ? t("tr.drivers.save") : t("tr.drivers.add")}
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
                  <TableHead>{t("tr.actor.DRIVER")}</TableHead>
                  <TableHead>{t("common.city")}</TableHead>
                  <TableHead>{t("tr.drivers.vehicle")}</TableHead>
                  <TableHead>{t("tr.drivers.rating")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("tr.drivers.portal")}</TableHead>
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
                      {needle || city || freeOnly
                        ? t("tr.drivers.noMatch")
                        : t("tr.drivers.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((d) => {
                    const vehicle = vehicleText(d.vehicle);
                    return (
                      <TableRow key={d.id} className={cn(!d.isActive && "opacity-60")}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <AssetImage
                              src={d.photo}
                              title={d.name}
                              className="size-9 shrink-0 rounded-full object-cover"
                            />
                            <div>
                              <p className="font-medium">{d.name}</p>
                              <a
                                dir="ltr"
                                href={`tel:${d.phone.replace(/\s/g, "")}`}
                                className="text-xs text-muted-foreground hover:underline"
                              >
                                {d.phone}
                              </a>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{d.city}</TableCell>
                        <TableCell className="text-sm">
                          {vehicle ? (
                            <span dir="ltr">{vehicle}</span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">
                              {t("tr.drivers.noVehicle")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {d.ratingStats?.count ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Stars n={d.ratingStats.rating} />
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {d.ratingStats.rating.toFixed(1)} ({d.ratingStats.count})
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("tr.drivers.noRatings")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={d.isActive ? "secondary" : "outline"}>
                              {d.isActive ? t("tr.drivers.active") : t("tr.drivers.switchedOff")}
                            </Badge>
                            {d.onRideNow ? (
                              <Badge
                                variant="secondary"
                                className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
                              >
                                {t("tr.drivers.onRide")}
                              </Badge>
                            ) : availableNow(d) ? (
                              <Badge
                                variant="secondary"
                                className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              >
                                {t("tr.drivers.available")}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.hasPassword === false ? (
                            <span className="text-amber-700 dark:text-amber-400">{t("tr.drivers.noPassword")}</span>
                          ) : d.lastSeenAt ? (
                            t("tr.drivers.seen", { date: formatDate(d.lastSeenAt) })
                          ) : (
                            t("tr.drivers.neverSignedIn")
                          )}
                        </TableCell>
                        {canWrite ? (
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" title={t("common.edit")} onClick={() => edit(d)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                title={t("tr.drivers.passwordTitle")}
                                onClick={() => setPasswordFor(d)}
                              >
                                <KeyRound className="size-3.5" />
                                {t("tr.drivers.password")}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setActive(d)}>
                                {d.isActive ? t("tr.drivers.switchOff") : t("tr.drivers.switchOn")}
                              </Button>
                              <DeleteButton
                                permission="inventory:delete"
                                what={t("tr.drivers.deleteWhat", { name: d.name })}
                                consequence={t("tr.drivers.deleteConsequence")}
                                onDelete={() => deleteDriver(d.id)}
                                onDeleted={refresh}
                              />
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager {...pager} noun={t("tr.drivers.noun")} plural={t("tr.drivers.nounPlural")} />
      </div>

      <PasswordDialog driver={passwordFor} onClose={() => setPasswordFor(null)} />
    </AdminLayout>
  );
}
