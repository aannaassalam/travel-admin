import {
  createPolicyVersion,
  listPolicies,
  setPolicyLive
} from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/functions/format.lib";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * §10: policies are stored as IMMUTABLE versions. Editing creates a new
 * version; the old one is retained forever because historical orders reference
 * it. §15 calls editing published policy text in place a hard constraint
 * violation — it destroys the evidence behind every historical order, which is
 * exactly what §9.3's chargeback defence rests on.
 *
 * So this screen has no "edit" control anywhere. Only "new version".
 */
export default function ContentPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({
    kind: "NO_REFUND",
    locale: "fr",
    label: "",
    body: ""
  });

  const { data, isLoading } = useQuery({
    queryKey: ["policies"],
    queryFn: listPolicies
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["policies"] });

  const { mutate: create, isPending } = useMutation({
    mutationFn: () => createPolicyVersion(draft),
    meta: { showToast: false },
    onSuccess: () => {
      invalidate();
      setDraft({ ...draft, label: "", body: "" });
      toast.success("New version created — not live until you publish it");
    }
  });

  const { mutate: publish } = useMutation({
    mutationFn: setPolicyLive,
    meta: { showToast: false },
    onSuccess: () => {
      invalidate();
      toast.success("This version is now live");
    }
  });

  return (
    <AdminLayout
      title="Content"
      description="Versioned policies — the evidence behind every historical order"
    >
      <div className="flex max-w-5xl flex-col gap-6">
        <div className="flex items-start gap-2 rounded-lg border bg-background px-4 py-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Published policy text can never be edited — only superseded by a new
            version. Every order stores the exact wording the customer accepted,
            and changing that text afterwards would destroy the chargeback
            defence for every order that references it.
          </p>
        </div>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <History className="size-4" />
            Policy versions
          </h2>
          <div className="flex flex-col gap-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !data?.items.length ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                No policy versions yet. Create the no-refund text below — orders
                cannot be defended without it.
              </Card>
            ) : (
              data.items.map((p) => (
                <Card key={p.id} className="gap-0 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.label}</span>
                        <Badge variant="secondary">{p.kind}</Badge>
                        <Badge variant="outline">{p.locale.toUpperCase()}</Badge>
                        {p.isLive ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            LIVE
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 rounded bg-muted p-2 text-xs italic">
                        “{p.body}”
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Created {formatDateTime(p.createdAt)}
                      </p>
                    </div>
                    {!p.isLive ? (
                      <Button size="sm" variant="outline" onClick={() => publish(p.id)}>
                        Make live
                      </Button>
                    ) : null}
                  </div>
                </Card>
              ))
            )}
          </div>
        </section>

        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-sm font-medium">New version</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Creating a version never replaces an existing one. It arrives as a
            draft and only takes effect when you make it live.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Kind</Label>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              >
                <option value="NO_REFUND">No refund</option>
                <option value="CANCELLATION">Cancellation</option>
                <option value="TERMS">Terms</option>
                <option value="PRIVACY">Privacy</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Locale</Label>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={draft.locale}
                onChange={(e) => setDraft({ ...draft, locale: e.target.value })}
              >
                <option value="fr">Français (default)</option>
                <option value="en">English</option>
                <option value="pt">Português</option>
                <option value="es">Español</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Label className="text-xs">Version label</Label>
            <Input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="No-refund v2 (fr)"
            />
          </div>
          <div className="mt-4">
            <Label className="text-xs">Policy text</Label>
            <Textarea
              rows={4}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="Toutes les ventes sont définitives…"
            />
          </div>
          <Button
            className="mt-4 self-start"
            disabled={isPending || !draft.label || !draft.body}
            onClick={() => create()}
          >
            Create version
          </Button>
        </Card>

        <p className="text-xs text-muted-foreground">
          Pages, banners, SEO fields and the translation workbench are not built
          yet — policy versioning came first because it is the part with a hard
          correctness constraint attached to it.
        </p>
      </div>
    </AdminLayout>
  );
}
