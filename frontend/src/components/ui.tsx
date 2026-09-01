import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, Scene } from "./icon";

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
 * <p>Word, glyph and tone are the design system's own, from its gallery of
 * appointment statuses - the green of the brand never means "success", so each
 * state carries a glyph and a word and never the colour alone.
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
  PENDING: { label: "À confirmer", icon: "hourglass", tone: "warning" },
  CONFIRMED: { label: "Confirmé", icon: "check-circle", tone: "brand" },
  COMPLETED: { label: "Terminé", icon: "check", tone: "success" },
  NO_SHOW: { label: "Absent", icon: "ban", tone: "danger" },
  CANCELLED: { label: "Annulé", icon: "x-circle", tone: "neutral" },
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
 *
 * <p>It wears `logo__mark`, the class the design system sizes and rounds - the
 * design draws a letter B in that tile because it had no mark to put there.
 * The tile is 34 pixels whatever `size` says; the attribute is there so the
 * line does not jump before the stylesheet arrives.
 */
export function Mark({
  size = 24,
  tone,
  className = "logo__mark",
}: {
  size?: number;
  tone?: "inverse";
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
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
  const wordless = hideText || MARK_CARRIES_THE_NAME;
  return (
    <Link
      className="logo"
      href={href}
      // Only when the word is hidden. With it, the link already says
      // "Balaaca"; a label on top would replace what a reader can see with a
      // sentence they cannot.
      aria-label={wordless ? "Balaaca, accueil" : undefined}
      style={tone === "inverse" ? { color: "#fff" } : undefined}
    >
      <Mark size={size} tone={tone} />
      {wordless ? null : (
        <span className="logo__word">
          Bala<em>a</em>ca
        </span>
      )}
    </Link>
  );
}

/* --- Button -------------------------------------------------------------- */

type ButtonVariant =
  | "primary" | "secondary" | "ghost" | "accent" | "inverse" | "danger" | "danger-quiet";

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

/**
 * The three slots the design gives a button, and their exact shapes.
 *
 * <p>The leading glyph is wrapped, because `btn__icon--idle` is what the busy
 * and done states hide and the stylesheet declares no display for it - the
 * design carries `display:inline-flex` inline, so the wrapper is the element
 * that disappears rather than the glyph inside it.
 *
 * <p>The trailing glyph is bare and wears `ico--arrow`: it is the one that
 * slides on hover, and it is never hidden - a button that has gone busy still
 * points where it was going.
 *
 * <p>Both are 18 pixels whatever the button's size, as every one of them is in
 * the design.
 */
function ButtonInner({ label, icon, iconEnd }: ButtonBase) {
  return (
    <>
      {icon ? (
        <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
          <Icon name={icon} size={18} />
        </span>
      ) : null}
      <span className="btn__label--idle">{label}</span>
      {iconEnd ? <Icon name={iconEnd} size={18} className="ico--arrow" /> : null}
    </>
  );
}

/* --- Badge, avatar, notice ----------------------------------------------- */

export type BadgeTone =
  | "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

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
    // The word is the badge's own text, not a box inside it: the design lays
    // the glyph and the word out as flex children of the pill itself, and a
    // wrapper round the word would take the gap with it.
    <span className={`badge badge--${tone}`}>
      {icon ? <Icon name={icon} /> : null}
      {label}
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
}: {
  name: string;
  size?: "sm" | "lg" | "xl";
  /**
   * Accepted and ignored. The dashboard used to tint a customer's initials
   * differently from a colleague's; the design system draws one avatar, and a
   * second colour that means nothing to anyone who has not been told is not
   * worth the class.
   */
  tone?: "client";
}) {
  return (
    <span className={size ? `avatar avatar--${size}` : "avatar"} aria-hidden="true">
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

/**
 * A sentence the page needs the reader to take in before they act.
 *
 * <p>`danger` is the only tone that interrupts. A screen reader stops what it
 * is saying for `role="alert"`, and a note that interrupts is a note nobody
 * wants twice.
 */
export function Notice({
  tone = "info",
  title,
  children,
  icon,
  actions,
  errorCode,
}: {
  tone?: "info" | "success" | "warning" | "danger" | "neutral";
  title?: string;
  children?: ReactNode;
  icon?: string;
  actions?: ReactNode;
  /**
   * The published code this note is the translation of, when it is one. The
   * design stamps it on the note it belongs to so that the sentence a reader
   * gets and the code the server sent can be lined up without guessing which
   * of the fifteen produced it.
   */
  errorCode?: string;
}) {
  const fallback =
    tone === "danger" ? "alert-circle"
      : tone === "warning" ? "alert-triangle"
        : tone === "success" ? "check-circle"
          : "info";
  return (
    <div
      className={`alert alert--${tone}`}
      role={tone === "danger" ? "alert" : "status"}
      data-error-code={errorCode}
    >
      <span className="alert__icon">
        <Icon name={icon ?? fallback} />
      </span>
      <div className="grow">
        {title ? <div className="alert__title">{title}</div> : null}
        {children ? <div className="alert__body">{children}</div> : null}
        {actions ? <div className="alert__actions">{actions}</div> : null}
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
  body?: ReactNode;
  sketch?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "empty empty--tight" : "empty"}>
      {/* Sized by its class alone. The stylesheet caps a scene at 220 px and a
          tight one at 148, and a width written here would beat both. */}
      {sketch ? (
        <Scene name={sketch} className={compact ? "scene-ill scene-ill--sm" : "scene-ill"} />
      ) : null}
      {/* A div and not a heading: an empty state can appear inside a section
          that already has one, and two headings for one thing is worse than
          none. */}
      <div className="empty__title">{title}</div>
      {body ? <p className="empty__body">{body}</p> : null}
      {action ? <div className="empty__actions">{action}</div> : null}
    </div>
  );
}

/* --- Section head -------------------------------------------------------- */

/**
 * The overline that opens a section, and whatever sits opposite it.
 *
 * <p>The design's own two-part head: the text hugs 46 characters on the left,
 * the aside - a link to the full list, a filter, a count - sits at its baseline
 * on the right and drops under it below 700 px. A section that also needs a
 * title and a sentence writes them into the same box itself; this is the one
 * shape that is always there.
 */
export function SectionHead({ label, aside }: { label: string; aside?: ReactNode }) {
  return (
    <div className="section-head">
      <div className="section-head__text">
        {/* A <p> and not a heading, deliberately: the mockup made each of these
            an <h2> at 12 px beside the real title, which gave the hub fifteen
            headings and no hierarchy at all. */}
        <p className="t-overline t-overline--accent">{label}</p>
      </div>
      {aside}
    </div>
  );
}
