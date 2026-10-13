import {
  createPolicyVersion,
  deletePolicyVersion,
  listPolicies,
  setPolicyLive,
  type PolicyVersion
} from "@/api/functions/admin.api";
import DeleteButton from "@/components/DeleteButton";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/functions/format.lib";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { AlertTriangle, History, Lock } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Legal texts: terms, refund policy, privacy.
 *
 * §10: these are stored as IMMUTABLE versions. Publishing never changes an
 * existing text — it adds a new version and makes that one live, and the old
 * one is kept, because every order keeps the exact wording its customer
 * accepted. §15 calls editing published policy text in place a hard
 * constraint violation: it would destroy the evidence behind every past order.
 *
 * So "edit" here means: start from the live text, change it, publish a new
 * version. The history below is how to go back — and where, with
 * content:delete, a version that is not live and that no booking was made
 * under can be removed for good.
 */

const DOCUMENTS = [
  {
    kind: "TERMS",
    label: "Terms and conditions",
    where: "The Terms and conditions page of the website.",
    headings: true
  },
  {
    kind: "NO_REFUND",
    label: "Refund policy",
    where:
      "The sentence a customer must tick before paying. It is also quoted at the top of the Terms page, and a copy is kept with every order. The longer explanation belongs in the Terms and conditions; the one-line reminder printed around the website is under Footer.",
    headings: false
  },
  {
    kind: "PRIVACY",
    label: "Privacy policy",
    where: "The Privacy page of the website.",
    headings: true
  }
] as const;

/** The two languages the website offers. */
const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" }
] as const;

