import { listVisaCountries } from "@/api/functions/visa.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
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
import { formatDate, formatMoney } from "@/lib/functions/format.lib";
import { lz } from "@/lib/functions/localized.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/** The countries the office applies for, each with its towns and offers. */
export default function VisaCountriesPage() {
  const { t } = useT();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const [q, setQ] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["visa-countries"],
    queryFn: listVisaCountries,
    refetchOnMount: "always"
  });

  const term = q.trim().toLowerCase();
  const items = (data?.items ?? []).filter(
    (c) => !term || c.code.toLowerCase() === term || lz(c.name).toLowerCase().includes(term)
  );
  const { rows, pager } = usePaged(items, term);
  const columns = 6;

  return (
    <AdminLayout title={t("visa.countries.title")} description={t("visa.countries.description")}>
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
          {canWrite ? (
            <Link href="/e-visa/countries/new" className="ms-auto">
              <Button className="gap-2">
                <Plus className="size-4" />
                {t("visa.countries.new")}
              </Button>
            </Link>
          ) : null}
        </div>

        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("visa.country")}</TableHead>
                  <TableHead>{t("visa.countries.towns")}</TableHead>
                  <TableHead>{t("visa.countries.offers")}</TableHead>
                  <TableHead className="text-end">{t("visa.countries.from")}</TableHead>
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
                      {term ? t("common.noResults") : t("visa.countries.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((c) => {
                    const offers = (c.offers ?? []).filter((o) => o.isActive);
                    const fees = offers.map((o) => o.serviceFee?.CDF ?? 0).filter((n) => n > 0);
                    const towns = (c.towns ?? []).filter((x) => x.isActive);
                    return (
                      <TableRow key={c.id} className={c.isActive ? "" : "opacity-70"}>
                        <TableCell>
                          <Link href={`/e-visa/countries/${c.id}`} className="font-medium hover:underline">
                            {lz(c.name)}
                          </Link>
                          <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                            {c.code}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-normal text-sm text-muted-foreground">
                          {towns.map((x) => lz(x.name)).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="whitespace-normal text-sm text-muted-foreground">
                          {offers.map((o) => lz(o.visaTypeName)).filter(Boolean).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {fees.length ? formatMoney(Math.min(...fees)) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              c.isActive
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : undefined
                            }
                          >
                            {c.isActive ? t("visa.live") : t("visa.notLive")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(c.updatedAt)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager {...pager} noun={t("visa.countries.one")} plural={t("visa.countries.other")} />
      </div>
    </AdminLayout>
  );
}
