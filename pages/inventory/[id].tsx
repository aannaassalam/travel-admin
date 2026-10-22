import {
  createRoomType,
  deactivateHotel,
  deleteHotel,
  deleteRoomType,
  getHotel,
  publishHotel,
  updateRoomType
} from "@/api/functions/admin.api";
import { assetUrl } from "@/api/endpoints";
import DeleteButton from "@/components/DeleteButton";
import AssetImage from "@/components/Form/AssetImage";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { PAGE_SIZE, usePaged } from "@/components/Pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deactivatePrompt,
  label,
  LISTING_STATUS
} from "@/lib/functions/labels.lib";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

const BLANK = {
  maxAdults: "2",
  maxChildren: "0",
  beds: "",
  cost: "",
  sell: "",
  mealPlan: "ROOM_ONLY"
};

const MEAL_PLANS: Record<string, string> = {
  ROOM_ONLY: "Room only",
  BREAKFAST: "Breakfast",
  HALF_BOARD: "Half board",
  FULL_BOARD: "Full board",
  ALL_INCLUSIVE: "All inclusive"
};

/** Minor units as dollars, the way the box shows them. */
const dollars = (minor?: number) => (typeof minor === "number" ? String(minor / 100) : "");
const usd = (minor?: number) =>
  typeof minor === "number" ? `$${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—";

export default function HotelDetailPage() {
  const router = useRouter();
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [roomForm, setRoomForm] = useState(BLANK);
  const [roomName, setRoomName] = useState<Localized>({});
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [showRoomForm, setShowRoomForm] = useState(false);
  // Publishing and room types are inventory:write; the rest is inventory:read.
  // Deleting — the hotel, or a room type — is inventory:delete, which those
  // buttons check for themselves.
  const { can } = useCan();
  const canWrite = can("inventory:write");

  const { data, isLoading } = useQuery({
    queryKey: ["hotel", id],
    queryFn: () => getHotel(id),
    enabled: Boolean(id),
    // A status changed on another screen must not come back from the cache.
    refetchOnMount: "always",
  });
  const rooms = usePaged(data?.roomTypes ?? []);

  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ??
        "Something went wrong"
    );

  const { mutate: publish, isPending } = useMutation({
    mutationFn: () => publishHotel(id),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel", id] });
      toast.success("Hotel published");
    },
    onError
  });

  const { mutate: deactivate, isPending: deactivating } = useMutation({
    mutationFn: () => deactivateHotel(id),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel", id] });
      toast.success("Hotel deactivated — publish it again whenever you like");
    },
    onError
  });

  const { mutate: saveRoom, isPending: savingRoom } = useMutation({
    mutationFn: () => {
      const body = {
        name: roomName,
        maxAdults: Number(roomForm.maxAdults) || 1,
        maxChildren: Number(roomForm.maxChildren) || 0,
        beds: roomForm.beds,
        // One nightly price for every future night, in USD; CDF and EUR are
        // worked out from the exchange rates in Settings.
        costPrice: { USD: Math.round(Number(roomForm.cost) * 100) },
        sellPrice: { USD: Math.round(Number(roomForm.sell) * 100) },
        mealPlan: roomForm.mealPlan
      };
      return editingRoom
        ? updateRoomType(id, editingRoom, body)
        : createRoomType(id, body);
    },
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel", id] });
      setRoomForm(BLANK);
      setRoomName({});
      setEditingRoom(null);
      setShowRoomForm(false);
      toast.success(editingRoom ? "Room type updated" : "Room type added");
    },
    onError
  });

  const hotel = data?.hotel;

  return (
    <AdminLayout
      title={hotel?.displayName ?? "Hotel"}
      description={hotel ? `${hotel.city} · ${"★".repeat(hotel.stars)}` : undefined}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/inventory?group=HOTEL">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4" />
              Inventory
            </Button>
          </Link>
          {hotel ? (
            <>
              <Badge variant="secondary">{label(LISTING_STATUS, hotel.status)}</Badge>
              <div className="ml-auto flex gap-2">
                {/* The form behind this link holds fields this screen does not
                    show, so it stays for everyone; it opens read-only. */}
                <Link href={`/inventory/hotel/${id}`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    {canWrite ? <Pencil className="size-3.5" /> : null}
                    {canWrite ? "Edit details" : "View details"}
                  </Button>
                </Link>
                {canWrite && hotel.status !== "PUBLISHED" ? (
                  <Button size="sm" onClick={() => publish()} disabled={isPending}>
                    Publish
                  </Button>
                ) : null}
                {canWrite && hotel.status === "PUBLISHED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={deactivating}
                    onClick={() =>
                      window.confirm(deactivatePrompt(hotel.displayName)) && deactivate()
                    }
                  >
                    Deactivate
                  </Button>
                ) : null}
                <DeleteButton
                  permission="inventory:delete"
                  label="Delete"
                  what={`the hotel “${hotel.displayName}”`}
                  consequence="Its room types go with it. Bookings already made keep their own details."
                  onDelete={(confirmed) => deleteHotel(id, confirmed)}
                  onDeleted={() => {
                    queryClient.invalidateQueries({ queryKey: ["hotels"] });
                    // This page is forgotten too, once it has been left: kept,
                    // it would open again from memory; dropped while still up,
                    // it would be read again.
                    router
                      .replace("/inventory?group=HOTEL")
                      .then(() => queryClient.removeQueries({ queryKey: ["hotel", id] }));
                  }}
                />
              </div>
            </>
          ) : null}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !hotel ? (
          <p className="text-sm text-muted-foreground">Hotel not found.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="gap-0 p-4">
                <p className="text-xs text-muted-foreground">Supplier</p>
                <p className="mt-1 font-medium">{hotel.supplierName || "—"}</p>
              </Card>
              <Card className="gap-0 p-4">
                <p className="text-xs text-muted-foreground">Room types</p>
                <p className="mt-1 font-medium tabular-nums">
                  {data.roomTypes.length}
                </p>
              </Card>
              <Card className="gap-0 p-4">
                <p className="text-xs text-muted-foreground">Translations</p>
                <p className="mt-1 font-mono text-sm">
                  {Object.entries(hotel.translations).map(([loc, done]) => (
                    <span
                      key={loc}
                      className={done ? "text-emerald-600" : "text-muted-foreground/50"}
                    >
                      {loc.toUpperCase()}
                      {done ? "✓" : "✗"}{" "}
                    </span>
                  ))}
                </p>
              </Card>
            </div>

            {/* Gallery. Saving the form lands here, so the images have to be
                visible on this screen — otherwise a successful upload reads as
                a lost one. */}
            <section>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-medium">Gallery</h2>
                <span className="text-xs text-muted-foreground">
                  {hotel.images?.length ?? 0} image
                  {(hotel.images?.length ?? 0) === 1 ? "" : "s"}
                </span>
                {canWrite ? (
                  <Link href={`/inventory/hotel/${id}`} className="ml-auto">
                    <Button variant="ghost" size="sm" className="gap-2">
                      <Pencil className="size-3.5" />
                      Manage images
                    </Button>
                  </Link>
                ) : null}
              </div>
              {hotel.images?.length ? (
                <div className="flex flex-wrap gap-2">
                  {hotel.images.map((src) => (
                    <AssetImage key={src} src={src} className="size-28" />
                  ))}
                </div>
              ) : (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  No images yet. At least one is required before publishing.
                </Card>
              )}
              {/* For the same reason as the images: a video just saved in the
                  form has to be somewhere on the screen that save lands on. */}
              {hotel.videoUrl ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Video:{" "}
                  <a
                    href={assetUrl(hotel.videoUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Play the video
                  </a>
                </p>
              ) : null}
            </section>

            {/* Room types, each with one nightly price for every future night.
                Rooms are not counted: the hotel confirms each booking. */}
            <section>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-medium">Room types</h2>
                {canWrite ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setRoomForm(BLANK);
                      setRoomName({});
                      setEditingRoom(null);
                      setShowRoomForm((s) => !s);
                    }}
                  >
                    <Plus className="size-3.5" />
                    Add room type
                  </Button>
                ) : null}
              </div>

              {canWrite && showRoomForm ? (
                <Card className="mb-3 gap-0 p-4">
                  <LocalizedInput
                    label="Room type name"
                    required
                    value={roomName}
                    placeholder="Chambre Standard"
                    onChange={setRoomName}
                  />
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs">Max adults</Label>
                      <Input
                        type="number"
                        value={roomForm.maxAdults}
                        onChange={(e) => setRoomForm({ ...roomForm, maxAdults: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Max children</Label>
                      <Input
                        type="number"
                        value={roomForm.maxChildren}
                        onChange={(e) => setRoomForm({ ...roomForm, maxChildren: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Beds</Label>
                      <Input
                        value={roomForm.beds}
                        onChange={(e) => setRoomForm({ ...roomForm, beds: e.target.value })}
                        placeholder="1 double"
                      />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs">Cost per night (USD) *</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={roomForm.cost}
                        placeholder="What the hotel charges you"
                        onChange={(e) => setRoomForm({ ...roomForm, cost: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Price per night (USD) *</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={roomForm.sell}
                        placeholder="What the customer pays"
                        onChange={(e) => setRoomForm({ ...roomForm, sell: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Meals</Label>
                      <select
                        aria-label="Meals"
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                        value={roomForm.mealPlan}
                        onChange={(e) => setRoomForm({ ...roomForm, mealPlan: e.target.value })}
                      >
                        {Object.entries(MEAL_PLANS).map(([value, text]) => (
                          <option key={value} value={value}>
                            {text}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    The price holds for every night from now on, until you change it here — bookings
                    already made keep what they were charged. CDF and EUR are worked out from the
                    exchange rates in Settings.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      disabled={
                        !roomName.fr ||
                        savingRoom ||
                        !(Number(roomForm.sell) > 0) ||
                        !(Number(roomForm.cost) > 0)
                      }
                      onClick={() => saveRoom()}
                    >
                      {editingRoom ? "Save room type" : "Add room type"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowRoomForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </Card>
              ) : null}

              <Card className="gap-0 divide-y p-0">
                {!data.roomTypes.length ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    No room types yet. Add at least one, with its nightly price,
                    before publishing the hotel.
                  </p>
                ) : (
                  rooms.rows.map((r) => (
                    <div key={r.id} className="flex items-center gap-1 p-4">
                      <div className="mr-auto">
                        <p className="text-sm font-medium">{r.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.maxAdults} adults
                          {r.maxChildren ? ` · ${r.maxChildren} children` : ""}
                          {r.beds ? ` · ${r.beds}` : ""}
                          {r.mealPlan ? ` · ${MEAL_PLANS[r.mealPlan] ?? r.mealPlan}` : ""}
                        </p>
                      </div>
                      <div className="mr-3 text-right text-sm tabular-nums">
                        {r.sellPrice?.USD ? (
                          <>
                            <p className="font-medium">{usd(r.sellPrice.USD)} / night</p>
                            <p className="text-xs text-muted-foreground">
                              cost {usd(r.costPrice?.USD)} · margin {usd(r.margin)}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-amber-600">No price yet — not bookable</p>
                        )}
                      </div>
                      {canWrite ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit"
                          onClick={() => {
                            setRoomName((r.name as unknown as Localized) ?? {});
                            setRoomForm({
                              maxAdults: String(r.maxAdults),
                              maxChildren: String(r.maxChildren),
                              beds: r.beds ?? "",
                              cost: dollars(r.costPrice?.USD),
                              sell: dollars(r.sellPrice?.USD),
                              mealPlan: r.mealPlan ?? "ROOM_ONLY"
                            });
                            setEditingRoom(r.id);
                            setShowRoomForm(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      ) : null}
                      <DeleteButton
                        permission="inventory:delete"
                        what={`the room type “${r.displayName}”`}
                        consequence="Bookings already made keep their own details."
                        onDelete={(confirmed) => deleteRoomType(id, r.id, confirmed)}
                        onDeleted={() => {
                          queryClient.invalidateQueries({ queryKey: ["hotel", id] });
                          // The form above may be open on this very room type.
                          if (editingRoom === r.id) setShowRoomForm(false);
                        }}
                      />
                    </div>
                  ))
                )}
              </Card>
              {data.roomTypes.length > PAGE_SIZE ? (
                <div className="mt-3">
                  <Pager {...rooms.pager} noun="room type" />
                </div>
              ) : null}
            </section>

          </>
        )}
      </div>
    </AdminLayout>
  );
}