const message = (e: unknown, fallback: string) =>
  (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback;

/** Thrown by Publish when someone else's version went live since this page read the list. */
const OVERTAKEN = "overtaken";

const pill = (active: boolean) =>
  cn(
    "rounded-md px-3 py-1.5 text-sm transition-colors",
    active ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:bg-muted"
  );

export default function PolicyEditor({
  canWrite,
  onDirty
}: {
  canWrite: boolean;
  /** Told whenever there is text typed and not published, so the page can warn before it is closed. */
  onDirty?: (dirty: boolean) => void;
}) {
  const [kind, setKind] = useState<string>(DOCUMENTS[0].kind);
  const [locale, setLocale] = useState<string>(LANGUAGES[0].code);
  // Set by the form below, so leaving it with unpublished text can ask first.
  const [dirty, setDirtyHere] = useState(false);
  const setDirty = (next: boolean) => {
    setDirtyHere(next);
    onDirty?.(next);
  };

  const { data, isLoading, isError, isFetchedAfterMount, refetch } = useQuery({
    queryKey: ["policies"],
    queryFn: listPolicies,
    // A colleague may have published since this was last open, and the form
    // starts from the live text.
    refetchOnMount: "always"
  });

  const document = DOCUMENTS.find((d) => d.kind === kind) ?? DOCUMENTS[0];
  // Newest first, as the server sends them.
  const versions = (data?.items ?? []).filter(
    (p) => p.kind === kind && p.locale === locale
  );
  const live = versions.find((p) => p.isLive);
  // What the next version is called unless told otherwise: one past the
  // highest "vN" in the history. Not one past its length — once a version has
  // been deleted, that is a name already in use.
  const nextNumber =
    Math.max(
      versions.length,
      ...versions.map((p) => Number(/^v(\d+)$/i.exec(p.label)?.[1] ?? 0))
    ) + 1;

  // The forms open once this visit has read the list successfully — and then
  // stay open. A later re-read that fails (the one after a failed Publish, or
  // on coming back online) used to put the error card in the form's place,
  // and the text typed in it was gone.
  const [opened, setOpened] = useState(false);
  if (!opened && data && isFetchedAfterMount && !isError) setOpened(true);

  // A fresh form for each document and language, and each time another
  // version goes live — but never under someone typing: a colleague's publish
  // arriving mid-sentence leaves the text alone and says so instead. By the
  // live version only: a draft that did not make it live (one's own, when
  // "make live" failed) changes the history, not what is on the website.
  const current = `${kind}|${locale}|${live?.id ?? "none"}`;
  const [formKey, setFormKey] = useState(current);
  if (!dirty && formKey !== current) setFormKey(current);
  const overtaken = dirty && formKey !== current;

  const leave = (go: () => void) => {
    if (dirty && !window.confirm("Leave without publishing? The text you changed will be lost.")) {
      return;
    }
    setDirty(false);
    go();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2 rounded-lg border bg-background px-4 py-3">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Publishing never rewrites a legal text: it adds a new version and puts
          that one on the website. A version a customer agreed to is kept for
          good, because every order stores the exact wording its customer
          accepted.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Document">
          {DOCUMENTS.map((d) => (
            <button
              key={d.kind}
              type="button"
              aria-pressed={kind === d.kind}
              className={pill(kind === d.kind)}
              // The one already open is not a place to leave for.
              onClick={() => d.kind !== kind && leave(() => setKind(d.kind))}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border bg-background p-1" role="group" aria-label="Language">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              aria-pressed={locale === l.code}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                locale === l.code
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
              onClick={() => l.code !== locale && leave(() => setLocale(l.code))}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {!opened && isError ? (
        <Card className="p-6">
          <QueryError onRetry={() => refetch()} />
        </Card>
      ) : !opened || isLoading ? (
        // Not the copy kept from an earlier visit: the form starts from the
        // live text, and that copy may predate a colleague's publish.
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <PolicyForm
            key={formKey}
            overtaken={overtaken}
            document={document}
            language={LANGUAGES.find((l) => l.code === locale)?.label ?? locale}
            locale={locale}
            live={live}
            builtIn={data?.builtIn?.[kind]?.[locale] ?? ""}
            nextNumber={nextNumber}
            canWrite={canWrite}
            onDirty={setDirty}
          />
          <PolicyHistory
            key={`${kind}|${locale}`}
            versions={versions}
            canWrite={canWrite}
            unpublished={dirty}
          />
        </>
      )}
    </div>
  );
}

function PolicyForm({
  document,
  language,
  locale,
  live,
  builtIn,
  nextNumber,
  canWrite,
  overtaken,
  onDirty
}: {
  /** Another version went live while this text was being typed. */
  overtaken: boolean;
  document: (typeof DOCUMENTS)[number];
  language: string;
  locale: string;
  live?: PolicyVersion;
  /** The wording built into the website, shown there until something is published. */
  builtIn: string;
  nextNumber: number;
  canWrite: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  // Opens on what customers read today: the published text, or — when nothing
  // has been published — the wording built into the website, ready to be
  // corrected and published rather than typed out again.
  const start = live?.body ?? builtIn;
  const [text, setText] = useState(start);
  const [label, setLabel] = useState(`v${nextNumber}`);
  // Against what is published: the built-in text counts as new until it is.
  const changed = text.trim() !== (live?.body ?? "").trim();
  // "Unpublished text" is read off the screen — the text against what is live
  // — not remembered from the last keystroke. Remembered, it stayed set when
  // this very text went live another way (made live from the history after a
  // half-failed publish), and the form then warned about "another version".
  // Before paint, so that warning is never drawn for the frame in between.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => onDirty(text.trim() !== start.trim()), [text, start]);

  // The version this form has already stored but not managed to put live.
  const stored = useRef<{ id: string; body: string; label: string } | null>(null);
  const { mutate: publish, isPending } = useMutation({
    mutationFn: async () => {
      // A colleague may have published since this page last read the list —
      // it re-reads on its own only after one's own publish. Publishing now
      // would put a text started from the older version over theirs, unseen.
      // So look first; if the live version has changed, show it (the notice
      // above the text then says so) and leave the decision to a second press.
      const now = await queryClient.fetchQuery({
        queryKey: ["policies"],
        queryFn: listPolicies,
        staleTime: 0
      });
      const liveNow = now.items.find(
        (p) => p.kind === document.kind && p.locale === locale && p.isLive
      );
      if (liveNow?.id !== live?.id) throw new Error(OVERTAKEN);
      const wanted = { body: text.trim(), label: label.trim() };
      // Two steps on the server. If the second failed last time, the version
      // is already in the history: pressing Publish again finishes that one
      // instead of storing the same text a second time under the same name —
      // unless it has been deleted from the history since.
      if (
        stored.current?.body !== wanted.body ||
        stored.current.label !== wanted.label ||
        !now.items.some((p) => p.id === stored.current?.id)
      ) {
        const { policy } = await createPolicyVersion({
          kind: document.kind,
          locale,
          ...wanted
        });
        stored.current = { id: policy.id, ...wanted };
      }
      await setPolicyLive(stored.current.id);
      stored.current = null;
    },
    meta: { showToast: false },
    // Nothing here clears the "unpublished" flag: this form may be gone by
    // now (another document opened while this was on its way), and the flag
    // would be cleared for text typed there. The re-read below does it.
    onSuccess: () =>
      toast.success(
        `${document.label} (${language}) published — the website shows it within a few minutes`
      ),
    onError: (e) =>
      toast.error(
        (e as Error).message === OVERTAKEN
          ? "Not published: another version went live since this page was opened. Compare with it below, then publish again if yours should replace it."
          : message(e, "Could not publish. Check the history below before trying again.")
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["policies"] })
  });

  return (
    <Card className="gap-4 p-5">
      <div>
        <h2 className="text-sm font-medium">
          {document.label} — {language}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{document.where}</p>
      </div>

      {live ? (
        <p className="text-xs text-muted-foreground">
          On the website now:{" "}
          <span className="font-medium text-foreground">{live.label}</span>, published{" "}
          {formatDateTime(live.createdAt)}.
        </p>
      ) : document.kind === "NO_REFUND" ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            No refund policy is published in {language}.{" "}
            {locale === "fr"
              ? "The website cannot take orders until one is."
              : "Orders placed in this language record the French text instead."}
          </p>
        </div>
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Nothing is published in {language} yet, so the website shows the text
          that was built into it{builtIn ? " — the one below" : ""}. Change
          what you need and publish it.
        </p>
      )}

      {overtaken ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Another version was published while you were typing. Your text below
            was started from the earlier one: publishing it replaces the newer
            version, so compare with the history first.
          </p>
        </div>
      ) : null}

      <div>
        <Label className="text-xs">Text</Label>
        <Textarea
          rows={document.headings ? 18 : 4}
          value={text}
          // Not while it is on its way either: what is typed then is not in
          // what was sent, and the form starts again from what was published.
          disabled={!canWrite || isPending}
          onChange={(e) => setText(e.target.value)}
          className="font-mono text-[13px] leading-relaxed"
          placeholder={
            document.headings
              ? "## 1. First section\n\nIts text…\n\n## 2. Second section\n\nIts text…"
              : "Je comprends que cette réservation est définitive et non remboursable…"
          }
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {document.headings
            ? "Start a line with ## to make it a section heading. Leave an empty line between paragraphs. Plain text only — no formatting codes."
            : "One or two plain sentences. This is the exact wording a customer agrees to, so past orders keep the version they accepted and are not affected by a change."}
        </p>
      </div>

      {canWrite ? (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Version name</Label>
            <Input
              className="w-40"
              value={label}
              maxLength={40}
              disabled={isPending}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button
            disabled={isPending || !changed || !text.trim() || !label.trim()}
            onClick={() =>
              window.confirm(
                `Publish this as the ${document.label.toLowerCase()} in ${language}?\n\nIt replaces the text on the website. The current version stays in the history.`
              ) && publish()
            }
          >
            {isPending ? "Publishing…" : "Publish new version"}
          </Button>
          {live && changed ? (
            <Button
              variant="ghost"
              onClick={() => setText(live.body)}
            >
              Undo changes
            </Button>
          ) : null}
          {!changed && live ? (
            <span className="pb-2 text-xs text-muted-foreground">
              Change the text to publish a new version.
            </span>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function PolicyHistory({
  versions,
  canWrite,
  unpublished
}: {
  versions: PolicyVersion[];
  canWrite: boolean;
  /** Text typed in the form above and not published: making another version live starts that form again. */
  unpublished: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const { rows, pager } = usePaged(versions);

  const { mutate: makeLive, isPending } = useMutation({
    mutationFn: setPolicyLive,
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success("That version is now on the website");
    },
    onError: (e) => toast.error(message(e, "Could not make that version live"))
  });

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <History className="size-4" />
        History
      </h2>
      {!versions.length ? (
        <Card className="p-5 text-center text-sm text-muted-foreground">
          No versions yet.
        </Card>
      ) : (
        <Card className="gap-0 divide-y p-0">
          {rows.map((p) => (
            <div key={p.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{p.label}</span>
                {p.isLive ? (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    On the website
                  </Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(p.createdAt)}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpen(open === p.id ? null : p.id)}
                  >
                    {open === p.id ? "Hide text" : "Show text"}
                  </Button>
                  {canWrite && !p.isLive ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        window.confirm(
                          `Put “${p.label}” back on the website? It replaces the version that is live now.${
                            unpublished
                              ? "\n\nThe text you changed above and have not published will be lost."
                              : ""
                          }`
                        ) && makeLive(p.id)
                      }
                    >
                      Make live
                    </Button>
                  ) : null}
                  {/* Only a version that never went on the website: every
                      published one is kept, as the record of which text
                      applied when. */}
                  {!p.isLive && !p.wasLive ? (
                    <DeleteButton
                      permission="content:delete"
                      what={`the version “${p.label}”`}
                      consequence="It was stored but never went on the website, so nothing refers to it."
                      onDelete={() => deletePolicyVersion(p.id)}
                      onDeleted={() =>
                        queryClient.invalidateQueries({
                          queryKey: ["policies"]
                        })
                      }
                      // Not while one is on its way to the website either.
                      disabled={isPending}
                      className="size-8"
                    />
                  ) : null}
                </div>
              </div>
              {open === p.id ? (
                <p className="mt-3 whitespace-pre-wrap rounded bg-muted p-3 text-xs leading-relaxed">
                  {p.body}
                </p>
              ) : null}
            </div>
          ))}
        </Card>
      )}
      <div className="mt-3">
        <Pager {...pager} noun="version" />
      </div>
    </section>
  );
}
