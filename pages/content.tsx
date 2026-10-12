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
import { formatDateTime } from "@/lib/functions/format.lib";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useEffect, useState } from "react";
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

  const { data, isLoading, isError, isFetchedAfterMount, refetch } = useQuery({
    queryKey: ["site-content"],
    queryFn: getSiteContent,
    // Another editor may have saved since this was last open.
    refetchOnMount: "always"
  });

  // Once, and only from an answer fetched for this visit: the copy kept from
  // last time may predate a colleague's save, and typing would start from it.
  // After that the draft is the user's.
  useEffect(() => {
    if (data && !draft && isFetchedAfterMount) setDraft(data.content);
  }, [data, draft, isFetchedAfterMount]);

  const unsaved = (section: SiteSection) =>
    Boolean(draft && data && !same(draft[section], data.content[section]));
  const anyUnsaved = SECTIONS.some(unsaved);

  /** §13 Forgiveness: warn before leaving with unsaved changes. */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!anyUnsaved && !legalDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyUnsaved, legalDirty]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: async (section: SiteSection) => {
      const sent = draft![section];
      return { sent, ...(await saveSiteSection(section, sent)) };
    },
    meta: { showToast: false },
    onSuccess: ({ sent, ...saved }, section) => {
      // The answer is the whole site as it now stands, so each section takes
      // the server's copy unless something typed here is still waiting:
      //  - the one just saved, if nothing was typed in it while it was on its
      //    way (the server's copy is trimmed, with blank lines dropped);
      //  - the others, if untouched — a colleague may have saved one meanwhile.
      setDraft((d) => {
        if (!d || !data) return d;
        const next = { ...d } as Record<SiteSection, unknown>;
        for (const s of SECTIONS) {
          if (same(d[s], s === section ? sent : data.content[s])) {
            next[s] = saved.content[s];
          }
        }
        return next as unknown as SiteContent;
      });
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

        {tab === "legal" ? null : isLoading || (!draft && !isError) ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError || !draft || !data ? (
          // Without the real text an editable form with Save enabled would let
          // a blank save replace what is on the website.
          <QueryError onRetry={() => refetch()} />
        ) : (
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
