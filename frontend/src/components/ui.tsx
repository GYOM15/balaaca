import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "./icon";
import { Sketch } from "./sketch";

/**
 * The component vocabulary, ported from the reference mockup.
 *
 * <p>Every one of these emits the class names `globals.css` already styles.
 * The markup is the mockup's, attribute for attribute, because the CSS was
 * written against it - a div moved or a wrapper dropped is a component that
 * looks almost right, which is the worst kind.
 *
 * <p>They are server components. Nothing here holds state, listens for an
 * event, or ships a byte of JavaScript to the browser: a page is rendered with
 * its data already in it, and what the browser gets is HTML and a form.
 */

/* --- Statuses ------------------------------------------------------------ */

/**
 * The five states an appointment can be in, as a reader sees them.
 *
 * <p>Keyed by the value the API sends. The enum is closed on both sides - the
 * contract's `AppointmentStatus` and the column's own CHECK - so a status
 * arriving here that is not in this map is a contract change nobody applied,
 * and it renders as itself rather than as a guess.
 */
export const STATUS: Record<
  string,
  { label: string; icon: string; tone: BadgeTone }
> = {
  PENDING: { label: "En attente", icon: "clock", tone: "warning" },
  CONFIRMED: { label: "Confirmé", icon: "check", tone: "success" },
  COMPLETED: { label: "Terminé", icon: "check-double", tone: "neutral" },
  NO_SHOW: { label: "Absent", icon: "user-x", tone: "danger" },
  CANCELLED: { label: "Annulé", icon: "x", tone: "outline" },
};

/* --- Wordmark ------------------------------------------------------------ */

/**
 * Whether the name is written beside the mark.
 *
 * <p>One line, because it is one decision and it depends on the logo file. A
 * square mark needs the word next to it; a wide logo that already contains
 * "Balaaca" would say it twice. Set this to false in that case.
 */
const MARK_CARRIES_THE_NAME = false;

/**
 * The logo, as a file.
 *
 * <p>An <img> and not inline SVG, deliberately: the mark is a brand decision
 * and brand decisions should not live in a component. public/brand/logo.svg is
 * replaced and nothing here changes - no build step, no import, no code review
 * of a path drawn by hand.
 *
 * <p>Two files, because there are two grounds. The dashboard sidebar and a
 * provider's cover are dark green, and a mark drawn for ivory disappears on
 * them. If one file works on both, make them the same file.
 */
export function Mark({ size = 24, tone }: { size?: number; tone?: "inverse" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="wordmark__glyph"
      src={tone === "inverse" ? "/brand/logo-inverse.png" : "/brand/logo.png"}
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
    />
  );
}

export function Wordmark({
  href = "/",
  size = 26,
  tone,
  hideText,
}: {
  href?: string;
  size?: number;
  tone?: "inverse";
  hideText?: boolean;
}) {
  return (
    <Link className="wordmark" href={href} aria-label="Balaaca, accueil">
      <Mark size={size} tone={tone} />
      {hideText || MARK_CARRIES_THE_NAME ? null : <span>Balaaca</span>}
    </Link>
  );
}

/* --- Button -------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "danger" | "quiet-danger";

type ButtonBase = {
  label: string;
  variant?: ButtonVariant;
  size?: "sm" | "lg";
  block?: boolean;
  icon?: string;
  iconEnd?: string;
  className?: string;
};

/**
 * A link when it goes somewhere, a button when it does something.
 *
 * <p>Never the other way round, and never a div: a link opens in a new tab on
 * a long press, a button submits a form, and a person navigating with a
 * keyboard is told which one they are on. Whether it is a link is decided by
 * whether `href` is present, so it cannot be got wrong at a call site.
 */
export function Button({
  href,
  ...o
}: ButtonBase & { href: string } & Omit<ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link href={href} className={buttonClass(o)}>
      <ButtonInner {...o} />
    </Link>
  );
}

