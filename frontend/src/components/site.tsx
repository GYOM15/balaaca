import Link from "next/link";
import { Icon } from "./icon";
import { Button, Wordmark } from "./ui";

/**
 * The chrome around every public page.
 *
 * <p>Two audiences share one site, and the header is what tells them apart.
 * A customer is offered the door to the provider side; a provider is offered
 * the way back to the search. Neither is a menu: there is one link, and it
 * says who it is for.
 */
export function SiteHeader({ kind = "hub" }: { kind?: "hub" | "pro" }) {
  return (
    <header className="site-head">
      <Wordmark size={26} />
      <span className="grow" />
      {kind === "pro" ? (
        <>
          <Link className="site-head__switch site-head__switch--to-hub" href="/">
            <Icon name="search" size={15} />
            <span>Trouver un professionnel</span>
          </Link>
          <Button label="Inscrire mon activité" variant="primary" size="sm" href="/inscription" />
        </>
      ) : (
        <Link className="site-head__switch" href="/professionnels">
          <span>Vous êtes un professionnel&nbsp;?</span>
          <Icon name="arrow-right" size={15} />
        </Link>
      )}
    </header>
  );
}

export function SiteFooter({ kind = "hub" }: { kind?: "hub" | "pro" }) {
  return (
    <footer className="site-foot">
      <div className="container container--landing site-foot__cols">
        <div className="stack stack-4">
          <Wordmark size={26} />
          <p className="t-small t-muted" style={{ fontWeight: 400, maxWidth: "36ch" }}>
            Un annuaire de professionnels et un carnet de rendez-vous partagé. Le
            client réserve, le professionnel garde la main sur son agenda.
          </p>
          {kind === "pro" ? (
            <Link className="site-head__switch" style={{ paddingLeft: 0 }} href="/">
              <Icon name="search" size={15} />
              <span>Trouver un professionnel</span>
            </Link>
          ) : (
            <Link className="site-head__switch" style={{ paddingLeft: 0 }} href="/professionnels">
              <span>Vous êtes un professionnel&nbsp;?</span>
              <Icon name="arrow-right" size={15} />
            </Link>
          )}
        </div>
        <FooterColumn
          title="Balaaca"
          links={[
            ["Comment ça marche", "/professionnels/comment-ca-marche"],
            ["Tarifs", "/professionnels/tarifs"],
          ]}
        />
        <FooterColumn
          title="Informations"
          links={[["Rejoindre une équipe", "/rejoindre"]]}
        />
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <nav className="stack stack-2" aria-label={title}>
      {/* A real heading, unlike the mockup's, because a footer column IS a
          section of the page - and it is styled as a label either way. */}
      <h2 className="t-label">{title}</h2>
      {links.map(([label, href]) => (
        <Link key={href} href={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
