"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  SUCCESSES,
  SUCCESS_AT_PARAM,
  SUCCESS_PARAM,
  type SuccessCode,
} from "@/lib/feedback";

/**
 * What the vendored island publishes on the window, declared here because
 * presentation-script.ts is under ts-nocheck and exports nothing.
 *
 * <p>Optional on purpose: the island is the only thing that draws a toast, and
 * a page rendered without it must fail by saying nothing rather than by
 * throwing on a screen the provider is reading.
 */
declare global {
  interface Window {
    balToast?: (toast: {
      tone: "success" | "danger" | "info";
      title: string;
      body?: string;
    }) => void;
  }
}

/**
 * The design system's toast region, mounted once, listening to the URL.
 *
 * <p>The drawing, the dismissal and the timing are the prototype's - section 5
 * of presentation-script.ts, vendored, already correct. This reads
 * `?ok=CODE` off the address, looks the sentence up, and hands it over. Nothing
 * here decides anything: the server decided when it redirected.
 *
 * <p>The empty region is rendered rather than left to the island, which creates
 * one when it finds none. A live region is announced only if it was in the
 * document BEFORE its content arrived - a region created in the same tick as
 * its first toast is read out by nothing, which is how a confirmation can be
 * perfectly visible and still not exist for a screen reader.
 */
export function Toasts() {
  const params = useSearchParams();
  const code = params.get(SUCCESS_PARAM);
  const raised = params.get(SUCCESS_AT_PARAM);

  /** The success this region has already announced, so it announces it once. */
  const shown = useRef<string | null>(null);

  useEffect(() => {
    // The code comes off the URL, so it is whatever the browser sent. Indexing
    // alone would hand back a member of Object.prototype for `?ok=constructor`
    // and print it at the provider.
    if (!code || !Object.hasOwn(SUCCESSES, code)) return;

    // One success, one toast. StrictMode runs this effect twice in development
    // and drew the confirmation twice; a stale `?ok=` surviving in the URL
    // while something else re-renders would have drawn it again later. What
    // makes the same sentence legitimately appear twice is a second SAVE, and
    // that is what `ok_at` distinguishes.
    const announced = `${code}:${raised ?? ""}`;
    if (shown.current === announced) return;
    shown.current = announced;

    window.balToast?.({ tone: "success", title: SUCCESSES[code as SuccessCode] });
  }, [code, raised]);

  return <div className="toast-region" role="status" aria-live="polite" />;
}