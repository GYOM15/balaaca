import Link from "next/link";
import { Mark } from "./ui";

/**
 * The chrome around every public page.
 *
 * <p>Two audiences share one site, and the header is what tells them apart: a
 * customer gets the ways into the directory, a provider gets the one door to
 * their own side. The `kind` says which of the two is standing there, and the
 * only thing it changes is that door - a provider already inside does not need
 * to be sold the idea again.
 */

/** The mark and the name, as the header and the footer draw them. */
function Logo({ tone }: { tone?: "inverse" }) {
  return (
    <Link className="logo" href="/" aria-label="Balaaca, accueil">
      {/* The real monogram, not the mockup's letter tile: the brand sheet
          forbids an approximation of the mark, and public/brand/ is the one
          path any code names it by. */}
      <Mark size={34} tone={tone} />
      <span className="logo__word">
        Bala<em>a</em>ca
      </span>
    </Link>
  );
}

export function SiteHeader({
  kind = "hub",
  active,
}: {
  kind?: "hub" | "pro";
  /** The nav entry this page IS, so it can be announced rather than guessed. */
  active?: "metiers" | "idees" | "comment-ca-marche";
}) {
  const current = (entry: string) => (active === entry ? "page" : undefined);
  return (
    <header className="hdr">
      <div className="page hdr__in">
        <Logo />
        <nav className="hdr__nav" aria-label="Navigation principale">
          <Link className="hdr__link" href="/metiers" aria-current={current("metiers")}>
            Métiers
          </Link>
          <Link className="hdr__link" href="/idees" aria-current={current("idees")}>
            Idées
          </Link>
          <Link
            className="hdr__link"
            href="/professionnels/comment-ca-marche"
            aria-current={current("comment-ca-marche")}
          >
            Comment ça marche
          </Link>
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

/**
 * The footer is the same for both audiences on purpose: it is the one place
 * where somebody who arrived on the wrong side of the site can cross over.
 * `kind` is accepted so a page need not know that, and changes nothing.
 */
export function SiteFooter(_props: { kind?: "hub" | "pro" } = {}) {
  return (
    <footer className="foot">
      <div className="page">
        <div className="foot__grid">
          <div>
            <Logo tone="inverse" />
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
    <nav aria-label={title}>
      {/* A real heading, unlike the mockup's div, because a footer column IS a
          section of the page - and it is styled as a label either way. */}
      <h2 className="foot__title">{title}</h2>
      <div className="foot__list">
        {links.map(([label, href]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
