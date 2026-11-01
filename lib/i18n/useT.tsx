import { DirectionProvider } from "@radix-ui/react-direction";
import { parseCookies, setCookie } from "nookies";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";
import { DEFAULT_LOCALE, isRtl, Locale, LOCALES } from "./dictionaries";
import { setCurrentLocale, translate, type TranslationKey } from "./messages";

/** Also read by pages/_document.tsx, to set the page's direction before it paints. */
export const LOCALE_COOKIE = "admin_locale";

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<Ctx>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (k, vars) => translate(DEFAULT_LOCALE, k, vars)
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  /**
   * Starts on the default (French, §2.3) for both server and first client
   * render, then adopts the stored preference. Reading the cookie during render
   * would make the server and client markup disagree and hydration would warn.
   */
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [loaded, setLoaded] = useState(false);
  // Before the screens render: the label maps and number formats read it.
  setCurrentLocale(locale);

  useEffect(() => {
    const stored = parseCookies()[LOCALE_COOKIE] as Locale | undefined;
    if (stored && LOCALES.includes(stored)) setLocaleState(stored);
    setLoaded(true);
  }, []);

  // <html lang dir> follow the language. The first load's are already set
  // from the cookie by _document, so nothing is written until it is read here
  // (writing French's "ltr" first would flash an Arabic page the wrong way).
  useEffect(() => {
    if (!loaded) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
  }, [locale, loaded]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    setCookie(null, LOCALE_COOKIE, l, { path: "/", maxAge: 365 * 24 * 60 * 60 });
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {/* Radix menus, selects, tabs… open and move the right way in Arabic. */}
      <DirectionProvider dir={isRtl(locale) ? "rtl" : "ltr"}>{children}</DirectionProvider>
    </I18nContext.Provider>
  );
}

export const useT = () => useContext(I18nContext);

/** "rtl" while the panel is in Arabic, else "ltr": for a `dir` prop. */
export const useDir = () => (isRtl(useT().locale) ? "rtl" : "ltr");
