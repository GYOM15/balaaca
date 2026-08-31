import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { ActionButton, Avatar, Badge, EmptyState, Wordmark } from "@/components/ui";
import { ApiError, api, isSignedIn } from "@/lib/api";
import type { CurrentMember, ProviderProfile } from "@/lib/types";

/** A diary. Cached, it would be stale before it was drawn. */
export const dynamic = "force-dynamic";

type Section = {
  href: string;
  icon: string;
  label: string;
  /** Hidden from an employee. The server refuses these anyway - see below. */
  ownerOnly?: boolean;
};

/**
 * Every room behind the sign-in, in the order a provider needs them.
 *
 * <p>The diary is first because it is why the dashboard is opened. It is also
 * the root: there is no separate "accueil" above it, and two entries pointing
 * at one URL would be a navigation that cannot say where you are.
 */
const SECTIONS: Section[] = [
  { href: "/dashboard", icon: "calendar", label: "Agenda" },
  { href: "/dashboard/hours", icon: "clock", label: "Horaires" },
  { href: "/dashboard/services", icon: "briefcase", label: "Prestations", ownerOnly: true },
  { href: "/dashboard/profile", icon: "store", label: "Ma page", ownerOnly: true },
  { href: "/dashboard/customers", icon: "message", label: "Clientèle" },
  { href: "/dashboard/team", icon: "users", label: "Équipe", ownerOnly: true },
];

/** How many fit under a thumb before the bar stops being tappable. */
const BOTTOM_SLOTS = 4;

