import { listSessions, revokeOtherSessions } from "@/api/functions/admin.api";
import { changePassword } from "@/api/functions/auth.api";
import AdminLayout, { useSignOut } from "@/components/Layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { clearAuthToken } from "@/lib/functions/auth.lib";
import { formatDateTime } from "@/lib/functions/format.lib";
import { tr, type TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

// The server enforces the same minimum length. Its refusal is shown under the
// fields. Messages are worded when a check fails, in the panel's language then.
const schema = z
  .object({
    currentPassword: z.string().min(1, { error: () => tr("ops.account.currentRequired") }),
    newPassword: z.string().min(8, { error: () => tr("ops.account.tooShort") }),
    confirmPassword: z.string().min(1, { error: () => tr("ops.account.confirmRequired") })
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    error: () => tr("ops.account.mismatch")
  });

type FormValues = z.infer<typeof schema>;

const FIELDS: {
  name: keyof FormValues;
  label: TranslationKey;
  autoComplete: string;
}[] = [
  {
    name: "currentPassword",
    label: "ops.account.currentPassword",
    autoComplete: "current-password"
  },
  { name: "newPassword", label: "ops.account.newPassword", autoComplete: "new-password" },
  {
    name: "confirmPassword",
    label: "ops.account.confirmPassword",
    autoComplete: "new-password"
  }
];

/** Open to every signed-in admin: it needs no permission. */
export default function AccountPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { admin } = useCan();
  const { signOut, isPending: signingOut } = useSignOut();
  const { t } = useT();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" }
  });

  const { mutate, isPending, error } = useMutation({
    mutationFn: ({ currentPassword, newPassword }: FormValues) =>
      changePassword({ currentPassword, newPassword }),
    // The refusal belongs next to the form, as on the login screen.
    meta: { showToast: false },
    onSuccess: async () => {
      // The server has just signed every session out, this one included. The
      // cache is emptied only once this page is gone, so nothing still mounted
      // refetches with the dead session and races the redirect.
      clearAuthToken();
      await router.replace("/login?changed=1");
      queryClient.clear();
    }
  });

  const message =
    (error as AxiosError<{ message?: string }>)?.response?.data?.message ??
    (error ? t("ops.account.changeFailed") : null);

  // §14.1: their own devices, with one click to sign the others out. It lived
  // on a Security page of its own; this is the only other place it belongs.
  const { data: devices } = useQuery({
    queryKey: ["sessions"],
    queryFn: listSessions,
    enabled: !admin?.mustChangePassword
  });
  const { mutate: revoke, isPending: revoking } = useMutation({
    mutationFn: revokeOtherSessions,
    meta: { showToast: false },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.success(t("ops.account.revoked", { n: r?.revoked ?? 0 }));
    },
    // Opts out of the global toast, so without this a failure was silent.
    onError: (e) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ??
          t("ops.account.revokeFailed")
      )
  });
  const others = (devices?.sessions ?? []).filter((s) => s.id !== devices?.currentSessionId);

  const passwordForm = (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="flex flex-col gap-4"
        noValidate
      >
        {FIELDS.map(({ name, label, autoComplete }) => (
          <FormField
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t(label)}</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete={autoComplete} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}

        {message ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {message}
          </p>
        ) : null}

        <Button type="submit" className="mt-1 w-full" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("ops.account.saving")}
            </>
          ) : (
            t("nav.changePassword")
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("ops.account.passwordHint")}
        </p>
      </form>
    </Form>
  );

  // Signed in with a temporary password: nothing else in the panel answers
  // until it is replaced, so there is no navigation to offer — only the form
  // and a way out.
  if (admin?.mustChangePassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-[400px]">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              {t("ops.account.setOwnTitle")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ops.account.setOwnBody")}
            </p>
          </div>

          <div className="rounded-xl border bg-background p-6 shadow-sm">
            {passwordForm}
          </div>

          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={signingOut}
              onClick={() => signOut()}
            >
              {t("nav.signOut")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout title={t("ops.account.title")} description={t("ops.account.description")}>
      <div className="flex max-w-md flex-col gap-6">
        <Card className="gap-1 p-5">
          <p className="text-sm font-medium">{admin?.name}</p>
          <p className="text-sm text-muted-foreground">{admin?.email}</p>
          <p className="text-sm text-muted-foreground">{admin?.roleName}</p>
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="mb-4 text-sm font-medium">{t("nav.changePassword")}</h2>
          {passwordForm}
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-sm font-medium">{t("ops.account.devices")}</h2>
          <p className="mb-4 text-xs text-muted-foreground">{t("ops.account.devicesHint")}</p>
          <ul className="divide-y rounded-md border">
            {(devices?.sessions ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {s.deviceLabel}
                    {s.id === devices?.currentSessionId ? (
                      <Badge variant="secondary" className="ms-2">
                        {t("ops.account.thisDevice")}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("ops.account.session", {
                      ip: s.ip,
                      signedIn: formatDateTime(s.createdAt),
                      lastSeen: formatDateTime(s.lastSeenAt)
                    })}
                  </p>
                </div>
              </li>
            ))}
            {!devices ? (
              <li className="p-3 text-sm text-muted-foreground">{t("common.loading")}</li>
            ) : null}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 self-start"
            disabled={revoking || !others.length}
            onClick={() => revoke()}
          >
            {t("ops.account.revokeOthers")}
          </Button>
        </Card>
      </div>
    </AdminLayout>
  );
}
