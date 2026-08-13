import { login } from "@/api/functions/auth.api";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { getAuthToken, setAuthToken } from "@/lib/functions/auth.lib";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required")
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" }
  });

  // Already signed in — don't show a login form to someone who has a session.
  useEffect(() => {
    if (getAuthToken()) router.replace("/");
  }, [router]);

  const { mutate, isPending, error } = useMutation({
    mutationFn: login,
    // Toasts are handled globally in _app; this one owns its own error display
    // because the message belongs next to the form, not in a corner.
    meta: { showToast: false },
    onSuccess: async (data) => {
      // Lifetime comes from the server so the cookie can never outlive — or
      // expire before — the token it holds.
      setAuthToken(data.token, data.expiresIn);
      queryClient.setQueryData(["admin", "me"], data.admin);
      const next = router.query.next;
      await router.replace(typeof next === "string" && next.startsWith("/") ? next : "/");
    }
  });

  const message =
    (error as AxiosError<{ message?: string }>)?.response?.data?.message ??
    (error ? "Could not sign in. Please try again." : null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg bg-foreground text-lg font-semibold text-background">
            T
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">Travel Admin</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to manage inventory and bookings
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-background p-6 shadow-sm">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => mutate(values))}
              className="flex flex-col gap-4"
              noValidate
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="username"
                        placeholder="you@example.com"
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </Form>
        </div>

        {/* §1.3: no self-registration, and no password reset by email alone. */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Accounts are provisioned by the system administrator.
        </p>
      </div>
    </div>
  );
}