/**
 * Everything behind a sign-in, and the two navigations it is reached by.
 *
 * <p>The guard is here rather than on each page: a page added without one is
 * the kind of omission nobody notices until it is public, and there is no
 * legitimate page under /dashboard that a stranger may read.
 *
 * <p>It is not the only guard. The API refuses every one of these calls without
 * a token, and refuses again on the caller's row in the database - this only
 * decides whether to render a sign-in link or a dashboard.
 *
 * <p>Two navigations rather than one shrunk. A sidebar on the brand's dark
 * green from 1024 px up, a five-slot bar at the bottom of a telephone, and the
 * rest of the rooms in a list the bar's last slot jumps to. A 45 px sidebar is
 * neither readable nor tappable, so below that width there is not one.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isSignedIn())) redirect("/api/auth/login?next=/dashboard");

  let me: CurrentMember;
  let provider: ProviderProfile;
  try {
    [me, provider] = await Promise.all([
      api<CurrentMember>("/v1/me"),
      api<ProviderProfile>("/v1/provider-profile"),
    ]);
  } catch (error) {
    // A verified token whose subject belongs to no active business. They have
    // an account and not a salon, which is a different thing from being signed
    // out - so they are told, rather than bounced back to a sign-in that would
    // succeed and land them here again.
    if (error instanceof ApiError && error.status === 403) {
      return (
        <main className="container container--booking section">
          <EmptyState
            sketch="storefront"
            title="Aucune activité rattachée à ce compte"
            body="Votre compte existe, mais il n’est rattaché à aucune activité. Si un collègue vous a invité, ouvrez le lien qu’il vous a envoyé."
            action={<SignOut />}
          />
        </main>
      );
    }
    throw error;
  }

  // Hidden for an employee because the server refuses them anyway. The check is
  // on the server; this only stops the refusal being the first they hear of it.
  const sections = SECTIONS.filter((s) => !s.ownerOnly || me.role === "OWNER");
  const bottom = sections.slice(0, BOTTOM_SLOTS);
  const role = me.role === "OWNER" ? "Propriétaire" : "Équipe";

  return (
    <>
      <div className="pro">
        <nav className="sidebar" aria-label="Navigation principale">
          <div style={{ padding: "var(--space-2) var(--space-3) var(--space-6)" }}>
            <Wordmark href="/dashboard" size={26} tone="inverse" />
          </div>

          <div className="sidenav">
            {sections.map((section) => (
              <Link key={section.href} className="sidenav__item" href={section.href}>
                <Icon name={section.icon} size={18} />
                <span>{section.label}</span>
              </Link>
            ))}
          </div>

          <div className="sidenav__group">
            <span
              className="t-caption"
              style={{
                color: "var(--ink-accent)",
                letterSpacing: "var(--ls-label)",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              {provider.business_name}
            </span>
          </div>

          <div className="sidenav">
            <Link className="sidenav__item" href={`/p/${provider.slug}`}>
              <Icon name="eye" size={18} />
              <span className="grow">Voir ma page publique</span>
              <Icon name="external" size={16} />
            </Link>
            {provider.published ? null : (
              <p
                className="t-caption"
                style={{ color: "var(--ink-fg-muted)", padding: "0 var(--space-3) var(--space-2)" }}
              >
                Votre page n’est pas encore publiée&nbsp;: personne ne peut la trouver.
              </p>
            )}
          </div>

          <div className="sidebar__foot">
            <div
              className="row row-3"
              style={{ padding: "var(--space-2) var(--space-3)", minWidth: 0 }}
            >
              <Avatar name={me.display_name} size="sm" />
              <span className="grow" style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {me.display_name}
                </span>
                <span
                  className="t-caption"
                  style={{ color: "var(--ink-fg-muted)", display: "block" }}
                >
                  {role}
                </span>
              </span>
            </div>
            {/* Styled as a nav row rather than as a button: it sits on the dark
                green, where a light-surface button would be the only thing on
                the panel that does not belong to it. */}
            <form method="post" action="/api/auth/logout">
              <button type="submit" className="sidenav__item" style={{ width: "100%" }}>
                <Icon name="lock" size={18} />
                <span>Se déconnecter</span>
              </button>
            </form>
          </div>
        </nav>

        <div className="pro__main">
          <header className="topbar to-lg">
            <Wordmark href="/dashboard" size={24} hideText />
            <span className="grow" style={{ minWidth: 0 }}>
              <span
                className="t-small"
                style={{
                  fontWeight: "var(--weight-semibold)",
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {provider.business_name}
              </span>
              <span className="t-caption t-dim" style={{ display: "block" }}>
                {me.display_name}
              </span>
            </span>
            {provider.published ? null : <Badge label="Non publiée" tone="warning" icon="eye-off" />}
          </header>

          {children}

          {/* The bar's last slot lands here. A sheet would be the nicer gesture
              and would cost a script; this is the same list, addressable, and it
              works on the first paint. */}
          <section
            className="pro-body to-lg stack stack-4"
            id="sections"
            aria-labelledby="sections-title"
            style={{ paddingTop: "var(--space-10)" }}
          >
            <p className="t-label rule-accent" id="sections-title">
              Toutes les sections
            </p>
            <ul className="list list--boxed">
              {sections.map((section) => (
                <li key={section.href}>
                  <Link className="list-row" href={section.href}>
                    <span style={{ color: "var(--text-tertiary)", flex: "none" }}>
                      <Icon name={section.icon} size={20} />
                    </span>
                    <span className="grow t-small">{section.label}</span>
                    <Icon name="chevron-right" size={16} />
                  </Link>
                </li>
              ))}
              <li>
                <Link className="list-row" href={`/p/${provider.slug}`}>
                  <span style={{ color: "var(--text-tertiary)", flex: "none" }}>
                    <Icon name="eye" size={20} />
                  </span>
                  <span className="grow t-small">Voir ma page publique</span>
                  <Icon name="external" size={16} />
                </Link>
              </li>
            </ul>
            <div className="row row--between row-3 row--wrap">
              <span className="t-caption t-dim">
                {me.display_name} — {role} chez {provider.business_name}
              </span>
              <SignOut />
            </div>
          </section>
        </div>
      </div>

      <nav className="bottomnav to-lg" aria-label="Navigation">
        {bottom.map((section) => (
          <Link key={section.href} className="bottomnav__item" href={section.href}>
            <Icon name={section.icon} size={21} />
            <span>{section.label}</span>
          </Link>
        ))}
        <Link className="bottomnav__item" href="#sections">
          <Icon name="menu" size={21} />
          <span>Plus</span>
        </Link>
      </nav>
    </>
  );
}

/** POST, because a sign-out on GET is triggered by any image tag anywhere. */
function SignOut() {
  return (
    <form method="post" action="/api/auth/logout">
      <ActionButton label="Se déconnecter" variant="secondary" size="sm" type="submit" icon="lock" />
    </form>
  );
}
