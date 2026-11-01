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
import { CONTENT_LOCALES, isRtl, LOCALE_LABELS } from "@/lib/i18n/dictionaries";
import { useT } from "@/lib/i18n/useT";
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

/** Each text's words are keys: its name, where it shows, the outdated notice, the publish question. */
const DOCUMENTS = [
  {
    kind: "TERMS",
    label: "sys.policy.terms",
    where: "sys.policy.termsWhere",
    outdated: "sys.policy.termsOutdated",
    confirm: "sys.policy.termsConfirm",
    headings: true
  },
  {
    kind: "NO_REFUND",
    label: "sys.policy.refund",
    where: "sys.policy.refundWhere",
    outdated: "sys.policy.refundOutdated",
    confirm: "sys.policy.refundConfirm",
    headings: false
  },
  {
    kind: "PRIVACY",
    label: "sys.policy.privacy",
    where: "sys.policy.privacyWhere",
    outdated: "sys.policy.privacyOutdated",
    confirm: "sys.policy.privacyConfirm",
    headings: true
  }
] as const;

/** Every language the website offers, each named in itself. */
const LANGUAGES = CONTENT_LOCALES.map((code) => ({ code, label: LOCALE_LABELS[code] }));

/** Each text in its own direction, whatever the panel's: Arabic right to left. */
const dirOf = (locale: string) => (isRtl(locale) ? "rtl" : "ltr");

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
  const { t } = useT();
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
    if (dirty && !window.confirm(t("sys.policy.leave"))) {
      return;
    }
    setDirty(false);
    go();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2 rounded-lg border bg-background px-4 py-3">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("sys.policy.intro")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("sys.policy.document")}>
          {DOCUMENTS.map((d) => (
            <button
              key={d.kind}
              type="button"
              aria-pressed={kind === d.kind}
              className={pill(kind === d.kind)}
              // The one already open is not a place to leave for.
              onClick={() => d.kind !== kind && leave(() => setKind(d.kind))}
            >
              {t(d.label)}
            </button>
          ))}
        </div>
        <div
          className="flex flex-wrap gap-1 rounded-lg border bg-background p-1"
          role="group"
          aria-label={t("sys.policy.language")}
        >
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
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
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
            outdated={Boolean(data?.outdated?.[kind]?.[locale])}
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
  outdated,
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
  /** The live text still has the old cancellation wording (no refund, or up to 80%); `builtIn` has the new one. */
  outdated: boolean;
  nextNumber: number;
  canWrite: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { t } = useT();
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
      toast.success(t("sys.policy.published", { document: t(document.label), language })),
    onError: (e) =>
      toast.error(
        (e as Error).message === OVERTAKEN
          ? t("sys.policy.overtakenError")
          : message(e, t("sys.policy.publishFailed"))
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["policies"] })
  });

  return (
    <Card className="gap-4 p-5">
      <div>
        <h2 className="text-sm font-medium">
          {t(document.label)} — {language}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{t(document.where)}</p>
      </div>

      {live ? (
        <p className="text-xs text-muted-foreground">
          {t("sys.policy.liveNow")}{" "}
          <span className="font-medium text-foreground">{live.label}</span>
          {t("sys.policy.publishedOn", { date: formatDateTime(live.createdAt) })}
        </p>
      ) : document.kind === "NO_REFUND" ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            {t("sys.policy.refundMissing", { language })}{" "}
            {/* What the checkout records (travel-backend orderController): French
                for French, English for every other language, else French. */}
            {locale === "fr"
              ? t("sys.policy.refundMissingFr")
              : locale === "en"
                ? t("sys.policy.refundMissingEn")
                : t("sys.policy.refundMissingOther")}
          </p>
        </div>
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t(builtIn ? "sys.policy.nothingPublishedBuiltIn" : "sys.policy.nothingPublished", {
            language
          })}
        </p>
      )}

      {overtaken ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{t("sys.policy.overtaken")}</p>
        </div>
      ) : null}

      {/* Never rewritten automatically: the new wording goes into the box, and
          the office publishes it as a new version. */}
      {outdated ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col items-start gap-2">
            <p>
              {t(document.outdated)}
              {document.headings ? t("sys.policy.replacesWhole") : ""}
            </p>
            {canWrite && builtIn && text.trim() !== builtIn.trim() ? (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => setText(builtIn)}
              >
                {t("sys.policy.useNew")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <Label className="text-xs">{t("sys.policy.text")}</Label>
        <Textarea
          rows={document.headings ? 18 : 4}
          dir={dirOf(locale)}
          lang={locale}
          value={text}
          // Not while it is on its way either: what is typed then is not in
          // what was sent, and the form starts again from what was published.
          disabled={!canWrite || isPending}
          onChange={(e) => setText(e.target.value)}
          className="font-mono text-[13px] leading-relaxed"
          placeholder={
            document.headings
              ? t("sys.policy.headingsPlaceholder")
              : // A sample of the sentence, in the site's first language.
                "Je comprends qu'en cas d'annulation de cette réservation, 80 % du montant payé est remboursable après déduction des frais de dossier."
          }
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {document.headings
            ? t("sys.policy.headingsHint")
            : t("sys.policy.plainHint")}
        </p>
      </div>

      {canWrite ? (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">{t("sys.policy.versionName")}</Label>
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
              window.confirm(t(document.confirm, { language })) && publish()
            }
          >
            {isPending ? t("sys.policy.publishing") : t("sys.policy.publish")}
          </Button>
          {live && changed ? (
            <Button
              variant="ghost"
              onClick={() => setText(live.body)}
            >
              {t("sys.undoChanges")}
            </Button>
          ) : null}
          {!changed && live ? (
            <span className="pb-2 text-xs text-muted-foreground">
              {t("sys.policy.changeToPublish")}
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
  const { t } = useT();
  const [open, setOpen] = useState<string | null>(null);
  const { rows, pager } = usePaged(versions);

  const { mutate: makeLive, isPending } = useMutation({
    mutationFn: setPolicyLive,
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success(t("sys.policy.madeLive"));
    },
    onError: (e) => toast.error(message(e, t("sys.policy.makeLiveFailed")))
  });

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <History className="size-4" />
        {t("sys.policy.history")}
      </h2>
      {!versions.length ? (
        <Card className="p-5 text-center text-sm text-muted-foreground">
          {t("sys.policy.noVersions")}
        </Card>
      ) : (
        <Card className="gap-0 divide-y p-0">
          {rows.map((p) => (
            <div key={p.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{p.label}</span>
                {p.isLive ? (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {t("sys.policy.onWebsite")}
                  </Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(p.createdAt)}
                </span>
                <div className="ms-auto flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpen(open === p.id ? null : p.id)}
                  >
                    {open === p.id ? t("sys.policy.hideText") : t("sys.policy.showText")}
                  </Button>
                  {canWrite && !p.isLive ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        window.confirm(
                          t("sys.policy.makeLiveConfirm", { label: p.label }) +
                            (unpublished ? t("sys.policy.makeLiveLoses") : "")
                        ) && makeLive(p.id)
                      }
                    >
                      {t("sys.policy.makeLive")}
                    </Button>
                  ) : null}
                  {/* Only a version that never went on the website: every
                      published one is kept, as the record of which text
                      applied when. */}
                  {!p.isLive && !p.wasLive ? (
                    <DeleteButton
                      permission="content:delete"
                      what={t("sys.policy.deleteWhat", { label: p.label })}
                      consequence={t("sys.policy.deleteConsequence")}
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
                <p
                  dir={dirOf(p.locale)}
                  lang={p.locale}
                  className="mt-3 whitespace-pre-wrap rounded bg-muted p-3 text-xs leading-relaxed"
                >
                  {p.body}
                </p>
              ) : null}
            </div>
          ))}
        </Card>
      )}
      <div className="mt-3">
        <Pager {...pager} noun={t("sys.policy.noun")} plural={t("sys.policy.nouns")} />
      </div>
    </section>
  );
}
