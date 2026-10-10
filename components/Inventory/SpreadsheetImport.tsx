import {
  CsvSeparator,
  downloadInventoryCsv,
  getImportGuide,
  importInventoryCsv,
  ImportReport
} from "@/api/functions/admin.api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

/** The two shapes a spreadsheet program writes a CSV in. */
export const CSV_FORMATS: { sep: CsvSeparator; label: string; hint: string }[] = [
  { sep: "semicolon", label: "Excel in French", hint: "cells split by ;" },
  { sep: "comma", label: "Excel in English", hint: "cells split by ," }
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
    // as "H™tel".
    const mac = bytes.some((b, i) => b === 0x0d && bytes[i + 1] !== 0x0a);
    return new TextDecoder(mac ? "macintosh" : "windows-1252").decode(bytes);
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
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const { data: guide } = useQuery({
    queryKey: ["import-guide", group],
    queryFn: () => getImportGuide(group),
    staleTime: 5 * 60 * 1000
  });
  const columns = (guide?.columns ?? []).filter((c) => !c.readOnly);

  const { mutate: template, isPending: downloading } = useMutation({
    mutationFn: (sep: CsvSeparator) => downloadInventoryCsv(group, "template", sep),
    meta: { showToast: false },
    onError: (e) => toast.error(message(e, "Could not download the template"))
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
          ? `1 ${singular} imported as inactive — review and publish it from the list`
          : `${r.created} ${noun} imported as inactive — review and publish them from the list`
      );
      onImported();
      onClose();
    },
    onError: (e) => toast.error(message(e, "Import failed"))
  });

  const choose = async (picked: File | undefined) => {
    // The same file chosen again must still fire: it may have been corrected.
    if (input.current) input.current.value = "";
    if (!picked) return;
    setReport(null);
    if (picked.size > MAX_FILE_BYTES) {
      setFile(null);
      toast.error(
        `That file is too large to import. An import is limited to ${guide?.maxRows ?? 1000} rows.`
      );
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
            Import {noun} from a spreadsheet
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Everything imported starts as <strong>inactive</strong>: it is not on
            the website until you publish it. Up to {guide?.maxRows ?? 1000} rows
            per file.
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close import" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <ol className="flex flex-col gap-4 text-sm">
        <li>
          <p className="font-medium">1. Download the template</p>
          <p className="mb-2 text-xs text-muted-foreground">
            It has the right columns and one example row to copy. Pick the one
            your spreadsheet program expects — if the file opens with everything
            in a single column, use the other.
          </p>
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
                {f.label}
                <span className="text-xs text-muted-foreground">({f.hint})</span>
              </Button>
            ))}
          </div>
        </li>

        <li>
          <p className="font-medium">2. Fill it in</p>
          <p className="mb-2 text-xs text-muted-foreground">
            One row per item. Replace the example row with your own; keep the
            header row exactly as it is.
            {guide?.after ? ` ${guide.after}` : ""}
          </p>
          <details className="rounded-md border" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
              What goes in each column
              {columns.length ? (
                <span className="ml-1 font-normal text-muted-foreground">
                  — {columns.length} columns,{" "}
                  {columns.filter((c) => c.required).length} required
                </span>
              ) : null}
            </summary>
            <div className="max-h-72 overflow-auto border-t">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Column</th>
                    <th className="px-3 py-1.5 font-medium">What to put</th>
                    <th className="px-3 py-1.5 font-medium">Example</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((c) => (
                    <tr key={c.key} className="border-t align-top">
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <code className="font-mono">{c.key}</code>
                        {c.required ? (
                          <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                            required
                          </span>
                        ) : null}
                        <div className="text-muted-foreground">{c.label}</div>
                      </td>
                      <td className="px-3 py-1.5">
                        {c.help}
                        {c.options?.length ? (
                          <div className="mt-0.5 text-muted-foreground">
                            One of: {c.options.join(", ")}
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
          <p className="font-medium">3. Choose your file</p>
          <p className="mb-2 text-xs text-muted-foreground">
            It is checked straight away. Nothing is saved until the check is
            clean and you confirm.
          </p>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            aria-label="Spreadsheet file"
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
              {file ? "Choose another file" : "Choose a CSV file"}
            </Button>
            {file ? (
              <span className="truncate text-xs text-muted-foreground">{file.name}</span>
            ) : null}
          </div>
        </li>
      </ol>

      {working && !report ? (
        <p className="mt-3 text-xs text-muted-foreground">Checking the file…</p>
      ) : null}

      {report && file ? (
        <div className="mt-4 rounded-md border p-3 text-sm">
          <p className="font-medium">
            {report.canCommit
              ? `Ready: ${report.validRows} ${report.validRows === 1 ? "row" : "rows"} will be added.`
              : // Row 1 is the header: the problem is the file, not some of its rows.
                report.errors.some((e) => e.row === 1)
                ? "This file cannot be imported yet — fix the problem below and choose it again."
                : report.errors.length
                  ? `${report.validRows} of ${report.rows - report.skipped} rows are ready — fix the rest and choose the file again.`
                  : "Nothing to add."}
          </p>
          {report.notes?.map((note) => (
            <p key={note} className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {note}
            </p>
          ))}
          {report.skipped ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {report.skipped} {report.skipped === 1 ? "row is" : "rows are"} already
              in the system and will be left alone. Import only adds new items.
            </p>
          ) : null}
          {report.ignoredColumns.length ? (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Not read — check the spelling of{" "}
              {report.ignoredColumns.length === 1 ? "this column" : "these columns"}:{" "}
              <code className="font-mono">{report.ignoredColumns.join(", ")}</code>
            </p>
          ) : null}
          {report.errors.length ? (
            <ul className="mt-2 max-h-48 overflow-y-auto text-xs text-red-600 dark:text-red-400">
              {report.errors.slice(0, 100).map((e, i) => (
                <li key={i}>
                  Row {e.row} · <code className="font-mono">{e.field}</code>: {e.message}
                </li>
              ))}
              {report.errors.length > 100 ? (
                <li className="mt-1 text-muted-foreground">
                  …and {report.errors.length - 100} more.
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
                  ? "Importing…"
                  : `Import ${report.validRows} ${report.validRows === 1 ? "row" : "rows"}`}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
