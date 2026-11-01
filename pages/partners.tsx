import {
  createPartner,
  deletePartner,
  listPartners,
  updatePartner,
  uploadPartnerLogo,
  type Partner
} from "@/api/functions/partners.api";
import DeleteButton from "@/components/DeleteButton";
import AssetImage from "@/components/Form/AssetImage";
import ImageUploader from "@/components/Form/ImageUploader";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Pencil, Plus, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Partners: the logos in the "Our partners" section of the website's homepage
 * and the app's Explore screen, each opening the partner's website when it has
 * one. While none is switched on, the section is not shown at all.
 */

// The order box holds text while it is typed; a blank one is the default, 0.
const BLANK = { name: "", logo: "", website: "", sortOrder: "0" };

const message = (e: unknown, fallback: string) =>
  (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback;

export default function PartnersPage() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const { can } = useCan();
  const canWrite = can("content:write");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState({ ...BLANK });
  // The partner the form is changing; null while it adds a new one.
  const [editing, setEditing] = useState<Partner | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["partners"],
    queryFn: listPartners,
    refetchOnMount: "always"
  });
  const needle = search.trim().toLowerCase();
  const matching = (data?.items ?? []).filter(
    (p) =>
      !needle ||
      [p.name, p.website].some((v) => v?.toLowerCase().includes(needle))
  );
  const { rows, pager } = usePaged(matching, needle);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["partners"] });

  const close = () => {
    setDraft({ ...BLANK });
    setEditing(null);
    setShowForm(false);
  };

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => {
      const body = { ...draft, sortOrder: Number(draft.sortOrder) || 0 };
      return editing
        ? updatePartner(editing.id, { ...body, version: editing.version })
        : createPartner(body);
    },
    meta: { showToast: false },
    onSuccess: () => {
      // Cached on the way out, as the site's wording is.
      toast.success(editing ? t("tr.partners.saved") : t("tr.partners.added"));
      close();
      refresh();
    },
    onError: (e) => {
      toast.error(message(e, t("tr.partners.saveFailed")));
      // 409: saved by someone else meanwhile. Re-read the list, or Edit starts
      // again from the same old version and is refused again.
      if ((e as AxiosError).response?.status === 409) refresh();
    }
  });

  const { mutate: setActive } = useMutation({
    mutationFn: (p: Partner) => updatePartner(p.id, { isActive: !p.isActive }),
    meta: { showToast: false },
    onSuccess: (_r, p) => {
      toast.success(
        p.isActive ? t("tr.partners.switchedOff") : t("tr.partners.switchedOn")
      );
      refresh();
    },
    onError: (e) => toast.error(message(e, t("tr.partners.changeFailed")))
  });

  const edit = (p: Partner) => {
    setEditing(p);
    setDraft({
      name: p.name,
      logo: p.logo,
      website: p.website,
      sortOrder: String(p.sortOrder)
    });
    setShowForm(true);
  };

  const columns = canWrite ? 5 : 4;

  return (
    <AdminLayout
      title={t("nav.partners")}
      description={t("tr.partners.description")}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-8"
              placeholder={t("tr.partners.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canWrite ? (
            <Button
              size="sm"
              className="ms-auto gap-2"
              onClick={() => {
                setEditing(null);
                setDraft({ ...BLANK });
                setShowForm((open) => !open || Boolean(editing));
              }}
            >
              <Plus className="size-4" />
              {t("tr.partners.add")}
            </Button>
          ) : null}
        </div>

        {canWrite && showForm ? (
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">
              {editing ? t("tr.partners.edit", { name: editing.name }) : t("tr.partners.new")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-xs">{t("tr.partners.name")}</Label>
                <Input
                  value={draft.name}
                  maxLength={120}
                  placeholder="Congo Airways, Pullman Kinshasa…"
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">{t("tr.partners.website")}</Label>
                <Input
                  type="url"
                  value={draft.website}
                  placeholder="https://…"
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, website: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">{t("tr.partners.order")}</Label>
                <Input
                  type="number"
                  step={1}
                  value={draft.sortOrder}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, sortOrder: e.target.value }))
                  }
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("tr.partners.orderHint")}
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <ImageUploader
                  label={t("tr.partners.logo")}
                  folder="partners"
                  single
                  upload={uploadPartnerLogo}
                  permission="content:write"
                  value={draft.logo ? [draft.logo] : []}
                  onChange={(next) =>
                    setDraft((d) => ({ ...d, logo: next[0] ?? "" }))
                  }
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("tr.partners.logoHint")}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                disabled={!draft.name.trim() || !draft.logo || saving}
                onClick={() => save()}
              >
                {editing ? t("tr.partners.save") : t("tr.partners.add")}
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
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tr.partners.colLogo")}</TableHead>
                  <TableHead>{t("tr.partners.colPartner")}</TableHead>
                  <TableHead className="text-end">{t("tr.partners.order")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  {canWrite ? (
                    <TableHead className="text-end">{t("common.actions")}</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns}
                      className="py-10 text-center text-muted-foreground"
                    >
                      {t("common.loading")}
                    </TableCell>
                  </TableRow>
                ) : !rows.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {needle
                        ? t("tr.partners.noMatch")
                        : t("tr.partners.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((p) => (
                    <TableRow
                      key={p.id}
                      className={p.isActive ? "" : "opacity-60"}
                    >
                      <TableCell>
                        <AssetImage
                          src={p.logo}
                          title={p.name}
                          className="h-10 w-24 object-contain p-0.5"
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{p.name}</p>
                        {p.website ? (
                          <a
                            href={p.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block max-w-64 truncate text-xs text-muted-foreground hover:underline"
                            title={p.website}
                          >
                            {p.website}
                          </a>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {t("tr.partners.noWebsite")}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {p.sortOrder}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.isActive ? "secondary" : "outline"}>
                          {p.isActive ? t("tr.partners.shown") : t("tr.partners.off")}
                        </Badge>
                      </TableCell>
                      {canWrite ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t("common.edit")}
                              onClick={() => edit(p)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setActive(p)}
                            >
                              {p.isActive ? t("tr.partners.switchOff") : t("tr.partners.switchOn")}
                            </Button>
                            <DeleteButton
                              permission="content:delete"
                              what={t("tr.partners.deleteWhat", { name: p.name })}
                              consequence={t("tr.partners.deleteConsequence")}
                              onDelete={() => deletePartner(p.id)}
                              onDeleted={refresh}
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
        <Pager {...pager} noun={t("tr.partners.noun")} plural={t("tr.partners.nounPlural")} />
      </div>
    </AdminLayout>
  );
}
