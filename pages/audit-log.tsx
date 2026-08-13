import { listAuditLogs } from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/functions/format.lib";
import { useQuery } from "@tanstack/react-query";
import { Lock, Search } from "lucide-react";
import { useState } from "react";

/**
 * §14.6: the audit log is immutable and append-only, and is NOT editable or
 * deletable from the UI under any circumstance — including by the super
 * administrator. There are deliberately no actions on this screen: with a
 * single account it is the only mechanism that can distinguish the owner's
 * actions from an attacker using the owner's session.
 */

const RISKY = [
  "PASSPORT_UNMASKED",
  "CUSTOMER_EXPORTED",
  "FINANCIAL_EXPORTED",
  "BREAK_GLASS_ENABLED",
  "LOGIN_FAILED",
  "STEP_UP_FAILED"
];

export default function AuditLogPage() {
  const [action, setAction] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", action],
    queryFn: () => listAuditLogs(action ? { action } : {})
  });

  return (
    <AdminLayout
      title="Audit log"
      description="Append-only. What changed, when, and from where."
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2 rounded-lg border bg-background px-4 py-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This log cannot be edited or deleted from anywhere in the panel,
            including by you. Update and delete are refused at the database
            model, not just hidden here.
          </p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value.toUpperCase())}
            placeholder="Filter by action, e.g. LOGIN_FAILED"
            className="pl-9"
          />
        </div>

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : !data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No entries match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(l.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          RISKY.includes(l.action)
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
                            : ""
                        }
                      >
                        {l.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{l.actorEmail}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.entityType ? `${l.entityType}` : "—"}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                      {l.reason || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {l.ip}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Retained a minimum of two years. Copying these to append-only external
          storage, so a database compromise cannot erase the evidence, is not
          yet configured.
        </p>
      </div>
    </AdminLayout>
  );
}
