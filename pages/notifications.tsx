import {
  listTemplates,
  saveTemplate,
  sendTestNotification
} from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/functions/format.lib";
import { label, NOTIFICATION_EVENT } from "@/lib/functions/labels.lib";
import { useCan } from "@/lib/permissions";
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
  // Templates and the delivery log are notifications:read, which is what opens
  // this page. Saving and "send test" are notifications:write; without it the
  // template card only displays whichever saved template is clicked.
  const { can } = useCan();
  const canWrite = can("notifications:write");
  /** Where "send test" goes. Defaults to the admin's own number on the server. */
  const [testTo, setTestTo] = useState("");
  const [draft, setDraft] = useState({
    event: "ORDER_CONFIRMED",
    channel: "SMS",
    subject: "",
    body: ""
  });
  const [preview, setPreview] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
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

  const { mutate: test, isPending: testing } = useMutation({
    mutationFn: () =>
      sendTestNotification({
        event: draft.event,
        channel: draft.channel,
        body: draft.body,
        to: testTo || undefined
      }),
    meta: { showToast: false },
    onSuccess: (r) => {
      setPreview(r.preview);
      toast[r.delivered ? "success" : "message"](
        r.delivered
          ? "Sent — check your handset"
          : "Rendered and logged; nothing was transmitted"
      );
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError
  });

  return (
    <AdminLayout
      title="Notifications"
      description="One template per event · English only · a broken template reaches every customer"
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Event</Label>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={draft.event}
                disabled={!canWrite}
                onChange={(e) => setDraft({ ...draft, event: e.target.value })}
              >
                {(data?.events ?? []).map((ev) => (
                  <option key={ev} value={ev}>
                    {label(NOTIFICATION_EVENT, ev)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Channel</Label>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={draft.channel}
                disabled={!canWrite}
                onChange={(e) => setDraft({ ...draft, channel: e.target.value })}
              >
                {/* SMS and push only. This market reaches customers on a
                    handset, and every extra channel is another template per
                    event to keep correct. */}
                <option value="SMS">SMS</option>
                <option value="PUSH">Push</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Label className="text-xs">Body</Label>
            <Textarea
              rows={4}
              value={draft.body}
              disabled={!canWrite}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="Bonjour {{customer_name}}, votre commande {{order_ref}} est confirmée."
            />
          </div>
          {canWrite ? (
            <>
              <div className="mt-4">
                <Label className="text-xs">Send test to (optional)</Label>
                <Input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="+243 81 000 00 00 — defaults to your admin number"
                />
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => save()} disabled={isPending || !draft.body}>
                  Save template
                </Button>
                <Button variant="outline" className="gap-2" disabled={!draft.body || testing} onClick={() => test()}>
                  <Send className="size-3.5" />
                  Send test to me
                </Button>
              </div>
            </>
          ) : null}
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
            ) : isError ? (
              <QueryError onRetry={() => refetch()} />
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
                      channel: t.channel,
                      subject: t.subject,
                      body: t.body
                    })
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {label(NOTIFICATION_EVENT, t.event)}
                    </span>
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
                <div key={l.id} className="p-4 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span>
                      {l.event} · {l.channel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {l.recipient} · {l.status} · {formatDateTime(l.createdAt)}
                    </span>
                  </div>
                  {/* What the customer actually read. "Was it delivered?" is
                      only half the question support gets asked. */}
                  {l.body ? (
                    <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">
                      {l.body}
                    </p>
                  ) : null}
                  {l.status === "FAILED" && l.providerMessage ? (
                    <p className="mt-1 text-xs text-destructive">{l.providerMessage}</p>
                  ) : null}
                </div>
              ))
            )}
          </Card>
        </section>

        <p className="text-xs text-muted-foreground">
          Messages fire automatically on each event. A customer signed in to
          the app gets a push notification instead of the SMS; guests and
          customers without the app get the SMS. Cash-deadline reminders and
          cancellations go by both. The log shows which channel each one used.
          An event with no PUSH template uses its SMS wording, without the
          link.
        </p>
      </div>
    </AdminLayout>
  );
}
