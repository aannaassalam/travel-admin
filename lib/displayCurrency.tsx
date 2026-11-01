import { baseUrl } from "@/api/endpoints";
import {
  BASE_CURRENCY,
  setDisplayCurrency
} from "@/lib/functions/format.lib";
import {
  getFromLocalStorage,
  saveInLocalStorage
} from "@/lib/functions/storage.lib";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";

/** This device's choice only: localStorage, never the server. */
const STORAGE_KEY = "admin.displayCurrency";

type Rates = Partial<Record<string, number | null>>;

interface Ctx {
  /** The currency franc amounts are shown in: francs until the rates are in. */
  currency: string;
  /** FC and every currency the office has a rate for. */
  offered: string[];
  /** Francs per 1 unit, the office's rates (Settings). */
  rates: Rates;
  setCurrency: (currency: string) => void;
}

const DisplayCurrencyContext = createContext<Ctx>({
  currency: BASE_CURRENCY,
  offered: [BASE_CURRENCY],
  rates: {},
  setCurrency: () => {}
});

/**
 * The rates the website and the app price with: public, so every admin can
 * read them, whatever their permissions (Settings needs settings:read).
 */
const getSiteCurrencies = async () =>
  (
    await axios.get<{ offered: string[]; rates: Rates }>(
      `${baseUrl}/api/v1/site/currencies`
    )
  ).data;

export const SITE_CURRENCIES_QUERY = ["site-currencies"];

/**
 * The currency this panel shows franc amounts in, chosen in the header. The
 * format helpers (formatFrancs, formatMoney "CDF", formatOrderTotal) and
 * MoneyInput read it, so screens need no change of their own.
 */
export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [chosen, setChosen] = useState<string>(BASE_CURRENCY);
  // Read after mount, so the first render matches the server's. Storage can
  // be blocked (a private window): the choice then lasts the visit.
  useEffect(() => {
    try {
      const saved = getFromLocalStorage(STORAGE_KEY);
      if (saved) setChosen(saved);
    } catch {
      // Francs until one is chosen.
    }
  }, []);

  const { data } = useQuery({
    queryKey: SITE_CURRENCIES_QUERY,
    queryFn: getSiteCurrencies,
    staleTime: 10 * 60 * 1000
  });
  const rates = data?.rates ?? {};
  const offered = data?.offered?.length ? data.offered : [BASE_CURRENCY];
  // A currency whose rate was removed since, or not loaded yet: francs.
  const currency =
    chosen !== BASE_CURRENCY && offered.includes(chosen) && (rates[chosen] ?? 0) > 0
      ? chosen
      : BASE_CURRENCY;
  // Before the screens render: the format helpers read it.
  setDisplayCurrency(currency, rates);

  const setCurrency = (next: string) => {
    setChosen(next);
    try {
      saveInLocalStorage(STORAGE_KEY, next);
    } catch {
      // Kept for this visit only.
    }
  };

  return (
    <DisplayCurrencyContext.Provider value={{ currency, offered, rates, setCurrency }}>
      {children}
    </DisplayCurrencyContext.Provider>
  );
}

export const useDisplayCurrency = () => useContext(DisplayCurrencyContext);
