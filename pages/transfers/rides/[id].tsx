import {
  assignRide,
  availableDrivers,
  cancelRide,
  endRide,
  getRide,
  startRide,
  unassignRide,
  vehicleText,
  type AvailableDriver,
  type Ride
} from "@/api/functions/transfers.api";
import AssetImage from "@/components/Form/AssetImage";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import {
  distanceText,
  mapsLink,
  message,
  RIDE_ACTOR,
  RIDE_MODE,
  RideStatusBadge,
  rideWhen,
  Stars
} from "@/components/Transfers/transfers.lib";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDateTime,
  formatMoney,
  formatOrderTotal
} from "@/lib/functions/format.lib";
import { useT } from "@/lib/i18n/useT";
import {
  CANCELLATION_REASON,
  label,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS
} from "@/lib/functions/labels.lib";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowLeft, MapPin, Phone, ShieldAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

/**
 * One ride: the map, the facts, the driver, the booking it belongs to, its
 * history and alerts — and what the office can still do to it. Everything on
 * one screen: the office is on the phone with the customer or the driver.
 */

// Client-only, as LocationPicker loads its map: Leaflet reads `window` at import.
const RideMap = dynamic(() => import("@/components/Transfers/RideLeaflet"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted/40" />
});

const PAYMENT_STYLES: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  UNPAID: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  REVERSED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
};

/** The office's reasons; the cash deadline is the system's own. */
const REASONS = Object.entries(CANCELLATION_REASON).filter(
  ([code]) => code !== "CASH_DEADLINE_EXPIRED"
);

/** Each status as the sentence the office can read out on the phone. */
const sentence = (r: Ride) => {
  switch (r.status) {
    case "PENDING":
      return "No driver yet. Assign one: the driver gets the ride by SMS and the customer sees who is coming on their ride page.";
    case "ASSIGNED":
      return `${r.driver?.name ?? "The driver"} has the ride on the driver portal. It starts when the driver — or the office — presses Start.`;
    case "STARTED":
      return `Under way since ${formatDateTime(r.startedAt)}.`;
    case "COMPLETED":
      return `Completed ${formatDateTime(r.endedAt)}. The customer was asked to rate the driver.`;
    case "CANCELLED":
      return `Cancelled ${formatDateTime(r.cancelledAt)}${
        r.cancellationReason ? ` — ${label(CANCELLATION_REASON, r.cancellationReason)}` : ""
      }.`;
  }
};

/** How long the driver is taken: the hours booked, or the drive. */
const rideMinutes = (r: Ride) =>
  r.mode === "HOURLY" ? (r.hours ?? 1) * 60 : r.durationMinutes;

const tel = (phone: string) => `tel:${phone.replace(/\s/g, "")}`;

