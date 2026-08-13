import {
  createRoomType,
  getHotel,
  publishHotel,
  updateRoomType
} from "@/api/functions/admin.api";
import AssetImage from "@/components/Form/AssetImage";
import CalendarGrid from "@/components/Inventory/CalendarGrid";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import AdminLayout from "@/components/Layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

const BLANK = { maxAdults: "2", maxChildren: "0", beds: "" };

export default function HotelDetailPage() {
  const router = useRouter();
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [roomForm, setRoomForm] = useState(BLANK);
  const [roomName, setRoomName] = useState<Localized>({});
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [showRoomForm, setShowRoomForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["hotel", id],
    queryFn: () => getHotel(id),
    enabled: Boolean(id)
  });

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

  const { mutate: saveRoom, isPending: savingRoom } = useMutation({
    mutationFn: () => {
      const body = {
        name: roomName,
        maxAdults: Number(roomForm.maxAdults) || 1,
        maxChildren: Number(roomForm.maxChildren) || 0,
        beds: roomForm.beds,
        status: "PUBLISHED"
      };
      return editingRoom
        ? updateRoomType(id, editingRoom, body)
        : createRoomType(id, body);
    },
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hotel", id] });
      queryClient.invalidateQueries({ queryKey: ["calendar", id] });
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
              <Badge variant="secondary">{hotel.status}</Badge>
              <div className="ml-auto flex gap-2">
                <Link href={`/inventory/hotel/${id}`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Pencil className="size-3.5" />
                    Edit details
                  </Button>
                </Link>
                {hotel.status !== "PUBLISHED" ? (
                  <Button size="sm" onClick={() => publish()} disabled={isPending}>
                    Publish
                  </Button>
                ) : null}
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
                <p className="mt-1 font-medium">{hotel.supplier || "—"}</p>
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
                <Link href={`/inventory/hotel/${id}`} className="ml-auto">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Pencil className="size-3.5" />
                    Manage images
                  </Button>
                </Link>
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
            </section>

            {/* §5.2 level 2: room types. Nightly rates hang off these. */}
            <section>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-medium">Room types</h2>
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
              </div>

              {showRoomForm ? (
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
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" disabled={!roomName.fr || savingRoom} onClick={() => saveRoom()}>
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
                    No room types yet. Add one before setting nightly rates —
                    the calendar prices room types, not the hotel.
                  </p>
                ) : (
                  data.roomTypes.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-sm font-medium">{r.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.maxAdults} adults
                          {r.maxChildren ? ` · ${r.maxChildren} children` : ""}
                          {r.beds ? ` · ${r.beds}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
                        onClick={() => {
                          setRoomName((r.name as unknown as Localized) ?? {});
                          setRoomForm({
                            maxAdults: String(r.maxAdults),
                            maxChildren: String(r.maxChildren),
                            beds: r.beds ?? ""
                          });
                          setEditingRoom(r.id);
                          setShowRoomForm(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </div>
                  ))
                )}
              </Card>
            </section>

            <section>
              <h2 className="mb-1 text-sm font-medium">Availability &amp; pricing</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Top number is the nightly sell price in USD; below it is
                available/allotment. Hover a cell for cost and margin.
              </p>
              {data.roomTypes.length ? (
                <CalendarGrid hotelId={id} />
              ) : (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  Add a room type before setting nightly rates.
                </Card>
              )}
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
