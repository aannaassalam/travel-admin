import {
  CsvSeparator,
  downloadInventoryCsv,
  getImportGuide,
  importInventoryCsv,
  ImportReport
} from "@/api/functions/admin.api";
import { SortButton, sortRows, sortState, type Sort } from "@/components/SortHead";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

/** The two shapes a spreadsheet program writes a CSV in. */
export const CSV_FORMATS: { sep: CsvSeparator; label: TranslationKey; hint: TranslationKey }[] = [
  { sep: "semicolon", label: "inv.import.format.semicolon", hint: "inv.import.format.semicolonHint" },
  { sep: "comma", label: "inv.import.format.comma", hint: "inv.import.format.commaHint" }
];

/**
 * A spreadsheet's bytes as text.
 *
 * "CSV UTF-8" is one of Excel's save options, but the plain "CSV" above it in
 * the list writes Windows-1252 — and read as UTF-8 every é in that file comes
 * out as a broken character. So try UTF-8 strictly and, if the bytes are not
 * valid UTF-8, read them as what Excel actually wrote.
 */
const readSpreadsheet = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Excel's "Unicode Text" is UTF-16, and says so in its first two bytes.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Excel's "CSV (Macintosh)" ends its rows with a bare CR and writes Mac OS
    // Roman, where é is another byte again: read as Windows-1252 it imports
    // as "H™tel". Judged by how most rows end, not by one byte — a Windows
    // file can carry a lone CR inside a cell.
    let bareCr = 0;
    let lf = 0;
    bytes.forEach((b, i) => {
      if (b === 0x0a) lf += 1;
      else if (b === 0x0d && bytes[i + 1] !== 0x0a) bareCr += 1;
    });
    return new TextDecoder(bareCr > lf ? "macintosh" : "windows-1252").decode(bytes);
  }
};

/**
 * The server reads no more than this. A full file of a thousand rows is a
 * fraction of it, so anything larger is the wrong file — said here, before
 * the upload rather than after it.
 */
const MAX_FILE_BYTES = 5_000_000;

