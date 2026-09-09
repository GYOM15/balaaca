"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

/**
 * Back to where the person actually came from, when that is knowable.
 *
 * <p>These pages carried a `Retour` fixed to one destination: `/inscription`
 * sent people to `/professionnels` and `/rejoindre` to the home page. Neither is
 * where anybody arrives from. Somebody who reached one of them from the
 * dashboard's two choices - "Créer ma page" and "J'ai un code d'invitation" -
 * pressed Retour and landed on a marketing page, so the only way back to the
 * OTHER choice was the browser's own button.
 *
 * <p>So: go back through history when the previous page was ours, and follow
 * the fallback when it was not. `document.referrer` is exactly that signal, and
 * it is empty when a link was opened cold, from a bookmark, or from a message -
 * which is when history has nothing of ours to return to and a fallback is the
 * only honest answer.
 *
 * <p>It stays an anchor with a real `href`, not a button. The fallback is a page
 * the person can open in a new tab, and with no JavaScript at all this still
 * navigates somewhere sensible instead of doing nothing.
 */
export function BackLink({
  fallback,
  label = "Retour",
  className = "hdr__link",
}: {
  fallback: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <Link
      className={className}
      href={fallback}
      onClick={(event) => {
        // Modified clicks belong to the browser: a middle click, or one with a
        // modifier held, means "open this elsewhere" and must not be turned
        // into a history move in this tab.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        if (typeof document === "undefined" || !document.referrer) return;
        // Same origin only. A referrer from anywhere else is not a page this
        // application can send somebody back to, and `router.back()` would
        // leave the site.
        let sameOrigin = false;
        try {
          sameOrigin = new URL(document.referrer).origin === window.location.origin;
        } catch {
          sameOrigin = false;
        }
        if (!sameOrigin) return;
        event.preventDefault();
        router.back();
      }}
    >
      <Icon name="arrow-left" size={18} />
      {label}
    </Link>
  );
}
