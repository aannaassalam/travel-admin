import { listCustomers } from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { PAGE_SIZE, usePage } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import SortHead, { type Sort } from "@/components/SortHead";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/utils/useDebounce";
import { formatDate } from "@/lib/functions/format.lib";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function CustomersPage() {
  const router = useRouter();
  const { t } = useT();
  const [q, setQ] = useState("");
  // Global search's "See all" row lands here with the term already applied.
  useEffect(() => {
    if (typeof router.query.q === "string") setQ(router.query.q);
  }, [router.query.q]);
  const term = useDebounce(q.trim(), 300);
  // Newest first until a column heading is pressed.
  const [sort, setSort] = useState<Sort>("");
  const head = { sort, onSort: setSort };
  const [page, setPage] = usePage(`${term}|${sort}`);
  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: ["customers", term, sort, page],
    queryFn: () => listCustomers(term, { page, limit: PAGE_SIZE, sort }),
    // A customer is blocked, renamed or deleted on their own page; coming back
    // must show it.
    refetchOnMount: "always",
    placeholderData: keepPreviousData
  });

  return (
    <AdminLayout
      title={t("nav.customers")}
      description={t("ops.customers.description")}
    >
      <div className="flex flex-col gap-4">
        <div className="relative max-w-sm">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("ops.customers.searchPlaceholder")}
            className="ps-9"
          />
        </div>

        <div
          // The rows of the order, page or search before stay up while the
          // next ones load — dimmed and out of reach, so they are not read as
          // the answer, nor pressed just as they change.
          aria-busy={isPlaceholderData || undefined}
          className={cn(
            "rounded-lg border bg-background",
            isPlaceholderData && "opacity-60"
          )}
        >
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <SortHead column="name" {...head}>
                  {t("common.name")}
                </SortHead>
                <SortHead column="phone" {...head}>
                  {t("common.phone")}
                </SortHead>
                <SortHead column="status" {...head}>
                  {t("common.status")}
                </SortHead>
                <SortHead column="since" {...head}>
                  {t("ops.customers.since")}
                </SortHead>
              </TableRow>
            </TableHeader>
            <TableBody inert={isPlaceholderData || undefined}>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={4} className="p-0">
                    <QueryError onRetry={() => refetch()} />
                  </TableCell>
                </TableRow>
              ) : !data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    {t("ops.customers.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link href={`/customers/${c.id}`} className="hover:underline">
                        {c.fullName}
                      </Link>
                    </TableCell>
                    {/* §8: masked here, revealed on the detail screen. A
                        screenshot of this list must not be a customer database. */}
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      <span dir="ltr">{c.phoneMasked}</span>
                    </TableCell>
                    <TableCell>
                      {/* Blocked customers cannot sign in or book. */}
                      {c.isBlocked ? (
                        <Badge variant="destructive">{t("ops.customers.blocked")}</Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        >
                          {t("ops.customers.active")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Pager page={page} total={data?.total ?? 0} onPage={setPage} noun={t("ops.noun.customer")} plural={t("ops.noun.customers")} />

        <p className="text-xs text-muted-foreground">
          {t("ops.customers.maskedNote")}
        </p>
      </div>
    </AdminLayout>
  );
}
