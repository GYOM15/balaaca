import Link from "next/link";
import { CurrentLink } from "./current-link";
import { Icon } from "./icon";
import { Mark } from "./ui";

/**
 * The chrome around every public page.
 *
 * <p>One header and one footer, drawn the same on every screen that has them.
 * The design draws no second variant: the page that sells the product to a
 * provider carries the same bar as the directory, down to the "Espace
 * professionnel" button on it. Nothing here branches on who is looking.
 *
 * <p>The booking flow, the sign-up and the dashboard use their own reduced bar
 * instead - a mark and one way out - and build it themselves, because what that
 * way out points at is the screen's own business.
 */

/**
 * The mark, as both the header and the footer draw it: the design system's
 * 34-pixel tile, with the real monogram inside it rather than a letter B. The
 * brand sheet forbids an approximation of the mark, and public/brand/ is the
 * one path any code names it by.
 */
function LogoWord() {
  return (
    <span className="logo__word">
      Bala<em>a</em>ca
    </span>
  );
}

export function SiteHeader({ kind = "hub" }: { kind?: "hub" | "pro" }) {
  return (
    <header className="hdr">
      <div className="page hdr__in">
        <Link className="logo" href="/">
          <Mark size={34} />
          <LogoWord />
        </Link>
        {/* Which entry is current is worked out from the address rather than
            passed down. Half the pages were forgetting to pass it, and a page
            that forgets is a navigation that says nothing about where you are
            - which is the complaint this whole pass started from. */}
        <nav className="hdr__nav" aria-label="Navigation principale">
          <CurrentLink className="hdr__link" href="/metiers">
            Métiers
          </CurrentLink>
          <CurrentLink className="hdr__link" href="/idees">
            Idées
          </CurrentLink>
          <CurrentLink className="hdr__link" href="/professionnels/comment-ca-marche">
            Comment ça marche
          </CurrentLink>
        </nav>
        <div className="hdr__actions">
          {kind === "pro" ? (
            <>
              <Link className="hdr__link hide-sm" href="/">
                Trouver un professionnel
              </Link>
              <Link className="btn btn--primary btn--sm" href="/inscription">
                <span className="btn__label--idle">Créer ma page</span>
              </Link>
            </>
          ) : (
            <>
              {/* Below 700 px the header keeps the professional door and drops
                  this one: a customer who has a booking has its link in their
                  messages, and the footer carries it on every page. */}
              <Link className="hdr__link" href="/bookings" style={{ display: "none" }} data-show-md>
                Ma réservation
              </Link>
              <Link className="btn btn--secondary btn--sm hide-sm" href="/professionnels">
                <span className="btn__label--idle">Espace professionnel</span>
              </Link>
              <Link
                className="hdr__link show-sm-only"
                href="/professionnels"
                style={{ fontSize: "var(--fs-xs)" }}
              >
                Espace pro
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter(_props: { kind?: "hub" | "pro" } = {}) {
  return (
    <footer className="foot">
      <div className="page">
        <div className="foot__grid">
          <div>
            {/* Not a link: the mark at the top of the same page already goes
                home, and the design draws this one as plain text. */}
            <div className="logo" style={{ color: "#fff" }}>
              <Mark size={34} />
              <LogoWord />
            </div>
            <p
              className="t-sm"
              style={{ color: "var(--text-on-dark-muted)", marginTop: "1rem", maxWidth: "34ch" }}
            >
              Trouver un professionnel près de chez soi, voir ce qu’il fait, et
              réserver. Sans compte, sans appel, sans négociation d’horaire.
            </p>
          </div>
          <FooterColumn
            title="Découvrir"
            links={[
              ["Tous les métiers", "/metiers"],
              ["Idées et occasions", "/idees"],
              ["Recherche", "/"],
              ["Par ville", "/lieux"],
            ]}
          />
          <FooterColumn
            title="Professionnels"
            links={[
              ["Pourquoi Balaaca", "/professionnels"],
              ["Tarifs", "/professionnels/tarifs"],
              ["Créer ma page", "/inscription"],
              ["Rejoindre une équipe", "/rejoindre"],
            ]}
          />
          <FooterColumn
            title="Aide"
            links={[
              ["Comment ça marche", "/professionnels/comment-ca-marche"],
              ["Retrouver ma réservation", "/bookings"],
              ["Confidentialité", "/confidentialite"],
              ["Conditions", "/conditions"],
            ]}
          />
        </div>
        <div className="foot__bottom">
          <span>© 2026 Balaaca</span>
          <span>Conakry, Guinée, et bientôt ailleurs</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="foot__title">{title}</div>
      <div className="foot__list">
        {links.map(([label, href]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Which of the four the reader is standing on, so it can be announced. */
export type TabBarTab = "accueil" | "metiers" | "recherche" | "reservation";

/**
 * The bar under a thumb, on every public screen.
 *
 * <p>It was fifteen copies of one navigation in four slightly different
 * versions, which differed only in which entry claimed aria-current - and the
 * home page, which reserves its height with `has-tabbar`, drew no bar at all,
 * so a phone got a strip of empty page where the bar should be.
 *
 * <p>Accueil and Rechercher both point at "/", and that is not a mistake: the
 * design has a hub and a search screen, this product serves both from one
 * route, and the two entries say which of the two the reader is asking for.
 */
export function TabBar({ active }: { active?: TabBarTab }) {
  const on = (tab: TabBarTab) => (active === tab ? "page" : undefined);
  return (
    <nav className="tabbar" aria-label="Navigation mobile">
      <Link className="tabbar__item" href="/" aria-current={on("accueil")}>
        <Icon name="home" />
        <span>Accueil</span>
      </Link>
      <Link className="tabbar__item" href="/metiers" aria-current={on("metiers")}>
        <Icon name="grid" />
        <span>Métiers</span>
      </Link>
      <Link className="tabbar__item" href="/" aria-current={on("recherche")}>
        <Icon name="search" />
        <span>Rechercher</span>
      </Link>
      <Link className="tabbar__item" href="/bookings" aria-current={on("reservation")}>
        <Icon name="calendar-check" />
        <span>Réservation</span>
      </Link>
    </nav>
  );
}
