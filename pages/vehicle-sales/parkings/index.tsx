import { listCatalogue, listParkings, refId } from "@/api/functions/admin.api";
import AssetImage from "@/components/Form/AssetImage";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { CitySelect } from "@/components/Transfers/transfers.lib";
import { StatusBadge, StatusFilter } from "@/components/VehicleSales/shared";
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
import { formatDate } from "@/lib/functions/format.lib";
import { lz } from "@/lib/functions/localized.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/** Parkings: where the vehicles for sale stand, one or more per town. */
export default function ParkingsPage() {
  const { t } = useT();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("");
  const term = useDebounce(q.trim(), 300);
  const params = { q: term, city, status };

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["parkings", params],
    queryFn: () => listParkings(params),
    refetchOnMount: "always",
    placeholderData: keepPreviousData
  });
  const { data: types } = useQuery({
    queryKey: ["vs-catalogue", "types"],
    queryFn: () => listCatalogue("types"),
    staleTime: 60 * 1000
  });
  const typeName = (r: unknown) =>
    typeof r === "object" && r
      ? lz((r as { name?: unknown }).name)
      : lz(types?.items.find((x) => x.id === refId(r))?.name);
  const { rows, pager } = usePaged(data?.items ?? [], `${term}|${city}|${status}`);
  const columns = 6;

  return (
    <AdminLayout title={t("nav.vehicleSales.parkings")} description={t("vs.parking.listDescription")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 max-w-sm flex-1">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.search")}
              className="ps-9"
            />
          </div>
          <CitySelect any value={city} onChange={setCity} />
          <StatusFilter value={status} onChange={setStatus} />
          {canWrite ? (
            <Link href="/vehicle-sales/parkings/new" className="ms-auto">
              <Button className="gap-2">
                <Plus className="size-4" />
                {t("vs.parking.new")}
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
                  <TableHead>{t("vs.parking.title")}</TableHead>
                  <TableHead>{t("common.city")}</TableHead>
                  <TableHead>{t("vs.cat.tab.types")}</TableHead>
                  <TableHead className="text-end">{t("nav.vehicleSales.vehicles")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("common.updated")}</TableHead>
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
                      {term || city || status ? t("common.noResults") : t("vs.parking.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <AssetImage
                            src={p.images?.[0]}
                            className="size-9 shrink-0"
                            title={p.images?.length ? undefined : t("inv.list.noImage")}
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/vehicle-sales/parkings/${p.id}`}
                              className="font-medium hover:underline"
                            >
                              {lz(p.name)}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">{p.address}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{p.city}</TableCell>
                      <TableCell className="whitespace-normal text-sm text-muted-foreground">
                        {(p.vehicleTypes ?? []).map(typeName).filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        <Link
                          href={`/vehicle-sales?parking=${p.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {p.vehicleCount ?? "→"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={p.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(p.updatedAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager {...pager} noun={t("vs.parking.one")} plural={t("vs.parking.other")} />
      </div>
    </AdminLayout>
  );
}
