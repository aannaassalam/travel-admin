import { refId } from "@/api/functions/admin.api";
import {
  deleteShop,
  listDutyFree,
  listShops,
  setShopStatus,
  type DutyFreeShop,
  type DutyFreeStatusAction
} from "@/api/functions/dutyFree.api";
import DeleteButton from "@/components/DeleteButton";
import AssetImage from "@/components/Form/AssetImage";
import { OptionSelect } from "@/components/Form/OptionSelect";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { message } from "@/components/Transfers/transfers.lib";
import { STATUS_DONE, StatusBadge, StatusFilter } from "@/components/VehicleSales/shared";
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
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Duty Free shops, with the restaurant list's columns and actions: publish or
 * take down, delete. Products are added on each shop's own page.
 */
export default function DutyFreeShopsPage() {
  const router = useRouter();
  const { t } = useT();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const term = useDebounce(q.trim(), 300);
  const params = { q: term, category, status };

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["df-shops", params],
    queryFn: () => listShops(params),
    refetchOnMount: "always",
    placeholderData: keepPreviousData
  });
  const { data: categories } = useQuery({
    queryKey: ["df-list", "categories"],
    queryFn: () => listDutyFree("categories"),
    staleTime: 60 * 1000
  });
  const categoryName = (c: unknown) =>
    typeof c === "object" && c
      ? lz((c as { name?: unknown }).name)
      : lz(categories?.items.find((x) => x.id === refId(c))?.name);
  const { rows, pager } = usePaged(data?.items ?? [], `${term}|${category}|${status}`);
  const filtered = Boolean(term || category || status);

  // Deactivate asks first, as on the inventory list.
  const [pending, setPending] = useState<DutyFreeShop | null>(null);
  const { mutate: act, isPending: acting } = useMutation({
    mutationFn: ({ shop, action }: { shop: DutyFreeShop; action: DutyFreeStatusAction }) =>
      setShopStatus(shop.id, action),
    meta: { showToast: false },
    onSuccess: (_r, { shop, action }) => {
      setPending(null);
      toast.success(t(STATUS_DONE[action], { name: lz(shop.name) }));
    },
    // A refused publish says what is missing; the shop's page is where it is fixed.
    onError: (e, { shop }) =>
      toast.error(message(e, t("inv.list.actionFailed")), {
        action: {
          label: t("inv.list.open"),
          onClick: () => router.push(`/duty-free/shops/${shop.id}`)
        }
      })
  });

  const columns = canWrite ? 7 : 6;

  return (
    <AdminLayout title={t("nav.dutyFree.shops")} description={t("df.shops.description")}>
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
          <OptionSelect
            aria-label={t("df.shops.col.category")}
            className="w-auto min-w-44"
            value={category}
            onChange={setCategory}
            options={[
              { value: "", label: t("df.shops.allCategories") },
              ...(categories?.items ?? []).map((c) => ({ value: c.id, label: lz(c.name) }))
            ]}
          />
          <StatusFilter value={status} onChange={setStatus} />
          {canWrite ? (
            <Link href="/duty-free/shops/new" className="ms-auto">
              <Button className="gap-2">
                <Plus className="size-4" />
                {t("df.shops.new")}
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
                  <TableHead>{t("df.shops.col.shop")}</TableHead>
                  <TableHead>{t("df.shops.col.category")}</TableHead>
                  <TableHead>{t("common.city")}</TableHead>
                  <TableHead className="text-end">{t("df.shops.col.products")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("common.updated")}</TableHead>
                  {canWrite ? <TableHead className="text-end">{t("common.actions")}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody inert={isPlaceholderData || undefined}>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">
                      {t("common.loading")}
                    </TableCell>
                  </TableRow>
                ) : !rows.length ? (
                  <TableRow>
                    <TableCell colSpan={columns} className="py-10 text-center">
                      <p className="text-sm text-muted-foreground">
                        {filtered ? t("common.noResults") : t("df.shops.empty")}
                      </p>
                      {canWrite && !filtered ? (
                        <Link href="/duty-free/shops/new">
                          <Button size="sm" className="mt-3 gap-2">
                            <Plus className="size-4" />
                            {t("df.shops.new")}
                          </Button>
                        </Link>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <AssetImage
                            src={s.images?.[0]}
                            className="size-9 shrink-0"
                            title={s.images?.length ? undefined : t("inv.list.noImage")}
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/duty-free/shops/${s.id}`}
                              className="font-medium hover:underline"
                            >
                              {lz(s.name)}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">{s.address}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{categoryName(s.category) || "—"}</TableCell>
                      <TableCell>{s.city || "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {/* A shop with nothing to sell cannot be published: worth seeing in red. */}
                        <span className={s.productCount === 0 ? "text-red-600" : ""}>
                          {s.productCount ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={s.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(s.updatedAt)}</TableCell>
                      {canWrite ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {s.status === "PUBLISHED" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1.5 px-2 text-xs"
                                title={t("inv.list.takeDown")}
                                onClick={() => setPending(s)}
                              >
                                <EyeOff className="size-3.5" />
                                {t("inv.list.deactivate")}
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1.5 px-2 text-xs text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                                title={t("inv.list.putUp")}
                                disabled={acting}
                                onClick={() => act({ shop: s, action: "publish" })}
                              >
                                <Eye className="size-3.5" />
                                {t("common.publish")}
                              </Button>
                            )}
                            <DeleteButton
                              permission="inventory:delete"
                              what={t("df.shop.deleteWhat", { name: lz(s.name) })}
                              consequence={t("df.shop.deleteConsequence")}
                              onDelete={(confirmed) => deleteShop(s.id, confirmed)}
                              // Not a mutation: the list is read again here.
                              onDeleted={() => refetch()}
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
        <Pager {...pager} noun={t("df.shop.one")} plural={t("df.shop.other")} />
      </div>

      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("inv.list.confirm.deactivate", { name: lz(pending?.name) })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("inv.list.confirm.deactivateBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={acting}
              onClick={(e) => {
                // Up until the answer, so a slow network does not invite a second click.
                e.preventDefault();
                if (pending) act({ shop: pending, action: "deactivate" });
              }}
            >
              {acting ? t("inv.list.working") : t("inv.list.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
