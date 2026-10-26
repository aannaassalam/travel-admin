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
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { CitySelect, message, Stars } from "@/components/Transfers/transfers.lib";
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
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { KeyRound, Pencil, Plus, Search } from "lucide-react";
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
    onError: (e) => toast.error(message(e, "Could not set the password"))
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
            {shown ? "Password set" : `Set a password for ${driver?.name ?? "the driver"}`}
          </DialogTitle>
          <DialogDescription>
            {shown
              ? "Tell the driver in person or by phone. It is not sent by SMS and will not be shown again — set a new one if it is lost."
              : "What the driver signs in to the driver portal with, together with their phone number. At least 8 characters; it replaces any password they had."}
          </DialogDescription>
        </DialogHeader>
        {shown ? (
          <p className="select-all rounded-md border bg-muted p-3 text-center font-mono text-lg tracking-wide">
            {shown}
          </p>
        ) : (
          <div>
            <Label className="text-xs">New password</Label>
            <Input
              autoFocus
              value={password}
              minLength={8}
              placeholder="At least 8 characters"
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
              Suggest one that is easy to say on the phone
            </Button>
          </div>
        )}
        <DialogFooter>
          {shown ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" disabled={isPending} onClick={close}>
                Cancel
              </Button>
              <Button disabled={!ready || isPending} onClick={() => mutate()}>
                {isPending ? "Saving…" : "Set password"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DriversPage() {
  const queryClient = useQueryClient();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [draft, setDraft] = useState({ ...BLANK });
  // The driver the form is changing; null while it adds a new one.
  const [editing, setEditing] = useState<Driver | null>(null);
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["drivers"] });

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
      toast.success(
        editing
          ? "Driver saved"
          : "Driver added — they get the portal link by SMS. Set a password so they can sign in."
      );
      // A new driver cannot sign in yet: straight on to the password.
      const added = !editing ? result?.driver : undefined;
      close();
      refresh();
      if (added) setPasswordFor(added);
    },
    onError: (e) => {
      toast.error(message(e, "Could not save the driver"));
      // 409: saved by someone else meanwhile. Re-read, or the same old version is refused again.
      if ((e as AxiosError).response?.status === 409) refresh();
    }
  });

  const { mutate: setActive } = useMutation({
    mutationFn: (d: Driver) => updateDriver(d.id, { isActive: !d.isActive }),
    meta: { showToast: false },
    onSuccess: (_r, d) => {
      toast.success(
        d.isActive
          ? "Switched off — not offered for new rides and cannot sign in"
          : "Switched back on"
      );
      refresh();
    },
    onError: (e) => toast.error(message(e, "Could not change it"))
  });

  const edit = (d: Driver) => {
    setEditing(d);
    setDraft({
      name: d.name,
      phone: d.phone,
      city: d.city,
      vehicle: d.vehicleId ?? d.vehicle?.id ?? "",
      licenceNumber: d.licenceNumber ?? "",
      photo: d.photo ?? "",
      isActive: d.isActive
    });
    setShowForm(true);
  };

  // The vehicles the form offers: active ones of the driver's city, plus the
  // one already chosen even if it has moved or been switched off.
  const vehicleOptions = (vehicles?.items ?? []).filter(
    (v) => (v.isActive && v.city === draft.city) || v.id === draft.vehicle
  );
  const columns = canWrite ? 7 : 6;

  return (
    <AdminLayout
      title="Drivers"
      description="Who drives the rides, per city. A driver with a vehicle can be assigned; they sign in to the driver portal with their phone and a password set here."
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Name, phone or licence"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CitySelect any value={city} onChange={setCity} />
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={freeOnly} onCheckedChange={setFreeOnly} />
            Available now
          </label>
          {canWrite ? (
            <Button
              size="sm"
              className="ml-auto gap-2"
              onClick={() => {
                setEditing(null);
                setDraft({ ...BLANK, city });
                setShowForm((open) => !open || Boolean(editing));
              }}
            >
              <Plus className="size-4" />
              Add driver
            </Button>
          ) : null}
        </div>

        {canWrite && showForm ? (
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">
              {editing ? `Edit ${editing.name}` : "New driver"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-xs">Full name *</Label>
                <Input
                  value={draft.name}
                  maxLength={120}
                  placeholder="Jean-Pierre Mbala"
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Phone *</Label>
                <Input
                  type="tel"
                  value={draft.phone}
                  placeholder="+243 81 000 00 00"
                  onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  International format (+243…). It is what they sign in with and where their
                  rides are sent.
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
                <Label className="text-xs">Vehicle</Label>
                <select
                  aria-label="Vehicle"
                  disabled={!draft.city}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                  value={draft.vehicle}
                  onChange={(e) => setDraft((d) => ({ ...d, vehicle: e.target.value }))}
                >
                  <option value="">{draft.city ? "None yet" : "Choose the city first"}</option>
                  {vehicleOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} · {v.make} {v.model}
                      {v.isActive ? "" : " (switched off)"}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Without a vehicle the driver cannot be assigned a ride. Vehicles are kept under
                  Vehicles.
                </p>
              </div>
              <div>
                <Label className="text-xs">Licence number</Label>
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
                Active — can be assigned rides and sign in
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <ImageUploader
                  label="Photo"
                  folder="transfers"
                  single
                  upload={uploadTransferImage}
                  value={draft.photo ? [draft.photo] : []}
                  onChange={(next) => setDraft((d) => ({ ...d, photo: next[0] ?? "" }))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Shown to the customer once the driver is assigned, so they know who to look for.
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                disabled={!draft.name.trim() || !draft.phone.trim() || !draft.city || saving}
                onClick={() => save()}
              >
                {editing ? "Save driver" : "Add driver"}
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
                  <TableHead>Driver</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Portal</TableHead>
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
                      {needle || city || freeOnly
                        ? "No driver matches that."
                        : "No drivers yet. Add one per city, give them a vehicle and a password, and they can be assigned rides."}
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
                          {vehicle ?? (
                            <span className="text-amber-700 dark:text-amber-400">
                              None — cannot be assigned
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
                            <span className="text-xs text-muted-foreground">No ratings yet</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={d.isActive ? "secondary" : "outline"}>
                              {d.isActive ? "Active" : "Switched off"}
                            </Badge>
                            {d.onRideNow ? (
                              <Badge
                                variant="secondary"
                                className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
                              >
                                On a ride
                              </Badge>
                            ) : availableNow(d) ? (
                              <Badge
                                variant="secondary"
                                className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              >
                                Available now
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.hasPassword === false ? (
                            <span className="text-amber-700 dark:text-amber-400">No password yet</span>
                          ) : d.lastSeenAt ? (
                            `Seen ${new Date(d.lastSeenAt).toLocaleDateString("en-GB")}`
                          ) : (
                            "Never signed in"
                          )}
                        </TableCell>
                        {canWrite ? (
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" title="Edit" onClick={() => edit(d)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                title="Set or reset the driver portal password"
                                onClick={() => setPasswordFor(d)}
                              >
                                <KeyRound className="size-3.5" />
                                Password
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setActive(d)}>
                                {d.isActive ? "Switch off" : "Switch on"}
                              </Button>
                              <DeleteButton
                                permission="inventory:delete"
                                what={`the driver “${d.name}”`}
                                consequence="Refused while a ride is assigned to them; past rides keep their name. A driver who may come back is better switched off."
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
        <Pager {...pager} noun="driver" />
      </div>

      <PasswordDialog driver={passwordFor} onClose={() => setPasswordFor(null)} />
    </AdminLayout>
  );
}
