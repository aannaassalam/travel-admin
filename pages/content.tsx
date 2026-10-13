import {
  getSiteContent,
  saveSiteSection,
  type SiteContent,
  type SiteSection
} from "@/api/functions/admin.api";
import PolicyEditor from "@/components/Content/PolicyEditor";
import SiteEditor from "@/components/Content/SiteEditor";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { useLeaveGuard } from "@/hooks/useUnsaved";
import { formatDateTime } from "@/lib/functions/format.lib";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Everything on the public website the office changes without a developer.
 *
 * §12/§15: "making the owner wait for a developer to change a homepage banner
 * or policy text" is on the list of things to avoid. The pages are edited in
 * place and saved a section at a time; legal texts are the exception — those
 * are published as new versions and never rewritten (see PolicyEditor).
 */

const TABS: { key: SiteSection | "legal"; label: string }[] = [
  { key: "home", label: "Home page" },
  { key: "about", label: "About" },
  { key: "contact", label: "Contact" },
  { key: "help", label: "Help" },
  { key: "footer", label: "Footer" },
  { key: "legal", label: "Terms, refund & privacy" }
];

/** The parts saved a section at a time; legal texts are versioned instead. */
const SECTIONS = TABS.map((t) => t.key).filter(
  (key): key is SiteSection => key !== "legal"
);

// A language typed into and then emptied leaves `en: ""` behind, which the
// server drops on save: it is no change, and must not read as one.
const bare = (v: unknown) => JSON.stringify(v, (_key, x) => (x === "" ? undefined : x));
const same = (a: unknown, b: unknown) => bare(a) === bare(b);

