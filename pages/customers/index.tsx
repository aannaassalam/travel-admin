import { listCustomers } from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
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
import { formatDate } from "@/lib/functions/format.lib";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function CustomersPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  // Global search's "See all" row lands here with the term already applied.
  useEffect(() => {
    if (typeof router.query.q === "string") setQ(router.query.q);
  }, [router.query.q]);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["customers", q],
    queryFn: () => listCustomers(q)
  });

  return (
    <AdminLayout
      title="Customers"
      description="Search by phone first — it is what gets read out on a call"
    >
      <div className="flex flex-col gap-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Phone, name or email…"
            className="pl-9"
          />
        </div>

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={3} className="p-0">
                    <QueryError onRetry={() => refetch()} />
                  </TableCell>
                </TableRow>
              ) : !data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                    No customers found.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link href={`/customers/${c.id}`} className="hover:underline">
                        {c.fullName}
                      </Link>
                      {c.isBlocked ? (
                        <Badge variant="destructive" className="ml-2">
                          Blocked
                        </Badge>
                      ) : null}
                    </TableCell>
                    {/* §8: masked here, revealed on the detail screen. A
                        screenshot of this list must not be a customer database. */}
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {c.phoneMasked}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Phone numbers are masked in this list by design.
        </p>
      </div>
    </AdminLayout>
  );
}
