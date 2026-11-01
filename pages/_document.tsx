import { DEFAULT_LOCALE, LOCALES, RTL_LOCALES } from "@/lib/i18n/dictionaries";
import { LOCALE_COOKIE } from "@/lib/i18n/useT";
import { Html, Head, Main, NextScript } from "next/document";

/**
 * <html lang dir> from the language cookie before the first paint, so an
 * Arabic page never shows left to right first. The pages are static, so the
 * server cannot read the cookie; the I18nProvider keeps them in step after.
 */
const setDirection = `try{var m=document.cookie.match(/(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)/),l=m?decodeURIComponent(m[1]):"";if(${JSON.stringify(LOCALES)}.indexOf(l)<0)l=${JSON.stringify(DEFAULT_LOCALE)};var h=document.documentElement;h.lang=l;h.dir=${JSON.stringify(RTL_LOCALES)}.indexOf(l)<0?"ltr":"rtl"}catch(e){}`;

export default function Document() {
  return (
    <Html lang={DEFAULT_LOCALE} dir="ltr">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: setDirection }} />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
