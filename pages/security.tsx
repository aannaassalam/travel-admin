import { getSecurity, revokeOtherSessions } from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/functions/format.lib";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Monitor, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

/** §14.1 device registration + §14.4 export log + §14.2 alert channel. */
export default function SecurityPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["security"],
    queryFn: getSecurity
  });

  const { mutate: revoke, isPending } = useMutation({
    mutationFn: revokeOtherSessions,
    meta: { showToast: false },
    onSuccess: (r: { revoked?: number }) => {
      queryClient.invalidateQueries({ queryKey: ["security"] });
      toast.success(`${r?.revoked ?? 0} other session(s) signed out`);
    }
  });

  return (
    <AdminLayout
      title="Security"
      description="Sessions, devices, exports and alerting"
    >
      <div className="flex flex-col gap-6">
        {/* §14.2: alerts must reach a channel not reachable from this panel. */}
        {data && !data.alertChannelConfigured ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-900 dark:text-amber-300">
              <strong>Out-of-band alerting is not configured.</strong> Set
              ADMIN_ALERT_EMAIL to an inbox that is <em>not</em> reachable from
              this panel — otherwise an attacker inside the panel can suppress
              the alerts about their own activity. Alerts currently only reach
              the server log.
            </p>
          </div>
        ) : null}

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Monitor className="size-4" />
            Active sessions
          </h2>
          <Card className="gap-0 divide-y p-0">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : (
              data?.sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium">
                      {s.deviceLabel}
                      {s.id === data.currentSessionId ? (
                        <Badge variant="secondary" className="ml-2">
                          This device
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.ip} · started {formatDateTime(s.createdAt)} · last seen{" "}
                      {formatDateTime(s.lastSeenAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </Card>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={isPending || (data?.sessions.length ?? 0) < 2}
            onClick={() => revoke()}
          >
            Sign out all other sessions
          </Button>
        </section>

        <section>
          <h2 className="mb-1 flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4" />
            Export log
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Every bulk export of customer or financial data, with row count and
            source IP. Exports are the most likely route for a large volume of
            data to leave in one action.
          </p>
          <Card className="gap-0 divide-y p-0">
            {!data?.exportLog.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                No exports have been run.
              </p>
            ) : (
              data.exportLog.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-4 text-sm">
                  <div>
                    <p className="font-medium">{e.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.actorEmail} · {e.ip} · {formatDateTime(e.createdAt)}
                    </p>
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    {e.rows ?? "—"} rows
                  </span>
                </div>
              ))
            )}
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium">Recent failed logins</h2>
          <Card className="gap-0 divide-y p-0">
            {!data?.recentFailedLogins.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                No failed attempts recorded.
              </p>
            ) : (
              data.recentFailedLogins.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-4 text-sm">
                  <span>{f.actorEmail}</span>
                  <span className="text-xs text-muted-foreground">
                    {f.reason} · {f.ip} · {formatDateTime(f.createdAt)}
                  </span>
                </div>
              ))
            )}
          </Card>
        </section>

        <p className="text-xs text-muted-foreground">
          Network isolation — a zero-trust proxy plus an IP allow-list in front of
          this subdomain — is infrastructure rather than application code, and
          is not in place yet.
        </p>
      </div>
    </AdminLayout>
  );
}
