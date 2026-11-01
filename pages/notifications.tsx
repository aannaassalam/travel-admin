import {
  deleteTemplate,
  listTemplates,
  saveTemplate,
  sendTestNotification
} from "@/api/functions/admin.api";
import DeleteButton from "@/components/DeleteButton";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/functions/format.lib";
import { lz, toLocalized } from "@/lib/functions/localized.lib";
import {
  DELIVERY_STATUS,
  label,
  NOTIFICATION_EVENT,
  NOTIFICATION_ROUTE
} from "@/lib/functions/labels.lib";
import { useT } from "@/lib/i18n/useT";
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
  const { t } = useT();
  // Templates and the delivery log are notifications:read, which is what opens
  // this page. Saving and "send test" are notifications:write; without it the
  // template card only displays whichever saved template is clicked. Deleting
  // a saved template is notifications:delete, which its bin checks itself.
  const { can } = useCan();
  const canWrite = can("notifications:write");
  /** Where "send test" goes. Defaults to the admin's own number on the server. */
  const [testTo, setTestTo] = useState("");
  // Per language: each customer gets theirs, else English, else French.
  const [draft, setDraft] = useState({
    event: "ORDER_CONFIRMED",
    channel: "SMS",
    subject: {} as Localized,
    body: {} as Localized
  });
  const [preview, setPreview] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["templates"],
    queryFn: listTemplates
  });
  const templates = usePaged(data?.items ?? []);
  const deliveries = usePaged(data?.deliveryLog ?? []);


  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ??
        t("sys.couldNotSave")
    );

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => saveTemplate(draft),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success(t("sys.notif.saved"));
    },
    onError
  });

  const { mutate: test, isPending: testing } = useMutation({
    mutationFn: () =>
      sendTestNotification({
        event: draft.event,
        channel: draft.channel,
        // One text: the panel's language, else the French.
        body: lz(draft.body),
        to: testTo || undefined
      }),
    meta: { showToast: false },
    onSuccess: (r) => {
      setPreview(r.preview);
      toast[r.delivered ? "success" : "message"](
        r.delivered ? t("sys.notif.sent") : t("sys.notif.notSent")
      );
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError
  });

  return (
    <AdminLayout
      title={t("notif.title")}
      description={t("sys.notif.description")}
    >
      <div className="flex max-w-5xl flex-col gap-6">
        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-sm font-medium">{t("sys.notif.template")}</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("sys.notif.variables")}{" "}
            {(data?.variables ?? []).map((v) => (
              <code key={v} className="me-1 rounded bg-muted px-1">{`{{${v}}}`}</code>
            ))}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{t("sys.notif.event")}</Label>
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
              <Label className="text-xs">{t("sys.notif.channel")}</Label>
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
                <option value="PUSH">{t("sys.notif.push")}</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <LocalizedInput
              label={t("sys.notif.body")}
              required
              multiline
              rows={4}
              value={draft.body}
              disabled={!canWrite}
              onChange={(body) => setDraft({ ...draft, body })}
              placeholder="Bonjour {{customer_name}}, votre commande {{order_ref}} est confirmée."
            />
          </div>
          {canWrite ? (
            <>
              <div className="mt-4">
                <Label className="text-xs">{t("sys.notif.testTo")}</Label>
                <Input
                  dir="ltr"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder={t("sys.notif.testToPlaceholder")}
                />
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => save()} disabled={isPending || !draft.body.fr}>
                  {t("sys.notif.save")}
                </Button>
                <Button variant="outline" className="gap-2" disabled={!lz(draft.body) || testing} onClick={() => test()}>
                  <Send className="size-3.5" />
                  {t("sys.notif.sendTest")}
                </Button>
              </div>
            </>
          ) : null}
          {preview ? (
            <div className="mt-3 rounded-md border bg-muted p-3 text-sm">
              <p className="mb-1 text-xs text-muted-foreground">{t("sys.notif.preview")}</p>
              {preview}
            </div>
          ) : null}
        </Card>

        <section>
          <h2 className="mb-3 text-sm font-medium">{t("sys.notif.savedTemplates")}</h2>
          <Card className="gap-0 divide-y p-0">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : isError ? (
              <QueryError onRetry={() => refetch()} />
            ) : !data?.items.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("sys.notif.noTemplates")}
              </p>
            ) : (
              templates.rows.map((tpl) => (
                // The row is itself a button, so the bin sits beside it.
                <div key={tpl.id} className="flex items-center">
                  <button
                    className="block min-w-0 flex-1 p-4 text-start hover:bg-muted/50"
                    onClick={() =>
                      setDraft({
                        event: tpl.event,
                        channel: tpl.channel,
                        subject: toLocalized(tpl.subject),
                        body: toLocalized(tpl.body)
                      })
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {label(NOTIFICATION_EVENT, tpl.event)}
                      </span>
                      <Badge variant="secondary">{tpl.channel}</Badge>
                    </div>
                    {NOTIFICATION_ROUTE[tpl.event] ? (
                      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                        {NOTIFICATION_ROUTE[tpl.event]}
                      </p>
                    ) : null}
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {lz(tpl.body)}
                    </p>
                  </button>
                  {/* What is loaded in the form above stays as it is: saving
                      it again is how the template comes back. */}
                  <DeleteButton
                    permission="notifications:delete"
                    what={t("sys.notif.deleteWhat", {
                      name: `${label(NOTIFICATION_EVENT, tpl.event)} · ${tpl.channel}`
                    })}
                    consequence={
                      tpl.channel === "PUSH"
                        ? t("sys.notif.deletePush")
                        : t("sys.notif.deleteOther", {
                            channel: tpl.channel === "EMAIL" ? t("sys.notif.emailWord") : tpl.channel
                          })
                    }
                    onDelete={() => deleteTemplate(tpl.id)}
                    onDeleted={() =>
                      queryClient.invalidateQueries({ queryKey: ["templates"] })
                    }
                    className="me-2"
                  />
                </div>
              ))
            )}
          </Card>
          <div className="mt-3">
            <Pager
              {...templates.pager}
              noun={t("sys.notif.nounTemplate")}
              plural={t("sys.notif.nounTemplates")}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium">{t("sys.notif.deliveryLog")}</h2>
          <Card className="gap-0 divide-y p-0">
            {!data?.deliveryLog.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("sys.notif.nothingSent")}
              </p>
            ) : (
              deliveries.rows.map((l) => (
                <div key={l.id} className="p-4 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span>
                      {label(NOTIFICATION_EVENT, l.event)} · {l.channel}
                    </span>
                    {/* An office e-mail shows its whole address; a phone is masked by the server. */}
                    <span className="text-xs text-muted-foreground">
                      {l.recipient} · {label(DELIVERY_STATUS, l.status)} ·{" "}
                      {formatDateTime(l.createdAt)}
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
                  {/* Not sent on purpose (no app, and no text for that
                      message): shown plainly, not as an error. */}
                  {l.status === "SKIPPED" && l.providerMessage ? (
                    <p className="mt-1 text-xs italic text-muted-foreground">{l.providerMessage}</p>
                  ) : null}
                </div>
              ))
            )}
          </Card>
          <div className="mt-3">
            <Pager
              {...deliveries.pager}
              noun={t("sys.notif.nounMessage")}
              plural={t("sys.notif.nounMessages")}
            />
          </div>
        </section>

        <p className="text-xs text-muted-foreground">{t("sys.notif.footer")}</p>
      </div>
    </AdminLayout>
  );
}
