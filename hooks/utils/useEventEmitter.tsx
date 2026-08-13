import eventEmitter from "@/services/event.emitter";
import { useEffect } from "react";
import useLatestRef from "./useLatestRef";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function useEventEmitter(
  event: string,
  handler: (...args: any[]) => void
) {
  const handlerRef = useLatestRef(handler);

  useEffect(() => {
    const listener = (...args: any[]) => handlerRef.current(...args);
    eventEmitter.on(event, listener);
    return () => {
      eventEmitter.off(event, listener);
    };
  }, [event, handlerRef]);
}
