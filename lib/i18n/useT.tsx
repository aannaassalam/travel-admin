import { parseCookies, setCookie } from "nookies";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";
import {
  DEFAULT_LOCALE,
  dictionaries,
  Locale,
  LOCALES,
  TranslationKey
} from "./dictionaries";

const LOCALE_COOKIE = "admin_locale";

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<Ctx>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (k) => dictionaries[DEFAULT_LOCALE][k] ?? k
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  /**
   * Starts on the default (French, §2.3) for both server and first client
   * render, then adopts the stored preference. Reading the cookie during render
   * would make the server and client markup disagree and hydration would warn.
   */
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = parseCookies()[LOCALE_COOKIE] as Locale | undefined;
    if (stored && LOCALES.includes(stored)) setLocaleState(stored);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    setCookie(null, LOCALE_COOKIE, l, { path: "/", maxAge: 365 * 24 * 60 * 60 });
  }, []);

  const t = useCallback(
    (key: TranslationKey) => dictionaries[locale][key] ?? key,
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useT = () => useContext(I18nContext);
