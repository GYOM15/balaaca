"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A link that knows whether the reader is standing on it.
 *
 * <p>The one thing a server layout cannot work out for itself. The dashboard
 * shell is drawn once, above the page, so it has no pathname - and its sidebar
 * and its bottom bar were therefore marking nothing as current. A navigation
 * that cannot say where you are is the complaint that started this work.
 *
 * <p>Client, and only just: it renders links and reads the path. No data, no
 * session, no state. Everything around it stays on the server.
 *
 * <p>`exact` because /dashboard is the prefix of every other room. Without it
 * the diary would be current on all of them.
 */
export function CurrentLink({
  href,
  className,
  exact,
  children,
}: {
  href: string;
  className?: string;
  exact?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const here = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link className={className} href={href} aria-current={here ? "page" : undefined}>
      {children}
    </Link>
  );
}
