"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import type { ReadinessView } from "@/lib/types";

/**
 * The way onward, on every screen of the setup except the one that lists it.
 *
 * <p>The dashboard already draws the whole road: three conditions, each with
 * its state and its link. What it could not do is follow somebody who took
 * one. A provider lands on the hours screen, fills in a week, saves - and the
 * page they are standing on has no idea an onboarding exists, so nothing says
 * what is left or how to get back. The complaint was "there is no next".
 *
 * <p>So the strip lives here, in the shell, and not in `dashboard/hours` or
 * `dashboard/services`. Those are destinations a provider will reopen for
 * years, and onboarding furniture nailed into them would outlive the
 * onboarding by exactly that long. One component, mounted once, that removes
 * itself the day the page goes live.
 *
 * <p>Client, for the one thing a server layout cannot know: which page is
 * being read. On `/dashboard` the full list is already the first thing on the
 * screen, and a strip above it would say the same sentence twice.
 */
export function NextStep({ readiness, owner }: { readiness: ReadinessView; owner: boolean }) {
  const path = usePathname();

  // Published is the end of the road. can_publish without published still has
  // one step left, and it is the one a provider forgets: the page is ready and
  // nobody can see it.
  if (!owner || readiness.published) return null;
  if (path === "/dashboard") return null;

  const step = nextStep(readiness);

  return (
    <div className="alert alert--info" role="status" style={{ marginBottom: "var(--s-5)" }}>
      <span className="alert__icon" aria-hidden="true">
        <Icon name="info" size={18} />
      </span>
      <div className="alert__body">
        {step.done} {step.todo}{" "}
        <Link href={step.href}>{step.cta}</Link>
      </div>
    </div>
  );
}

/**
 * What is left, in the order the road is walked.
 *
 * <p>One step at a time rather than a list. The list is on the dashboard; this
 * is the pointer, and a pointer that names three things is a list.
 */
function nextStep(readiness: ReadinessView): {
  done: string;
  todo: string;
  href: string;
  cta: string;
} {
  const count = [readiness.has_service, readiness.has_hours, readiness.has_bookable_staff].filter(
    Boolean,
  ).length;
  const done = count === 3 ? "" : `${count} étape sur 3 ·`;

  if (!readiness.has_service) {
    return {
      done,
      todo: "Il reste à créer une prestation.",
      href: "/dashboard/services",
      cta: "Mes prestations",
    };
  }
  if (!readiness.has_hours) {
    return {
      done,
      todo: "Il reste à poser vos horaires.",
      href: "/dashboard/hours",
      cta: "Mes horaires",
    };
  }
  if (!readiness.has_bookable_staff) {
    return {
      done,
      todo: "Il reste à marquer quelqu’un comme réservable.",
      href: "/dashboard/team",
      cta: "Mon équipe",
    };
  }
  return {
    done: "",
    todo: "Tout est prêt. Votre page n’est pas encore en ligne.",
    href: "/dashboard",
    cta: "Publier ma page",
  };
}
