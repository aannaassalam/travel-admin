import EventListeners from "@/components/EventListener/EventListener";
import RouteGuard from "@/components/RouteGuard/RouteGuard";
import { DisplayCurrencyProvider, useDisplayCurrency } from "@/lib/displayCurrency";
import { tr } from "@/lib/i18n/messages";
import { I18nProvider, useDir } from "@/lib/i18n/useT";
import { inter } from "@/lib/fonts";
import "@/styles/globals.css";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
  QueryKey
} from "@tanstack/react-query";
import { AxiosResponse } from "axios";
import type { AppProps } from "next/app";
import { toast, Toaster } from "sonner";

interface ErrorData {
  response: {
    data: {
      message: string;
    };
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // A screen opened again reloads what it shows (it used to keep the copy
      // it had, so a change made on another screen stayed invisible).
      retry: 0
    }
  },
  mutationCache: new MutationCache({
    onSuccess: (data, _variables, _context, mutation) => {
      // Optional-chained on purpose: this runs for EVERY mutation, and only
      // the ones returning a raw AxiosResponse carry `headers`. Functions that
      // return `response.data` (the common case) previously threw here, which
      // react-query surfaced as a failed mutation — a successful request would
      // report itself as an error.
      const message = (data as AxiosResponse | undefined)?.headers?.[
        "x-message"
      ];
      const showToast = mutation.meta?.showToast !== false;
      if (showToast && message) {
        toast.success(message);
      }
      // Whatever a change touched, every screen showing it must see it: all
      // cached answers are marked out of date, those on screen reload now and
      // the rest when next opened (2026-11-06). Edit forms keep what is typed
      // (isDirty). A plain upload changes nothing yet: it opts out.
      if (mutation.meta?.invalidate !== false) void queryClient.invalidateQueries();
    },
    onError: (res, _variables, _context, mutation) => {
      // Honour meta.showToast here too, not just in onSuccess. A form that
      // renders the failure inline (login) would otherwise report it twice.
      if (mutation.meta?.showToast === false) return;
      const result = res as unknown as ErrorData;
      if (result?.response?.data?.message) {
        toast.error(result?.response?.data?.message);
      } else {
        toast.error(tr("common.requestFailed"));
      }
    },
    onSettled: (_data, _error, _variables, _context, mutation) => {
      if (mutation?.meta?.invalidateQueries) {
        queryClient.invalidateQueries({
          queryKey: mutation?.meta?.invalidateQueries as QueryKey,
          refetchType: "all"
        });
      }
    }
  })
});

/**
 * The screen, re-rendered on a change of language or display currency: the
 * label maps and money formats are read while rendering, so every screen
 * shows the new words and amounts without a hook of its own.
 */
function Screen({ Component, pageProps }: Pick<AppProps, "Component" | "pageProps">) {
  const dir = useDir();
  useDisplayCurrency();
  return (
    <>
      {/* Away from the sidebar: bottom-left sat on top of its sign-out button,
          and the sidebar is on the right in Arabic. */}
      <Toaster richColors dir={dir} position={dir === "rtl" ? "bottom-left" : "bottom-right"} />
      {/* Deny-by-default: every page is protected unless listed in
          PUBLIC_ROUTES, so a new page is guarded the moment it is created. */}
      <RouteGuard>
        <Component {...pageProps} />
      </RouteGuard>
    </>
  );
}

export default function CustomApp({ Component, pageProps }: AppProps) {
  return (
    <main className={`${inter.variable} font-sans`}>
      <QueryClientProvider client={queryClient}>
        <EventListeners />
        {/* §2.3: French by default; the language and currency pickers are in the panel's frame. */}
        <I18nProvider>
          <DisplayCurrencyProvider>
            <Screen Component={Component} pageProps={pageProps} />
          </DisplayCurrencyProvider>
        </I18nProvider>
      </QueryClientProvider>
    </main>
  );
}
