import {
  listTemplates,
  saveTemplate,
  sendTestNotification
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
import { AxiosError } from "axios";
import { Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * §11 notification templates.
 *
 * Two rules are enforced by the server and surfaced here: unknown placeholders
 * block saving, and sensitive data (passport, card, permanent document links)
 * is refused outright — SMS is unencrypted in transit and persists on handsets
 * indefinitely.
 */
export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({
    event: "ORDER_CONFIRMED",
    locale: "fr",
    channel: "SMS",
    subject: "",
    body: ""
  });
  const [preview, setPreview] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: listTemplates
  });

  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ??
        "Could not save"
    );

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => saveTemplate(draft),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template saved");
    },
    onError
  });

  const { mutate: test } = useMutation({
    mutationFn: () =>
      sendTestNotification({
        event: draft.event,
        channel: draft.channel,
        body: draft.body
      }),
    meta: { showToast: false },
    onSuccess: (r) => setPreview(r.preview),
    onError
  });

  return (
    <AdminLayout
      title="Notifications"
      description="One template per event per locale · a broken template reaches every customer"
    >
      <div className="flex max-w-5xl flex-col gap-6">
        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-sm font-medium">Template</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Variables:{" "}
            {(data?.variables ?? []).map((v) => (
              <code key={v} className="mr-1 rounded bg-muted px-1">{`{{${v}}}`}</code>
            ))}
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Event</Label>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={draft.event}
                onChange={(e) => setDraft({ ...draft, event: e.target.value })}
              >
                {(data?.events ?? []).map((ev) => (
                  <option key={ev} value={ev}>
                    {ev.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Locale</Label>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={draft.locale}
                onChange={(e) => setDraft({ ...draft, locale: e.target.value })}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Channel</Label>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={draft.channel}
                onChange={(e) => setDraft({ ...draft, channel: e.target.value })}
              >
                <option value="SMS">SMS</option>
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="PUSH">Push</option>
              </select>
            </div>
          </div>
          {draft.channel === "EMAIL" ? (
            <div className="mt-4">
              <Label className="text-xs">Subject</Label>
              <Input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              />
            </div>
          ) : null}
          <div className="mt-4">
            <Label className="text-xs">Body</Label>
            <Textarea
              rows={4}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="Bonjour {{customer_name}}, votre commande {{order_ref}} est confirmée."
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => save()} disabled={isPending || !draft.body}>
              Save template
            </Button>
            <Button variant="outline" className="gap-2" disabled={!draft.body} onClick={() => test()}>
              <Send className="size-3.5" />
              Send test to me
            </Button>
          </div>
          {preview ? (
            <div className="mt-3 rounded-md border bg-muted p-3 text-sm">
              <p className="mb-1 text-xs text-muted-foreground">Preview</p>
              {preview}
            </div>
          ) : null}
        </Card>

        <section>
          <h2 className="mb-3 text-sm font-medium">Saved templates</h2>
          <Card className="gap-0 divide-y p-0">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : !data?.items.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                No templates yet. Every customer-facing message needs one.
              </p>
            ) : (
              data.items.map((t) => (
                <button
                  key={t.id}
                  className="block w-full p-4 text-left hover:bg-muted/50"
                  onClick={() =>
                    setDraft({
                      event: t.event,
                      locale: t.locale,
                      channel: t.channel,
                      subject: t.subject,
                      body: t.body
                    })
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {t.event.replace(/_/g, " ")}
                    </span>
                    <Badge variant="outline">{t.locale.toUpperCase()}</Badge>
                    <Badge variant="secondary">{t.channel}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {t.body}
                  </p>
                </button>
              ))
            )}
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium">Delivery log</h2>
          <Card className="gap-0 divide-y p-0">
            {!data?.deliveryLog.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                Nothing sent yet.
              </p>
            ) : (
              data.deliveryLog.map((l) => (
                <div key={l.id} className="flex items-center justify-between p-4 text-sm">
                  <span>
                    {l.event} · {l.channel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {l.recipient} · {l.status} · {formatDateTime(l.createdAt)}
                  </span>
                </div>
              ))
            )}
          </Card>
        </section>

        <p className="text-xs text-muted-foreground">
          No provider is wired yet, so &ldquo;send test&rdquo; renders and logs
          but does not transmit. Per-event channel configuration and SMS cost
          tracking need the messaging provider to be chosen first.
        </p>
      </div>
    </AdminLayout>
  );
}