export function ActionButton({
  type = "button",
  disabled,
  name,
  value,
  ...o
}: ButtonBase & {
  type?: "button" | "submit";
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  return (
    <button type={type} className={buttonClass(o)} disabled={disabled} name={name} value={value}>
      <ButtonInner {...o} />
    </button>
  );
}

function buttonClass(o: ButtonBase): string {
  const cls = ["btn", `btn--${o.variant ?? "primary"}`];
  if (o.size) cls.push(`btn--${o.size}`);
  if (o.block) cls.push("btn--block");
  if (o.className) cls.push(o.className);
  return cls.join(" ");
}

function ButtonInner({ label, icon, iconEnd, size }: ButtonBase) {
  const s = size === "sm" ? 16 : 18;
  return (
    <>
      {icon ? <Icon name={icon} size={s} /> : null}
      <span>{label}</span>
      {iconEnd ? <Icon name={iconEnd} size={s} /> : null}
    </>
  );
}

/* --- Badge, avatar, notice ----------------------------------------------- */

export type BadgeTone =
  | "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info" | "outline";

export function Badge({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: string;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {icon ? <Icon name={icon} size={13} /> : null}
      <span className="badge__text">{label}</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status];
  return s ? <Badge label={s.label} tone={s.tone} icon={s.icon} /> : <Badge label={status} />;
}

/**
 * The fallback when there is no photograph.
 *
 * <p>Not the default. A logo is what a provider uploads and what the directory
 * carries, and this stands in until they do - the mockup made it the only
 * option because it believed no image could be stored.
 */
export function Avatar({
  name,
  size,
  tone,
}: {
  name: string;
  size?: "sm" | "xl";
  tone?: "client";
}) {
  const cls = ["avatar"];
  if (size) cls.push(`avatar--${size}`);
  if (tone) cls.push(`avatar--${tone}`);
  return (
    <span className={cls.join(" ")} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Two letters: the first of the first two words, or the first two letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
  }
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

export function Notice({
  tone = "info",
  title,
  children,
  icon,
}: {
  tone?: "info" | "success" | "warning" | "danger" | "neutral";
  title?: string;
  children: ReactNode;
  icon?: string;
}) {
  const fallback =
    tone === "danger" ? "alert-circle"
      : tone === "warning" ? "alert-triangle"
        : tone === "success" ? "check-circle"
          : "info";
  return (
    // role=alert only for danger: a screen reader interrupts on alert, and a
    // note that interrupts is a note nobody wants twice.
    <div className={`notice notice--${tone}`} role={tone === "danger" ? "alert" : "note"}>
      <Icon name={icon ?? fallback} size={18} />
      <div className="grow">
        {title ? <strong className="notice__title">{title}</strong> : null}
        <span>{children}</span>
      </div>
    </div>
  );
}

/* --- Empty state --------------------------------------------------------- */

/**
 * Nothing to show, and what to do about it.
 *
 * <p>The action is the part that matters. An empty state with no way out is a
 * dead end, and the hub's own - "l'annuaire est vide" - was exactly that.
 */
export function EmptyState({
  title,
  body,
  sketch,
  action,
  compact,
}: {
  title: string;
  body?: string;
  sketch?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "state state--compact" : "state"}>
      {sketch ? (
        <span className="state__art">
          <Sketch name={sketch} level={1} width={132} />
        </span>
      ) : null}
      <h3 className="state__title">{title}</h3>
      {body ? <p className="state__body">{body}</p> : null}
      {action ? <div style={{ marginTop: "var(--space-2)" }}>{action}</div> : null}
    </div>
  );
}

/* --- Section head -------------------------------------------------------- */

/**
 * The rule-and-label that opens every section.
 *
 * <p>Two elements, and it has to be two: `.rule-accent` is a standalone bar of
 * 28 by 2 pixels, not a text modifier. Both classes on one element crush the
 * label into a two-pixel box it then overflows - which is what this component
 * did until someone reading it in a rendered page said so.
 *
 * <p>The label is a `<p>`, deliberately, not a heading. The mockup made each of
 * these an `<h2>` at 12 px beside the real title, which gave the hub fifteen
 * headings and no hierarchy at all.
 */
export function SectionHead({ label, aside }: { label: string; aside?: ReactNode }) {
  return (
    <div className="row row--between row-4 row--wrap">
      <div className="row row-3">
        <span className="rule-accent" aria-hidden="true" />
        <p className="t-label">{label}</p>
      </div>
      {aside ? <span className="t-caption t-dim tnum">{aside}</span> : null}
    </div>
  );
}
