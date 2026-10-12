import { useCallback, useRef, useState } from "react";

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