export default function ContentPage() {
  const queryClient = useQueryClient();
  // Reading is content:read, which is what opens this page; saving a section
  // and publishing a legal text are content:write.
  const { can } = useCan();
  const canWrite = can("content:write");
  const [tab, setTab] = useState<SiteSection | "legal">("home");
  // What is being typed, section by section. Kept across tabs so moving from
  // Help to Footer and back does not lose a half-written answer.
  const [draft, setDraft] = useState<SiteContent | null>(null);
  // The legal editor keeps its own text. Once opened it stays mounted behind
  // the other tabs, so a look at the Footer does not throw away an unpublished
  // rewrite of the terms; `legalDirty` is that text waiting.
  const [legalOpened, setLegalOpened] = useState(false);
  const [legalDirty, setLegalDirty] = useState(false);

  const { data, isError, isFetchedAfterMount, refetch } = useQuery({
    queryKey: ["site-content"],
    queryFn: getSiteContent,
    // Another editor may have saved since this was last open.
    refetchOnMount: "always"
  });

  // The server copy the draft was last laid over.
  const base = useRef<SiteContent | null>(null);
  // From an answer read successfully on this visit, never the copy kept from
  // last time (it may predate a colleague's save, and typing would start from
  // it). The first one becomes the draft. Each later one — after a save, on
  // coming back online — replaces the sections nobody has typed in here, so a
  // colleague's change is never shown as "unsaved" old text that Save would
  // then put back over theirs. What has been typed in stays.
  useEffect(() => {
    if (!data || isError || !isFetchedAfterMount) return;
    const from = base.current;
    base.current = data.content;
    setDraft((d) => {
      if (!d || !from) return d ?? data.content;
      const next = { ...d } as Record<SiteSection, unknown>;
      for (const s of SECTIONS) if (same(d[s], from[s])) next[s] = data.content[s];
      return next as unknown as SiteContent;
    });
  }, [data, isError, isFetchedAfterMount]);

  const unsaved = (section: SiteSection) =>
    Boolean(draft && data && !same(draft[section], data.content[section]));
  const anyUnsaved = SECTIONS.some(unsaved);

  /**
   * §13 Forgiveness: ask before leaving with unsaved changes — by closing the
   * tab, or by moving on inside the panel.
   */
  useLeaveGuard({ dirty: anyUnsaved || legalDirty });

  const { mutate: save, isPending } = useMutation({
    mutationFn: async (section: SiteSection) => {
      const sent = draft![section];
      const saved = await saveSiteSection(section, sent);
      // A read of the page that set off before this save (a re-read on coming
      // back online, say) can still be on its way, carrying the text as it was.
      // Landing after the save it would put the old wording back on screen as
      // if nothing were unsaved — and the next save of that section would send
      // it. Whatever is in flight now is older than this answer: drop it.
      await queryClient.cancelQueries({ queryKey: ["site-content"] });
      return { sent, ...saved };
    },
    meta: { showToast: false },
    onSuccess: ({ sent, ...saved }, section) => {
      // The section just saved takes the server's copy (trimmed, blank lines
      // dropped) if nothing was typed in it while it was on its way. The
      // answer is the whole site as it now stands; the effect above lays the
      // other sections over it — a colleague may have saved one meanwhile.
      setDraft((d) =>
        d && same(d[section], sent)
          ? ({ ...d, [section]: saved.content[section] } as SiteContent)
          : d
      );
      queryClient.setQueryData(["site-content"], { ...data, ...saved });
      // Typed in this section while it was on its way: that part was not sent.
      const behind = Boolean(draft && !same(draft[section], sent));
      toast.success(
        behind
          ? "Saved — what you typed since is not saved yet"
          : "Saved — the website shows it within a few minutes"
      );
    },
    onError: (e) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ?? "Could not save"
      )
  });

  return (
    <AdminLayout
      title="Website content"
      description="The words and pictures on the public website, and its legal texts"
    >
      <div className="flex max-w-4xl flex-col gap-5">
        <div className="flex flex-wrap gap-1 border-b pb-2" role="tablist">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                if (key === "legal") setLegalOpened(true);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === key
                  ? "bg-foreground font-medium text-background"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
              {(key === "legal" ? legalDirty : unsaved(key)) ? (
                <span
                  className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500 align-middle"
                  title={key === "legal" ? "Text not published yet" : "Unsaved changes"}
                />
              ) : null}
            </button>
          ))}
        </div>

        {legalOpened ? (
          <div hidden={tab !== "legal"}>
            <PolicyEditor canWrite={canWrite} onDirty={setLegalDirty} />
          </div>
        ) : null}

        {tab === "legal" ? null : !draft || !data ? (
          isError ? (
            // Without the real text an editable form with Save enabled would
            // let a blank save replace what is on the website.
            <QueryError onRetry={() => refetch()} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )
        ) : (
          // Once open it stays open: a later re-read that fails must not take
          // the form — and what is typed in it — off the screen.
          <>
            <SiteEditor
              section={tab}
              value={draft[tab]}
              shape={data.shape[tab]}
              canWrite={canWrite}
              // Onto the draft as it is when the change arrives, not as it was
              // when this was drawn: a picture can finish uploading after the
              // tab has changed, and must not put back what the draft held
              // when its upload began.
              onPatch={(part) =>
                setDraft(
                  (d) => d && ({ ...d, [tab]: { ...d[tab], ...part } } as SiteContent)
                )
              }
            />

            <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t bg-muted/80 px-1 py-3 backdrop-blur">
              {canWrite ? (
                <>
                  <Button disabled={isPending || !unsaved(tab)} onClick={() => save(tab)}>
                    {isPending ? "Saving…" : "Save"}
                  </Button>
                  {unsaved(tab) ? (
                    <>
                      <Button
                        variant="ghost"
                        disabled={isPending}
                        onClick={() =>
                          setDraft(
                            (d) => d && ({ ...d, [tab]: data.content[tab] } as SiteContent)
                          )
                        }
                      >
                        Undo changes
                      </Button>
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        Unsaved changes
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Your role can view the website content but not change it.
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {data.updatedAt
                  ? `Last saved ${formatDateTime(data.updatedAt)}.`
                  : "Not edited yet — this is the text the website was built with."}
              </span>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
