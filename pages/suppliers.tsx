import { assetUrl } from "@/api/endpoints";
import {
  createSupplier,
  deleteSupplier,
  deleteSupplierDocument,
  getSupplierDocumentLink,
  listSuppliers,
  updateSupplier,
  uploadSupplierDocuments,
  type Supplier,
  type SupplierInput
} from "@/api/functions/admin.api";
import DeleteButton from "@/components/DeleteButton";
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
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, formatDate } from "@/lib/functions/format.lib";
import { isOne } from "@/components/Transfers/transfers.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { FileText, Pencil, Plus, Search, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Suppliers: hotels, airlines and bus companies (the "travel agency" of a
 * route), car hire firms, property owners, tour operators.
 *
 * Recorded once here and picked from a list on every hotel and listing, so
 * whoever is on duty can call the supplier from a booking. A supplier that is
 * still named somewhere is switched off rather than deleted.
 */

const BLANK: Required<Omit<SupplierInput, "isActive">> = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  notes: ""
};

/** What the server takes: up to 15 MB each, 10 in one upload. */
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const MAX_DOCUMENTS_PER_UPLOAD = 10;

const message = (e: unknown, fallback: string) =>
  (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback;

export default function SuppliersPage() {
  const { t, locale } = useT();
  const queryClient = useQueryClient();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState({ ...BLANK });
  // The supplier the form is changing; null while it adds a new one.
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => listSuppliers(),
    refetchOnMount: "always"
  });
  const needle = search.trim().toLowerCase();
  const matching = (data?.items ?? []).filter(
    (s) =>
      !needle ||
      [s.name, s.contactName, s.phone, s.email].some((v) => v?.toLowerCase().includes(needle))
  );
  const { rows, pager } = usePaged(matching, needle);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["suppliers"] });

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => (editing ? updateSupplier(editing.id, draft) : createSupplier(draft)),
    meta: { showToast: false },
    onSuccess: () => {
      toast.success(editing ? t("tr.sup.saved") : t("tr.sup.added"));
      setDraft({ ...BLANK });
      setEditing(null);
      setShowForm(false);
      refresh();
    },
    onError: (e) => toast.error(message(e, t("tr.sup.saveFailed")))
  });

  const { mutate: setActive } = useMutation({
    mutationFn: (s: Supplier) => updateSupplier(s.id, { isActive: !s.isActive }),
    meta: { showToast: false },
    onSuccess: (_r, s) => {
      toast.success(s.isActive ? t("tr.sup.switchedOff") : t("tr.sup.switchedOn"));
      refresh();
    },
    onError: (e) => toast.error(message(e, t("tr.sup.changeFailed")))
  });

  // §7: the open supplier as last loaded — its documents change under the form.
  const current = (data?.items ?? []).find((s) => s.id === editing?.id) ?? editing;
  const fileInput = useRef<HTMLInputElement>(null);

  const { mutate: upload, isPending: uploading } = useMutation({
    mutationFn: ({ id, files }: { id: string; files: File[] }) => uploadSupplierDocuments(id, files),
    meta: { showToast: false },
    onSuccess: (_r, { files }) => {
      toast.success(
        files.length === 1 ? t("tr.sup.docAdded") : t("tr.sup.docsAdded", { n: files.length })
      );
      refresh();
    },
    onError: (e) => toast.error(message(e, t("tr.sup.uploadFailed")))
  });

  const pick = (id: string, list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (fileInput.current) fileInput.current.value = "";
    const fit = files.filter((f) => f.size <= MAX_DOCUMENT_BYTES);
    if (fit.length < files.length) toast.error(t("tr.sup.tooBig"));
    if (fit.length > MAX_DOCUMENTS_PER_UPLOAD) {
      toast.error(t("tr.sup.tooMany", { max: MAX_DOCUMENTS_PER_UPLOAD }));
    }
    if (fit.length) upload({ id, files: fit.slice(0, MAX_DOCUMENTS_PER_UPLOAD) });
  };

  /** Private files have no address: each open asks for a link that expires. */
  const openDocument = async (id: string, documentId: string) => {
    try {
      const { url } = await getSupplierDocumentLink(id, documentId);
      window.open(assetUrl(url), "_blank", "noopener");
    } catch (e) {
      toast.error(message(e, t("tr.sup.openFailed")));
    }
  };

  const edit = (s: Supplier) => {
    setEditing(s);
    setDraft({
      name: s.name,
      contactName: s.contactName,
      phone: s.phone,
      email: s.email,
      address: s.address,
      notes: s.notes
    });
    setShowForm(true);
  };

  const field = (key: keyof typeof BLANK, label: string, placeholder?: string) => (
    <div>
      <Label className="text-xs">
        {label}
        {key === "name" ? " *" : ""}
      </Label>
      <Input
        value={draft[key]}
        placeholder={placeholder}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <AdminLayout
      title={t("nav.suppliers")}
      description={t("tr.sup.description")}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-8"
              placeholder={t("tr.sup.search")}
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
              {t("tr.sup.add")}
            </Button>
          ) : null}
        </div>

        {canWrite && showForm ? (
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">
              {editing ? t("tr.sup.edit", { name: editing.name }) : t("tr.sup.new")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {field("name", t("tr.sup.name"), "Transco, Hôtel du Fleuve, Congo Airways…")}
              {field("contactName", t("tr.sup.contactName"), t("tr.sup.contactHint"))}
              {field("phone", t("tr.sup.phone"), "+243 81 000 00 00")}
              {field("email", t("common.email"), "reservations@…")}
              <div className="sm:col-span-2">
                {field("address", t("tr.sup.address"), t("tr.sup.addressHint"))}
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Label className="text-xs">{t("tr.sup.notes")}</Label>
                <Textarea
                  rows={2}
                  value={draft.notes}
                  placeholder={t("tr.sup.notesHint")}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" disabled={!draft.name.trim() || saving} onClick={() => save()}>
                {editing ? t("tr.sup.save") : t("tr.sup.add")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
            {/* Uploaded and deleted at once, not by Save. */}
            <div className="mt-5 border-t pt-4">
              <h3 className="mb-2 text-sm font-medium">{t("tr.sup.documents")}</h3>
              {!current ? (
                <p className="text-xs text-muted-foreground">
                  {t("tr.sup.saveFirst")}
                </p>
              ) : (
                <>
                  {current.documents?.length ? (
                    <ul className="mb-3 divide-y rounded-md border">
                      {current.documents.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-medium" title={d.fileName}>
                            {d.fileName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatBytes(d.size)} · {formatDate(d.uploadedAt)}
                            {d.uploadedBy ? ` · ${d.uploadedBy}` : ""}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={t("tr.sup.openAria", { name: d.fileName })}
                            onClick={() => openDocument(current.id, d.id)}
                          >
                            {t("tr.sup.open")}
                          </Button>
                          <DeleteButton
                            permission="inventory:write"
                            what={t("tr.sup.deleteDocWhat", { name: d.fileName })}
                            onDelete={() => deleteSupplierDocument(current.id, d.id)}
                            onDeleted={refresh}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-3 text-xs text-muted-foreground">{t("tr.sup.noDocs")}</p>
                  )}
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => pick(current.id, e.target.files)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={uploading}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload className="size-3.5" />
                    {uploading ? t("tr.sup.uploading") : t("tr.sup.upload")}
                  </Button>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("tr.sup.fileHint")}
                  </p>
                </>
              )}
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
                  <TableHead>{t("tr.sup.colSupplier")}</TableHead>
                  <TableHead>{t("tr.sup.colContact")}</TableHead>
                  <TableHead>{t("tr.sup.address")}</TableHead>
                  <TableHead className="text-end">{t("tr.sup.colUsedOn")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  {canWrite ? <TableHead className="text-end">{t("common.actions")}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("common.loading")}
                    </TableCell>
                  </TableRow>
                ) : !rows.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      {needle
                        ? t("tr.sup.noMatch")
                        : t("tr.sup.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((s) => {
                    const used = (s.usedBy?.hotels ?? 0) + (s.usedBy?.listings ?? 0);
                    return (
                      <TableRow key={s.id} className={s.isActive ? "" : "opacity-60"}>
                        <TableCell>
                          <p className="font-medium">{s.name}</p>
                          {s.documents?.length ? (
                            <p className="text-xs text-muted-foreground">
                              {t(
                                isOne(locale, s.documents.length)
                                  ? "tr.sup.docCount.one"
                                  : "tr.sup.docCount.other",
                                { n: s.documents.length }
                              )}
                            </p>
                          ) : null}
                          {s.notes ? (
                            <p className="max-w-64 truncate text-xs text-muted-foreground" title={s.notes}>
                              {s.notes}
                            </p>
                          ) : null}
                        </TableCell>
                        {/* One column: who to ask for, and how to reach them. */}
                        <TableCell className="text-sm">
                          {s.contactName ? <p>{s.contactName}</p> : null}
                          {s.phone ? (
                            <a
                              href={`tel:${s.phone.replace(/\s/g, "")}`}
                              className="block whitespace-nowrap hover:underline"
                            >
                              <span dir="ltr">{s.phone}</span>
                            </a>
                          ) : null}
                          {s.email ? (
                            <a
                              href={`mailto:${s.email}`}
                              className="block max-w-64 truncate text-muted-foreground hover:underline"
                              title={s.email}
                            >
                              {s.email}
                            </a>
                          ) : null}
                          {!s.contactName && !s.phone && !s.email ? "—" : null}
                        </TableCell>
                        <TableCell className="max-w-56 whitespace-normal text-muted-foreground">
                          {s.address || "—"}
                        </TableCell>
                        <TableCell className="text-end tabular-nums text-muted-foreground">
                          {s.usedBy?.hotels
                            ? t(isOne(locale, s.usedBy.hotels) ? "tr.sup.hotels.one" : "tr.sup.hotels.other", {
                                n: s.usedBy.hotels
                              })
                            : ""}
                          {s.usedBy?.hotels && s.usedBy?.listings ? " · " : ""}
                          {s.usedBy?.listings
                            ? t(
                                isOne(locale, s.usedBy.listings)
                                  ? "tr.sup.listings.one"
                                  : "tr.sup.listings.other",
                                { n: s.usedBy.listings }
                              )
                            : ""}
                          {!used ? "—" : ""}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.isActive ? "secondary" : "outline"}>
                            {s.isActive ? t("tr.sup.active") : t("tr.sup.off")}
                          </Badge>
                        </TableCell>
                        {canWrite ? (
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" title={t("common.edit")} onClick={() => edit(s)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setActive(s)}>
                                {s.isActive ? t("tr.sup.switchOff") : t("tr.sup.switchOn")}
                              </Button>
                              <DeleteButton
                                permission="inventory:delete"
                                what={t("tr.sup.deleteWhat", { name: s.name })}
                                consequence={t("tr.sup.deleteConsequence")}
                                disabled={used > 0}
                                onDelete={() => deleteSupplier(s.id)}
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
        <Pager {...pager} noun={t("tr.sup.noun")} plural={t("tr.sup.nounPlural")} />
      </div>
    </AdminLayout>
  );
}