function Fact({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{name}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * The drivers of the ride's city with a vehicle, each marked free or busy
 * around the pick-up time. A busy one can still be assigned — the office knows
 * things the calendar does not — but only after saying so.
 */
function AssignDialog({
  ride,
  open,
  onOpenChange,
  onAssigned
}: {
  ride: Ride;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}) {
  const minutes = rideMinutes(ride);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["drivers-available", ride.id, ride.at, minutes],
    queryFn: () => availableDrivers({ city: ride.city, at: ride.at, minutes, except: ride.id }),
    enabled: open,
    // Who is free changes as other rides are assigned: read afresh each time.
    staleTime: 0
  });
  // The question "assign anyway?" — asked here for a driver the list marks
  // busy, or by the server when someone else booked them meanwhile.
  const [force, setForce] = useState<{ driver: AvailableDriver; why: string } | null>(null);

  const { mutate: assign, isPending, variables } = useMutation({
    mutationFn: ({ driver, force }: { driver: AvailableDriver; force?: boolean }) =>
      assignRide(ride.id, { driverId: driver.id, force }),
    meta: { showToast: false },
    onSuccess: (_r, { driver }) => {
      toast.success(
        `${driver.name} assigned — they get the ride by SMS, and the customer sees who is coming on their ride page`
      );
      setForce(null);
      onOpenChange(false);
      onAssigned();
    },
    onError: (e, { driver }) => {
      const res = (e as AxiosError<{ message?: string; code?: string }>).response;
      if (res?.status === 409 && res.data?.code === "DRIVER_BUSY") {
        return setForce({
          driver,
          why: res.data.message ?? `${driver.name} has another ride around that time.`
        });
      }
      toast.error(message(e, "Could not assign the driver"));
    }
  });

  const pick = (d: AvailableDriver) =>
    d.busy || d.onRideNow
      ? setForce({
          driver: d,
          why: d.onRideNow
            ? `${d.name} is on a ride right now.`
            : `${d.name} has ride ${d.busy} around that time.`
        })
      : assign({ driver: d });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        setForce(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign a driver</DialogTitle>
          <DialogDescription>
            Active drivers of {ride.city} with a vehicle, and whether they are free around{" "}
            {rideWhen(ride.at)}. The driver gets the ride by SMS; the customer sees who is
            coming on their ride page.
          </DialogDescription>
        </DialogHeader>
        {force ? (
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40"
          >
            <p className="font-medium">Busy driver</p>
            <p className="mt-1 text-muted-foreground">
              {force.why} Assign {force.driver.name} anyway?
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => assign({ driver: force.driver, force: true })}
              >
                {isPending ? "Assigning…" : "Assign anyway"}
              </Button>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setForce(null)}>
                Back to the list
              </Button>
            </div>
          </div>
        ) : isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : !data?.items.length ? (
          <p className="text-sm text-muted-foreground">
            No active driver with a vehicle in {ride.city}. Add one under Drivers, or give a
            driver a vehicle, and come back here.
          </p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
            {data.items.map((d) => {
              const busy = Boolean(d.busy || d.onRideNow);
              return (
                <li key={d.id} className="flex items-center gap-3 p-3">
                  <AssetImage src={d.photo} className="size-10 shrink-0 rounded-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {vehicleText(d.vehicle) ?? "No vehicle"} · {d.phone}
                    </p>
                  </div>
                  {d.onRideNow ? (
                    <Badge variant="secondary" className={PAYMENT_STYLES.PENDING}>
                      On a ride now
                    </Badge>
                  ) : d.busy ? (
                    <Badge variant="secondary" className={PAYMENT_STYLES.PENDING}>
                      Busy: {d.busy}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className={PAYMENT_STYLES.PAID}>
                      Available
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant={busy ? "outline" : "default"}
                    disabled={isPending}
                    onClick={() => pick(d)}
                  >
                    {isPending && variables?.driver.id === d.id ? "Assigning…" : "Assign"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function RidePage() {
  const router = useRouter();
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const { can } = useCan();
  const { locale } = useT();
  const canWrite = can("orders:write");
  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  // Start, end and remove-the-driver confirm first. One dialog drives all three.
  const [confirming, setConfirming] = useState<{
    title: string;
    body: string;
    action: string;
    run: () => void;
  } | null>(null);

  const {
    data: ride,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ["ride", id],
    queryFn: () => getRide(id),
    enabled: Boolean(id),
    // The driver may have started or ended it since this page was last open.
    refetchOnMount: "always"
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ride", id] });
    queryClient.invalidateQueries({ queryKey: ["rides"] });
    setConfirming(null);
  };
  const onError = (e: unknown) => toast.error(message(e, "Action failed"));

  const { mutate: act, isPending } = useMutation({
    mutationFn: (what: "unassign" | "start" | "end") =>
      what === "unassign" ? unassignRide(id) : what === "start" ? startRide(id) : endRide(id),
    meta: { showToast: false },
    onSuccess: (_r, what) => {
      refresh();
      toast.success(
        what === "unassign"
          ? "Driver removed — the ride is waiting for a driver again"
          : what === "start"
            ? "Ride started"
            : "Ride completed — the customer is thanked and asked to rate the driver"
      );
    },
    onError
  });

  const { mutate: cancel, isPending: cancelPending } = useMutation({
    mutationFn: () => cancelRide(id, { reason, note: note.trim() || undefined }),
    meta: { showToast: false },
    onSuccess: () => {
      setCancelling(false);
      setReason("");
      setNote("");
      refresh();
      toast.success("Ride and booking cancelled");
    },
    onError
  });

  if (isLoading) {
    return (
      <AdminLayout title="Ride">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AdminLayout>
    );
  }
  // A 404 is genuinely "not found"; any other failure gets a retry.
  if (isError && (error as AxiosError)?.response?.status !== 404) {
    return (
      <AdminLayout title="Ride">
        <QueryError onRetry={() => refetch()} />
      </AdminLayout>
    );
  }
  if (!ride) {
    return (
      <AdminLayout title="Ride">
        <p className="text-sm text-muted-foreground">Ride not found.</p>
      </AdminLayout>
    );
  }

  const closed = ride.status === "COMPLETED" || ride.status === "CANCELLED";
  const alerts = ride.alerts ?? [];
  const order = ride.order;
  const { price, cost } = ride;

  return (
    <AdminLayout
      title={ride.reference || "Ride"}
      description={`${ride.city} · pick-up ${rideWhen(ride.at)}`}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/transfers">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4" />
              Rides
            </Button>
          </Link>
          <RideStatusBadge status={ride.status} />
          {order ? (
            <Badge variant="secondary" className={PAYMENT_STYLES[order.paymentStatus]}>
              {label(PAYMENT_STATUS, order.paymentStatus)} ·{" "}
              {label(PAYMENT_METHOD, order.paymentMethod)}
            </Badge>
          ) : null}
          {alerts.length ? (
            <Badge className="gap-1 bg-red-600 text-white">
              <ShieldAlert />
              {alerts.length} security alert{alerts.length > 1 ? "s" : ""}
            </Badge>
          ) : null}
          <span className="ml-auto text-right">
            {/* What the customer pays, as the ride snapshot it; the booking
                card below says what they were charged in their currency. */}
            <span className="block text-lg font-semibold tabular-nums">
              {formatMoney(price, "CDF", locale)}
            </span>
            {/* Admin only: the driver's share never reaches the public API. */}
            {typeof cost === "number" ? (
              <span className="block text-xs text-muted-foreground tabular-nums">
                cost {formatMoney(cost, "CDF", locale)} · margin{" "}
                {formatMoney((price ?? 0) - cost, "CDF", locale)}
              </span>
            ) : null}
          </span>
        </div>

        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">{sentence(ride)}</p>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card className="gap-0 p-4">
              {/* `isolate` keeps Leaflet's own z-indexes under the sticky header. */}
              <div className="relative isolate z-0 h-80 overflow-hidden rounded-md border">
                <RideMap
                  pickup={ride.pickup}
                  dropoff={ride.dropoff}
                  route={ride.route}
                  alerts={alerts}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                A: pick-up · B: drop-off · red dot: where a security alert was raised.{" "}
                {distanceText(ride)}
                {ride.routeSource === "ESTIMATE"
                  ? " — the routing service could not be reached when this was booked, so the distance is a straight line times the road factor from Settings."
                  : ""}
              </p>
            </Card>

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">Ride</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact name="Pick-up">
                  {ride.pickup.label}{" "}
                  <a
                    href={mapsLink(ride.pickup.lat, ride.pickup.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs text-muted-foreground underline underline-offset-2"
                  >
                    <MapPin className="size-3" />
                    map
                  </a>
                </Fact>
                <Fact name="Drop-off">
                  {ride.dropoff ? (
                    <>
                      {ride.dropoff.label}{" "}
                      <a
                        href={mapsLink(ride.dropoff.lat, ride.dropoff.lng)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-xs text-muted-foreground underline underline-offset-2"
                      >
                        <MapPin className="size-3" />
                        map
                      </a>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      None — driver at the customer&apos;s disposal
                    </span>
                  )}
                </Fact>
                <Fact name="Date and time">{rideWhen(ride.at)}</Fact>
                <Fact name="Mode">
                  {RIDE_MODE[ride.mode]}
                  {ride.mode === "HOURLY" && ride.hours ? ` · ${ride.hours} h` : ""}
                </Fact>
                <Fact name="Passengers">{ride.passengers}</Fact>
                <Fact name="Vehicle category">{ride.category?.name ?? "—"}</Fact>
                <Fact name="Distance">{distanceText(ride)}</Fact>
                <Fact name="Customer">
                  {ride.customer?.name ?? "—"}
                  {ride.customer?.phone ? (
                    <>
                      {" · "}
                      <a href={tel(ride.customer.phone)} className="underline underline-offset-2">
                        {ride.customer.phone}
                      </a>
                    </>
                  ) : null}
                </Fact>
                {ride.notes ? (
                  <div className="sm:col-span-2">
                    <Fact name={"Customer's note"}>
                      <span className="whitespace-pre-line">{ride.notes}</span>
                    </Fact>
                  </div>
                ) : null}
              </dl>
            </Card>

            {alerts.length ? (
              <Card className="gap-0 border-red-200 p-4 dark:border-red-900">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <ShieldAlert className="size-4 text-red-600" />
                  Security alerts
                </h2>
                <ul className="flex flex-col gap-2">
                  {alerts.map((a, i) => (
                    <li key={`${a.at}-${i}`} className="text-sm">
                      <span className="font-medium">
                        {RIDE_ACTOR[a.by] ?? a.by} · {formatDateTime(a.at)}
                      </span>
                      {" · "}
                      {typeof a.lat === "number" && typeof a.lng === "number" ? (
                        <a
                          href={mapsLink(a.lat, a.lng)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          position on the map
                        </a>
                      ) : (
                        <span className="text-muted-foreground">position not shared</span>
                      )}
                      {" · "}
                      <span className={a.smsSent ? "text-muted-foreground" : "text-red-600"}>
                        {a.smsSent ? "SMS sent to the office" : "SMS not sent — call them"}
                      </span>
                      {a.note ? <p className="text-muted-foreground">{a.note}</p> : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {ride.rating ? (
              <Card className="gap-0 p-4">
                <h2 className="mb-2 text-sm font-medium">Customer&apos;s rating</h2>
                <div className="flex items-center gap-2 text-sm">
                  <Stars n={ride.rating.score} />
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(ride.rating.at)}
                  </span>
                </div>
                {ride.rating.comment ? (
                  <p className="mt-1 whitespace-pre-line text-sm">{ride.rating.comment}</p>
                ) : null}
              </Card>
            ) : null}

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">History</h2>
              {ride.timeline?.length ? (
                <ol className="flex flex-col gap-2">
                  {ride.timeline.map((t, i) => (
                    <li key={`${t.at}-${i}`} className="flex gap-3 text-sm">
                      <span className="w-40 shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(t.at)}
                      </span>
                      <span>
                        <span className="font-medium" title={t.event}>
                          {label({}, t.event)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          ({RIDE_ACTOR[t.actor] ?? t.actor})
                        </span>
                        {t.detail ? (
                          <span className="text-muted-foreground"> · {t.detail}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing yet.</p>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">Driver</h2>
              {ride.driver ? (
                <div className="flex items-start gap-3">
                  <AssetImage
                    src={ride.driver.photo}
                    className="size-14 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{ride.driver.name}</p>
                    {ride.driver.ratingStats?.count ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Stars n={ride.driver.ratingStats.rating} />
                        {ride.driver.ratingStats.rating.toFixed(1)} ({ride.driver.ratingStats.count})
                      </p>
                    ) : null}
                    {ride.vehicle ? (
                      <p className="text-sm text-muted-foreground">
                        {[ride.vehicle.make, ride.vehicle.model, ride.vehicle.color]
                          .filter(Boolean)
                          .join(" ")}
                        {" · "}
                        <span className="font-mono">{ride.vehicle.plate}</span>
                      </p>
                    ) : null}
                    {ride.driver.phone ? (
                      <a href={tel(ride.driver.phone)} className="mt-2 inline-block">
                        <Button variant="outline" size="sm" className="gap-2">
                          <Phone className="size-3.5" />
                          {ride.driver.phone}
                        </Button>
                      </a>
                    ) : null}
                    {ride.assignedAt ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Assigned {formatDateTime(ride.assignedAt)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {ride.status === "PENDING" ? "No driver yet." : "No driver recorded."}
                </p>
              )}
            </Card>

            {canWrite && !closed ? (
              <Card className="gap-0 p-4">
                <h2 className="mb-3 text-sm font-medium">Actions</h2>
                <div className="flex flex-col gap-2">
                  {ride.status === "PENDING" ? (
                    <Button size="sm" onClick={() => setAssigning(true)}>
                      Assign a driver
                    </Button>
                  ) : null}
                  {ride.status === "ASSIGNED" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          setConfirming({
                            title: "Start the ride now?",
                            body: `Normally the driver presses Start on the portal once ${ride.customer?.name ?? "the customer"} is in the car. Done from here, the history records the office as the one who started it.`,
                            action: "Start the ride",
                            run: () => act("start")
                          })
                        }
                      >
                        Start the ride
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() =>
                          setConfirming({
                            title: "Remove the driver?",
                            body: `${ride.driver?.name ?? "The driver"} loses this ride and it waits for a driver again. Assign another one straight after — the customer hears nothing until then.`,
                            action: "Remove the driver",
                            run: () => act("unassign")
                          })
                        }
                      >
                        Remove the driver
                      </Button>
                    </>
                  ) : null}
                  {ride.status === "STARTED" ? (
                    <Button
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        setConfirming({
                          title: "End the ride now?",
                          body: "This completes the ride: the customer is thanked and asked to rate the driver. The booking stays open until it is marked completed on its booking page. Normally the driver presses End on the portal; do it here only when they cannot.",
                          action: "End the ride",
                          run: () => act("end")
                        })
                      }
                    >
                      End the ride
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => setCancelling(true)}
                  >
                    Cancel the ride
                  </Button>
                </div>
              </Card>
            ) : null}

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">Booking</h2>
              {order ? (
                <div className="text-sm">
                  <Link
                    href={`/bookings/${order.id}`}
                    className="font-mono font-medium hover:underline"
                  >
                    {order.reference}
                  </Link>
                  <p className="mt-1 text-muted-foreground">
                    {label(ORDER_STATUS, order.status)} · {label(PAYMENT_STATUS, order.paymentStatus)}{" "}
                    · {label(PAYMENT_METHOD, order.paymentMethod)}
                  </p>
                  <p className="mt-1 font-medium tabular-nums">{formatOrderTotal(order, locale)}</p>
                  {order.customer ? (
                    <div className="mt-3 border-t pt-3">
                      <p className="font-medium">{order.customer.fullName}</p>
                      {order.customer.phone ? (
                        <a href={tel(order.customer.phone)} className="mt-2 inline-block">
                          <Button variant="outline" size="sm" className="gap-2">
                            <Phone className="size-3.5" />
                            Call
                          </Button>
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  {order.paymentMethod === "CASH" &&
                  order.paymentStatus !== "PAID" &&
                  order.status !== "CANCELLED" ? (
                    // A ride's cash goes to the driver at the end of the ride; the
                    // office then records it. The cash-deadline job lets go of a
                    // booking whose ride was never driven; a driven one it waits for.
                    <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                      Cash: the driver collects it at the end of the ride. Record it on the
                      booking page.
                      {order.cashDeadline && !closed && ride.status !== "STARTED"
                        ? ` Not driven by ${formatDateTime(order.cashDeadline)} and still unpaid, the booking lapses.`
                        : ""}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Cash is recorded and documents are attached on the booking page. Cancelling
                    either one cancels the other.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No booking attached.</p>
              )}
            </Card>
          </div>
        </div>
      </div>

      {canWrite ? (
        <AssignDialog
          ride={ride}
          open={assigning}
          onOpenChange={setAssigning}
          onAssigned={refresh}
        />
      ) : null}

      <AlertDialog open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                // Stays open until the mutation succeeds (refresh closes it),
                // so a slow request cannot look like a no-op and invite a re-click.
                e.preventDefault();
                confirming?.run();
              }}
            >
              {isPending ? "Working…" : confirming?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={cancelling} onOpenChange={(open) => !cancelPending && setCancelling(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this ride?</DialogTitle>
            {/* Only a driver still to come is texted: one driving it is with the customer. */}
            <DialogDescription>
              The booking {ride.reference} is cancelled with it
              {ride.driver
                ? `; ${ride.driver.name} loses the ride${ride.status === "ASSIGNED" ? " and is texted" : ""}`
                : ""}. Cancelling moves no money by itself. If the customer is due a refund (80% of
              what was paid, after processing fees), the office pays it back outside the system.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-xs">Reason *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Why is it cancelled?" />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map(([value, text]) => (
                    <SelectItem key={value} value={value}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What the audit log should keep: who asked, what was agreed…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={cancelPending} onClick={() => setCancelling(false)}>
              Keep the ride
            </Button>
            <Button
              variant="destructive"
              disabled={!reason || cancelPending}
              onClick={() => cancel()}
            >
              {cancelPending ? "Cancelling…" : "Cancel ride and booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
