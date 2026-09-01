import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { ActionButton, EmptyState, Wordmark, initials } from "@/components/ui";
import { ApiError, api, isSignedIn } from "@/lib/api";
import type { AppointmentPage, CurrentMember, ProviderProfile } from "@/lib/types";

/** A diary. Cached, it would be stale before it was drawn. */
export const dynamic = "force-dynamic";

type Entry = {
  href: string;
  icon: string;
  label: string;
  /** Hidden from an employee. The server refuses these anyway - see below. */
  ownerOnly?: boolean;
};

type Group = { title: string; entries: Entry[] };

/**
 * Every room behind the sign-in, grouped and in the order a provider needs it.
 *
 * <p>The grouping is the design's own: the day first, then the shop a customer
 * sees, then the people, then the platform. Six links in a flat list said
 * nothing about what belonged to what, so every screen felt like a sibling of
 * every other one and nobody could say where they were.
 *
 * <p>The design splits the first group in two - an overview at /dashboard and a
 * diary at /dashboard/schedule. They are one screen here, so they are one
 * entry: two rows pointing at one URL would be a navigation that cannot say
 * where you are.
 */
const GROUPS: Group[] = [
  {
    title: "Activité",
    entries: [{ href: "/dashboard", icon: "calendar", label: "Agenda" }],
  },
  {
    title: "Mon établissement",
    entries: [
      { href: "/dashboard/services", icon: "tag", label: "Prestations", ownerOnly: true },
      { href: "/dashboard/hours", icon: "clock", label: "Horaires" },
      { href: "/dashboard/profile", icon: "store", label: "Ma page", ownerOnly: true },
    ],
  },
  {
    title: "Clients",
    entries: [
      { href: "/dashboard/customers", icon: "users", label: "Clientèle" },
      { href: "/dashboard/team", icon: "user-plus", label: "Équipe", ownerOnly: true },
    ],
  },
  {
    title: "Configuration",
    entries: [
      {
        href: "/dashboard/reglages",
        icon: "sliders",
        label: "Règles de réservation",
        ownerOnly: true,
      },
      { href: "/dashboard/compte", icon: "user", label: "Mon compte" },
    ],
  },
];

/**
 * The suspension room, which the design puts in the navigation only while the
 * business is suspended.
 *
 * <p>It is here whatever the state, because a screen nothing links to is a
 * screen that does not exist - a business whose page vanished used to reach the
 * one page that explains why by typing the address. Suspended, it is the only
 * thing that matters and it goes first, exactly as the design draws it.
 *
 * <p>Owner only, because the platform only reads the owner's answer.
 */