const message = (e: unknown, fallback: string) =>
  (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback;

/**
 * Bulk import for one kind of inventory: download the template, fill it in,
 * choose the file. The file is checked the moment it is chosen and nothing is
 * written until that report is clean and the import is confirmed (§2.2).
 */
export default function SpreadsheetImport({
  group,
  noun,
  singular,
  onImported,
  onClose
}: {
  group: string;
  /** "hotels", "flights" — for the sentences. */
  noun: string;
  /** "hotel", "flight" — for when there is exactly one. */
  singular: string;
  onImported: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  // A column's help in the panel's language where the panel has it (trip_scope),
  // else the server's English. t() hands back the key itself when it has none.
  const helpOf = (c: { key: string; help: string }) => {
    const key = `inv.import.help.${c.key}` as TranslationKey;
    const own = t(key);
    return own === key ? c.help : own;
  };
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const { data: guide } = useQuery({
    queryKey: ["import-guide", group],
    queryFn: () => getImportGuide(group),
    staleTime: 5 * 60 * 1000
  });
  const columns = (guide?.columns ?? []).filter((c) => !c.readOnly);
  // As they stand in the spreadsheet, left to right, until a heading is pressed.
  const [sort, setSort] = useState<Sort>("");
  const head = { sort, onSort: setSort };
  const listed = sortRows(columns, sort, {
    column: (c) => c.key,
    what: (c) => c.help,
    example: (c) => c.example
  });

  const { mutate: template, isPending: downloading } = useMutation({
    mutationFn: (sep: CsvSeparator) => downloadInventoryCsv(group, "template", sep),
    meta: { showToast: false },
    onError: (e) => toast.error(message(e, t("inv.import.templateFailed")))
  });

  const { mutate: run, isPending: working } = useMutation({
    mutationFn: ({ csv, commit }: { csv: string; commit: boolean }) =>
      importInventoryCsv(group, { csv, commit }),
    meta: { showToast: false },
    onSuccess: (r, { commit }) => {
      setReport(r);
      if (!commit) return;
      toast.success(
        r.created === 1
          ? t("inv.import.imported.one", { singular })
          : t("inv.import.imported.other", { n: String(r.created), noun })
      );
      onImported();
      onClose();
    },
    onError: (e) => toast.error(message(e, t("inv.import.failed")))
  });

  const choose = async (picked: File | undefined) => {
    // The same file chosen again must still fire: it may have been corrected.
    if (input.current) input.current.value = "";
    if (!picked) return;
    setReport(null);
    if (picked.size > MAX_FILE_BYTES) {
      setFile(null);
      toast.error(t("inv.import.tooLarge", { max: guide?.maxRows ?? 1000 }));
      return;
    }
    const csv = await readSpreadsheet(picked);
    setFile({ name: picked.name, csv });
    run({ csv, commit: false });
  };

  return (
    <Card className="gap-0 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <FileSpreadsheet className="size-4" />
            {t("inv.import.title", { noun })}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("inv.import.introStart")} <strong>{t("inv.import.inactive")}</strong>
            {t("inv.import.introEnd", { max: guide?.maxRows ?? 1000 })}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label={t("inv.import.close")} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <ol className="flex flex-col gap-4 text-sm">
        <li>
          <p className="font-medium">{t("inv.import.step1")}</p>
          <p className="mb-2 text-xs text-muted-foreground">{t("inv.import.step1Help")}</p>
          <div className="flex flex-wrap gap-2">
            {CSV_FORMATS.map((f) => (
              <Button
                key={f.sep}
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={downloading}
                onClick={() => template(f.sep)}
              >
                <Download className="size-3.5" />
                {t(f.label)}
                <span className="text-xs text-muted-foreground">({t(f.hint)})</span>
              </Button>
            ))}
          </div>
        </li>

        <li>
          <p className="font-medium">{t("inv.import.step2")}</p>
          <p className="mb-2 text-xs text-muted-foreground">
            {t("inv.import.step2Help")}
            {guide?.after ? ` ${guide.after}` : ""}
          </p>
          <details className="rounded-md border" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
              {t("inv.import.columnsTitle")}
              {columns.length ? (
                <span className="ms-1 font-normal text-muted-foreground">
                  {t("inv.import.columnsCount", {
                    n: columns.length,
                    required: columns.filter((c) => c.required).length
                  })}
                </span>
              ) : null}
            </summary>
            <div className="max-h-72 overflow-auto border-t">
              <table className="w-full text-start text-xs">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    <th aria-sort={sortState(sort, "column")} className="px-3 py-1.5 font-medium">
                      <SortButton column="column" {...head}>
                        {t("inv.import.col.column")}
                      </SortButton>
                    </th>
                    <th aria-sort={sortState(sort, "what")} className="px-3 py-1.5 font-medium">
                      <SortButton column="what" {...head}>
                        {t("inv.import.col.what")}
                      </SortButton>
                    </th>
                    <th aria-sort={sortState(sort, "example")} className="px-3 py-1.5 font-medium">
                      <SortButton column="example" {...head}>
                        {t("inv.import.col.example")}
                      </SortButton>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((c) => (
                    <tr key={c.key} className="border-t align-top">
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <code className="font-mono">{c.key}</code>
                        {c.required ? (
                          <span className="ms-1.5 rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                            {t("inv.import.required")}
                          </span>
                        ) : null}
                        <div className="text-muted-foreground">{c.label}</div>
                      </td>
                      <td className="px-3 py-1.5">
                        {helpOf(c)}
                        {c.options?.length ? (
                          <div className="mt-0.5 text-muted-foreground">
                            {t("inv.import.oneOf", { options: c.options.join(", ") })}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">
                        {c.example || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </li>

        <li>
          <p className="font-medium">{t("inv.import.step3")}</p>
          <p className="mb-2 text-xs text-muted-foreground">{t("inv.import.step3Help")}</p>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            aria-label={t("inv.import.fileLabel")}
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={working}
              onClick={() => input.current?.click()}
            >
              <Upload className="size-3.5" />
              {file ? t("inv.import.chooseAnother") : t("inv.import.chooseCsv")}
            </Button>
            {file ? (
              <span className="truncate text-xs text-muted-foreground">{file.name}</span>
            ) : null}
          </div>
        </li>
      </ol>

      {working && !report ? (
        <p className="mt-3 text-xs text-muted-foreground">{t("inv.import.checking")}</p>
      ) : null}

      {report && file ? (
        <div className="mt-4 rounded-md border p-3 text-sm">
          <p className="font-medium">
            {report.canCommit
              ? t(report.validRows === 1 ? "inv.import.ready.one" : "inv.import.ready.other", {
                  n: report.validRows
                })
              : // Row 1 is the header: the problem is the file, not some of its rows.
                report.errors.some((e) => e.row === 1)
                ? t("inv.import.headerProblem")
                : report.errors.length
                  ? t("inv.import.partlyReady", {
                      valid: report.validRows,
                      total: report.rows - report.skipped
                    })
                  : t("inv.import.nothing")}
          </p>
          {report.notes?.map((note) => (
            <p key={note} className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {note}
            </p>
          ))}
          {report.skipped ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t(report.skipped === 1 ? "inv.import.skipped.one" : "inv.import.skipped.other", {
                n: report.skipped
              })}
            </p>
          ) : null}
          {report.ignoredColumns.length ? (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {t(
                report.ignoredColumns.length === 1
                  ? "inv.import.ignored.one"
                  : "inv.import.ignored.other"
              )}{" "}
              <code className="font-mono">{report.ignoredColumns.join(", ")}</code>
            </p>
          ) : null}
          {report.errors.length ? (
            <ul className="mt-2 max-h-48 overflow-y-auto text-xs text-red-600 dark:text-red-400">
              {report.errors.slice(0, 100).map((e, i) => (
                <li key={i}>
                  {t("inv.import.row", { row: e.row })} · <code className="font-mono">{e.field}</code>: {e.message}
                </li>
              ))}
              {report.errors.length > 100 ? (
                <li className="mt-1 text-muted-foreground">
                  {t("inv.import.more", { n: report.errors.length - 100 })}
                </li>
              ) : null}
            </ul>
          ) : null}
          {report.canCommit ? (
            <div className="mt-3">
              <Button
                size="sm"
                disabled={working}
                onClick={() => run({ csv: file.csv, commit: true })}
              >
                {working
                  ? t("inv.import.importing")
                  : t(
                      report.validRows === 1
                        ? "inv.import.importRows.one"
                        : "inv.import.importRows.other",
                      { n: report.validRows }
                    )}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
