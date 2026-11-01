import { en as coreEn, fr as coreFr, DEFAULT_LOCALE, type Locale } from "../dictionaries";
import * as inventory from "./inventory";
import * as operations from "./operations";
import * as system from "./system";
import * as transfers from "./transfers";
import ar from "./ar";
import es from "./es";
import pt from "./pt";
import ru from "./ru";
import zh from "./zh";

/** Every key of the panel: the core words plus each screen area's. */
const EN = { ...coreEn, ...inventory.en, ...operations.en, ...system.en, ...transfers.en };
export type TranslationKey = keyof typeof EN;

const FR: Record<TranslationKey, string> = {
  ...coreFr,
  ...inventory.fr,
  ...operations.fr,
  ...system.fr,
  ...transfers.fr
};

export const MESSAGES: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  fr: FR,
  en: EN,
  pt,
  es,
  zh,
  ar,
  ru
};

/**
 * A key in this language, else in English, else French, else the key itself;
 * `{name}` placeholders filled from `vars`.
 */
export const translate = (
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>
) => {
  const raw = MESSAGES[locale]?.[key] ?? EN[key] ?? FR[key] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : raw;
};

/**
 * The panel's language for code outside React (label maps, number formats,
 * toasts from the query cache). The I18nProvider sets it as it renders, before
 * the screens below it, so a helper called while rendering reads the language
 * that render shows.
 */
let current: Locale = DEFAULT_LOCALE;
export const setCurrentLocale = (locale: Locale) => {
  current = locale;
};
export const currentLocale = () => current;

/** translate() in the panel's current language: for helpers that have no hook. */
export const tr = (key: TranslationKey, vars?: Record<string, string | number>) =>
  translate(current, key, vars);
