import {
  listCatalogue,
  listParkings,
  listSaleVehicles,
  refId,
  type Parking,
  type SaleVehicle
} from "@/api/functions/admin.api";
import AssetImage from "@/components/Form/AssetImage";
import { OptionSelect } from "@/components/Form/OptionSelect";
import { PromoNote } from "@/components/Form/PromotionFields";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { PAGE_SIZE, usePage } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { CitySelect, sameCity } from "@/components/Transfers/transfers.lib";
import {
  AVAILABILITY,
  AvailabilityBadge,
  StatusBadge,
  StatusFilter,
  vehicleName
} from "@/components/VehicleSales/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/utils/useDebounce";
import { formatMoney } from "@/lib/functions/format.lib";
import { lz } from "@/lib/functions/localized.lib";
import { numberLocale } from "@/lib/i18n/dictionaries";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

/** Vehicles for sale: every vehicle of every parking, narrowed by town, parking, type, status and availability. */
export default function SaleVehiclesPage() {
  const router = useRouter();
  const { t, locale } = useT();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [parking, setParking] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [availability, setAvailability] = useState("");
  // A parking's "See its vehicles", or a booking's stock ref, lands here filtered.
  useEffect(() => {
    if (typeof router.query.q === "string") setQ(router.query.q);
    if (typeof router.query.parking === "string") setParking(router.query.parking);
  }, [router.query.q, router.query.parking]);

  const term = useDebounce(q.trim(), 300);
  const filters = { q: term, city, parking, type, status, availability };
  const [page, setPage] = usePage(JSON.stringify(filters));
  const params = { ...filters, page, limit: PAGE_SIZE };
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["sale-vehicles", params],
    queryFn: () => listSaleVehicles(params),
    refetchOnMount: "always",
    placeholderData: keepPreviousData
  });
  const { data: parkings } = useQuery({
    queryKey: ["parkings", {}],
    queryFn: () => listParkings(),
    staleTime: 60 * 1000
  });
  const { data: types } = useQuery({
    queryKey: ["vs-catalogue", "types"],
    queryFn: () => listCatalogue("types"),
    staleTime: 60 * 1000
  });
  const parkingOf = (v: SaleVehicle) =>
    typeof v.parking === "object" && v.parking
      ? v.parking
      : parkings?.items.find((p) => p.id === refId(v.parking));
  const typeOf = (v: SaleVehicle) =>
    typeof v.vehicleType === "object" && v.vehicleType
      ? v.vehicleType
      : types?.items.find((x) => x.id === refId(v.vehicleType));
  const parkingOptions = (parkings?.items ?? []).filter(
    (p: Parking) => !city || sameCity(p.city, city) || p.id === parking
  );
  const filtered = Object.values(filters).some(Boolean);
  const columns = 6;

  return (
    <AdminLayout title={t("nav.vehicleSales")} description={t("vs.vehicle.listDescription")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 max-w-sm flex-1">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("vs.vehicle.searchPlaceholder")}
              className="ps-9"
            />
          </div>
          <CitySelect any value={city} onChange={setCity} />
          <OptionSelect
            aria-label={t("vs.parking.title")}
            className="w-auto min-w-40"
            value={parking}
            onChange={setParking}
            options={[
              { value: "", label: t("vs.vehicle.allParkings") },
              ...parkingOptions.map((p) => ({ value: p.id, label: `${lz(p.name)} · ${p.city}` }))
            ]}
          />
          <OptionSelect
            aria-label={t("vs.vehicle.type")}
            className="w-auto min-w-36"
            value={type}
            onChange={setType}
            options={[
              { value: "", label: t("vs.vehicle.allTypes") },
              ...(types?.items ?? []).map((x) => ({ value: x.id, label: lz(x.name) }))
            ]}
          />
          <OptionSelect
            aria-label={t("vs.vehicle.availability")}
            className="w-auto min-w-36"
            value={availability}
            onChange={setAvailability}
            options={[
              { value: "", label: t("vs.vehicle.anyAvailability") },
              ...Object.entries(AVAILABILITY).map(([value, key]) => ({ value, label: t(key) }))
            ]}
          />
          <StatusFilter value={status} onChange={setStatus} />
          {canWrite ? (
            <Link href={`/vehicle-sales/vehicles/new${parking ? `?parking=${parking}` : ""}`} className="ms-auto">
              <Button className="gap-2">
                <Plus className="size-4" />
                {t("vs.vehicle.new")}
              </Button>
            </Link>
          ) : null}
        </div>

        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <div
            aria-busy={isPlaceholderData || undefined}
            className={cn("overflow-x-auto rounded-lg border bg-background", isPlaceholderData && "opacity-60")}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("vs.vehicle.stockRef")}</TableHead>
                  <TableHead>{t("vs.vehicle.vehicle")}</TableHead>
                  <TableHead>{t("vs.parking.title")}</TableHead>
                  <TableHead className="text-end">{t("vs.vehicle.price")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("vs.vehicle.availability")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody inert={isPlaceholderData || undefined}>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">
                      {t("common.loading")}
                    </TableCell>
                  </TableRow>
                ) : !data?.items.length ? (
                  <TableRow>
                    <TableCell colSpan={columns} className="py-10 text-center text-sm text-muted-foreground">
                      {filtered ? t("common.noResults") : t("vs.vehicle.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((v) => {
                    const p = parkingOf(v);
                    return (
                      <TableRow key={v.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <AssetImage
                              src={v.images?.[0]}
                              className="h-9 w-14 shrink-0 object-cover"
                              title={v.images?.length ? undefined : t("inv.list.noImage")}
                            />
                            <span className="font-mono text-sm" dir="ltr">
                              {v.stockRef}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/vehicle-sales/vehicles/${v.id}`}
                            className="font-medium hover:underline"
                          >
                            {vehicleName(v)}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {[
                              lz(typeOf(v)?.name),
                              typeof v.mileageKm === "number"
                                ? t("vs.vehicle.km", { n: v.mileageKm.toLocaleString(numberLocale(locale)) })
                                : "",
                              v.condition ? t(`vs.condition.${v.condition}`) : "",
                              v.colour
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {p ? lz(p.name) : "—"}
                          <p className="text-xs text-muted-foreground">{p?.city ?? v.city}</p>
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {formatMoney(v.sellPrice?.CDF, "CDF", locale)}
                          <PromoNote item={v} locale={locale} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={v.status} />
                        </TableCell>
                        <TableCell>
                          <AvailabilityBadge value={v.availability} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager
          page={page}
          total={data?.total ?? 0}
          onPage={setPage}
          noun={t("vs.vehicle.one")}
          plural={t("vs.vehicle.other")}
        />
      </div>
    </AdminLayout>
  );
}
