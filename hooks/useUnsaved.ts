import Router from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Whether a form holds changes the server has not got.
 *
 * `dirty` is state, for what is on screen. Beside it sits a ref, for the two
 * questions state cannot answer in time:
 *
 *  - "is it dirty right now?", asked by the effect that fills the form from
 *    the server. A refetch landing on a form someone is typing in must leave
 *    it alone: the form is ahead of the server, not behind it.
 *  - "was anything typed while that save was in flight?" If so the save did
 *    not carry it, and the form is still unsaved however the save went.
 */
export function useUnsaved() {
  const [dirty, setDirtyState] = useState(false);
  const live = useRef({ dirty: false, edits: 0 });

  const setDirty = useCallback((next: boolean) => {
    live.current = { dirty: next, edits: live.current.edits + (next ? 1 : 0) };
    setDirtyState(next);
  }, []);

  const isDirty = useCallback(() => live.current.dirty, []);

  /**
   * Call just before sending. What it returns is asked once the answer is
   * back: true when nothing has been changed since, so the form now equals
   * what the server holds.
   */
  const mark = useCallback(() => {
    const at = live.current.edits;
    return () => live.current.edits === at;
  }, []);

  return { dirty, setDirty, isDirty, mark };
}

/** What a refused route change is rejected with; recognised below so it is not reported as an error. */
const STAYED = "Stayed on the page: it holds unsaved work";

/**
 * Asks before a form is left while it holds unsaved work — by closing or
 * reloading the tab, and by moving on inside the panel (a menu link, the
 * search, Back). Those never unload the page, so the browser's own question
 * never came: the form went, and a video on its way was cancelled with it.
 *
 * Returns a function that lets the form's own next move through: the redirect
 * after a save is not the admin leaving anything.
 */
export function useLeaveGuard({
  dirty,
  uploading
}: {
  dirty: boolean;
  uploading?: boolean;
}) {
  const guard = useRef({ question: "", allowed: false });
  guard.current.question = uploading
    ? "A video is still uploading. Leave this page and cancel the upload?"
    : dirty
      ? "Leave this page? The changes you have not saved will be lost."
      : "";

  useEffect(() => {
    const g = guard.current;
    /** Whether to stay. Nothing to lose: no. Otherwise the admin decides — once per departure. */
    const stay = () => {
      if (!g.question || g.allowed) return false;
      if (!window.confirm(g.question)) return true;
      g.allowed = true;
      return false;
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!g.question || g.allowed) return;
      e.preventDefault();
      e.returnValue = "";
    };
    // The pages router cannot be answered "no": throwing from this event is
    // the way a route change is stopped.
    const onRoute = (url: string) => {
      // Not on the way to the sign-in page: that is the session ending (signed
      // out, or expired), and staying would keep a form that can no longer be
      // saved.
      if (url === Router.asPath || url.startsWith("/login") || !stay()) return;
      Router.events.emit("routeChangeError", STAYED, url, { shallow: false });
      throw STAYED;
    };
    // That throw rejects a promise nobody holds (a menu link's click). It is
    // an answer, not a fault: kept out of the console and the error screen.
    const quiet = (e: PromiseRejectionEvent) => {
      if (e.reason !== STAYED) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const settle = () => {
      g.allowed = false;
    };
    // Which entry of the browser's history is this page's own: where it is
    // standing whenever a move has finished with this page still on screen
    // (not fixed at the start — a move elsewhere that was overtaken before it
    // drew anything leaves this same page at a later entry).
    const nav = (
      window as unknown as {
        navigation?: { currentEntry: { index: number } | null };
      }
    ).navigation;
    let mine = nav?.currentEntry?.index;
    const arrived = () => {
      settle();
      mine = nav?.currentEntry?.index ?? mine;
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("unhandledrejection", quiet, true);
    Router.events.on("routeChangeStart", onRoute);
    Router.events.on("routeChangeComplete", arrived);
    Router.events.on("routeChangeError", settle);
    // Back and Forward have already moved the browser to another entry of its
    // history by the time the router hears of them: staying means going back
    // to this page's own entry. A browser that cannot say which entry that is
    // gets the address put back instead (over the entry it landed on).
    Router.beforePopState(({ as }) => {
      // The same address is this page again (the way back from a refused
      // move): nothing is being left.
      if (as === Router.asPath || !stay()) return true;
      const now = nav?.currentEntry?.index;
      if (mine !== undefined && now !== undefined && now !== mine) {
        window.history.go(mine - now);
      } else {
        setTimeout(
          () =>
            void Router.push(Router.asPath, undefined, {
              shallow: true,
              scroll: false
            })
        );
      }
      return false;
    });
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("unhandledrejection", quiet, true);
      Router.events.off("routeChangeStart", onRoute);
      Router.events.off("routeChangeComplete", arrived);
      Router.events.off("routeChangeError", settle);
      Router.beforePopState(() => true);
    };
  }, []);

  return useCallback(() => {
    guard.current.allowed = true;
  }, []);
}