const APPEAL: Entry = {
  href: "/dashboard/contestation",
  icon: "shield-alert",
  label: "Contestation",
  ownerOnly: true,
};

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
 * green from 1000 px up, a five-slot bar at the bottom of a telephone, and the
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
        <main className="page page--narrow section" id="contenu">
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

  const owner = me.role === "OWNER";
  const suspended = provider.status === "SUSPENDED";
  const waiting = await pendingCount();

  // Hidden for an employee because the server refuses them anyway. The check is
  // on the server; this only stops the refusal being the first they hear of it.
  const rooms = GROUPS.map((group) => ({
    title: group.title,
    entries: group.entries.filter((entry) => !entry.ownerOnly || owner),
  })).filter((group) => group.entries.length > 0);

  const appeal = APPEAL.ownerOnly && !owner ? [] : [APPEAL];
  const navigation: Group[] = [
    ...(suspended && appeal.length > 0 ? [{ title: "Suspension", entries: appeal }] : []),
    ...rooms,
    ...(!suspended && appeal.length > 0 ? [{ title: "Plateforme", entries: appeal }] : []),
  ];

  const bottom = navigation.flatMap((group) => group.entries).slice(0, BOTTOM_SLOTS);

  return (
    <>
      <div className="app">
        <aside className="side">
          <div className="side__brand">
            {/* The real monogram, not the mockup's letter tile: the brand sheet
                forbids an approximation of the mark. */}
            <Wordmark href="/dashboard" size={26} tone="inverse" />
          </div>

          <BusinessCard provider={provider} owner={owner} suspended={suspended} />

          {navigation.map((group) => (
            <div className="side__group" key={group.title}>
              <div className="side__group-title">{group.title}</div>
              {group.entries.map((entry) => (
                <Link className="side__link" href={entry.href} key={entry.href}>
                  <Icon name={entry.icon} size={18} />
                  <span className="grow">{entry.label}</span>
                  {/* The design carries this figure on the diary from every
                      screen, and it is the one number that has to travel: a
                      request nobody answered is not a thing to discover by
                      opening the agenda on the off chance. */}
                  {entry.href === "/dashboard" && waiting ? (
                    <span className="count">{waiting}</span>
                  ) : null}
                </Link>
              ))}
            </div>
          ))}

          <div className="side__foot">
            <Link className="side__link" href={`/p/${provider.slug}`}>
              <Icon name="external" size={18} />
              <span className="grow">Voir ma page publique</span>
            </Link>
            {/* Styled as a nav row rather than as a button: it sits on the dark
                green, where a light-surface button would be the only thing on
                the panel that does not belong to it. POST, because a sign-out
                on GET is triggered by any image tag anywhere. */}
            <form method="post" action="/api/auth/logout">
              <button type="submit" className="side__link" style={{ width: "100%" }}>
                <Icon name="logout" size={18} />
                <span className="grow">Déconnexion</span>
              </button>
            </form>
          </div>
        </aside>

        <div>
          {children}

          {/* The bar's last slot lands here. The design gives this list its own
              route; a sheet would be the nicer gesture and would cost a script.
              This is the same list, addressable, and it works on the first
              paint. */}
          <nav className="app__main has-tabbar hide-lg" id="sections" aria-label="Toutes les sections">
            <div className="app__inner">
              <div className="stack" style={{ "--stack-gap": "var(--s-6)" } as React.CSSProperties}>
                {navigation.map((group) => (
                  <div key={group.title}>
                    <div className="t-overline" style={{ marginBottom: "var(--s-3)" }}>
                      {group.title}
                    </div>
                    <div className="panel">
                      <div className="list" style={{ borderTop: 0 }}>
                        {group.entries.map((entry) => (
                          <Link
                            className="list__item list__item--link"
                            href={entry.href}
                            key={entry.href}
                          >
                            <span className="choice__icon" style={{ width: 34, height: 34 }}>
                              <Icon name={entry.icon} size={18} />
                            </span>
                            <span className="grow t-sm t-strong">{entry.label}</span>
                            {entry.href === "/dashboard" && waiting ? (
                              <span className="count">{waiting}</span>
                            ) : null}
                            <Icon name="chevron-right" size={18} />
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                <div>
                  <div className="t-overline" style={{ marginBottom: "var(--s-3)" }}>
                    Ma page publique
                  </div>
                  <div className="panel">
                    <div className="list" style={{ borderTop: 0 }}>
                      <Link className="list__item list__item--link" href={`/p/${provider.slug}`}>
                        <span className="choice__icon" style={{ width: 34, height: 34 }}>
                          <Icon name="external" size={18} />
                        </span>
                        <span className="grow t-sm t-strong">Voir ma page</span>
                        <Icon name="chevron-right" size={18} />
                      </Link>
                      <form method="post" action="/api/auth/logout">
                        <button
                          type="submit"
                          className="list__item list__item--link"
                          style={{ width: "100%" }}
                        >
                          <span className="choice__icon" style={{ width: 34, height: 34 }}>
                            <Icon name="logout" size={18} />
                          </span>
                          <span className="grow t-sm t-strong">Déconnexion</span>
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </nav>
        </div>
      </div>

      <nav className="apptabs" aria-label="Navigation prestataire">
        {bottom.map((entry) => (
          <Link className="apptabs__item" href={entry.href} key={entry.href}>
            <Icon name={entry.icon} />
            <span>{entry.label}</span>
          </Link>
        ))}
        <a className="apptabs__item" href="#sections">
          <Icon name="more-h" />
          <span>Plus</span>
        </a>
      </nav>
    </>
  );
}

/**
 * How many requests are waiting on an answer, for the badge on the diary.
 *
 * <p>Its own call rather than a number handed down from the page: the shell is
 * drawn on every screen and the figure has to be right on all of them. A
 * refusal here costs the badge and nothing else - the navigation is not the
 * place to fail a whole dashboard.
 */
async function pendingCount(): Promise<number> {
  try {
    const page = await api<AppointmentPage>("/v1/appointments", {
      query: { status: "PENDING", limit: 200 },
    });
    return page.data.length;
  } catch {
    return 0;
  }
}

/**
 * Which salon this is, and whether anybody can find it.
 *
 * <p>A link only for an owner: it opens the page editor, which the server
 * refuses to an employee. The state line is the only place in the shell that
 * says a page is unpublished or suspended, and it is on every screen because
 * either one is true until somebody acts on it.
 */
function BusinessCard({
  provider,
  owner,
  suspended,
}: {
  provider: ProviderProfile;
  owner: boolean;
  suspended: boolean;
}) {
  const inside = (
    <>
      <span
        className="avatar avatar--sm"
        style={{ background: "rgba(255,255,255,.14)", color: "#fff", borderColor: "transparent" }}
        aria-hidden="true"
      >
        {initials(provider.business_name)}
      </span>
      <span className="grow">
        <span className="side__biz-name">{provider.business_name}</span>
        <span className="side__biz-state">
          {suspended ? (
            <span style={{ color: "#F0A9A2" }}>
              <Icon name="shield-alert" size={16} /> Suspendu
            </span>
          ) : (
            <>
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  // The design draws a live page and a suspended one. A page
                  // that was never published is neither, and it is the state a
                  // new business is in for its whole first hour.
                  background: provider.published ? "#7FD3A5" : "rgba(255,255,255,.4)",
                  display: "inline-block",
                }}
              />
              {provider.published
                ? ` En ligne · /p/${provider.slug}`
                : " Hors ligne · personne ne vous trouve"}
            </>
          )}
        </span>
      </span>
      {owner ? <Icon name="chevron-right" size={18} /> : null}
    </>
  );

  return owner ? (
    <Link className="side__biz" href="/dashboard/profile" style={{ textDecoration: "none" }}>
      {inside}
    </Link>
  ) : (
    <div className="side__biz">{inside}</div>
  );
}

/** POST, because a sign-out on GET is triggered by any image tag anywhere. */
function SignOut() {
  return (
    <form method="post" action="/api/auth/logout">
      <ActionButton label="Déconnexion" variant="secondary" size="sm" type="submit" icon="logout" />
    </form>
  );
}
