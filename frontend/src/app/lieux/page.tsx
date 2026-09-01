import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { publicApi } from "@/lib/api";
import { groupLocalities } from "@/lib/localities";
import type { LocalityList } from "@/lib/types";

/** The published map is stable, but it is read live like everything else here. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chercher par lieu",
  description:
    "Les huit régions de Guinée, leurs préfectures et les communes de Conakry, chacune menant à l’annuaire filtré.",
};

export default async function Places() {
  const localities = await publicApi<LocalityList>("/v1/localities");
  const regions = groupLocalities(localities.data);

  return (
    <>
      <header className="hdr">
        <div className="page hdr__in">
          <Link className="logo" href="/">
            <span className="logo__mark" aria-hidden="true">
              B
            </span>
            <span className="logo__word">
              Bala<em>a</em>ca
            </span>
          </Link>
          <nav className="hdr__nav" aria-label="Navigation principale">
            <Link className="hdr__link" href="/metiers">
              Métiers
            </Link>
            <Link className="hdr__link" href="/idees">
              Idées
            </Link>
            <Link className="hdr__link" href="/professionnels/comment-ca-marche">
              Comment ça marche
            </Link>
          </nav>
          <div className="hdr__actions">
            <Link className="hdr__link" href="/bookings" style={{ display: "none" }} data-show-md="">
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
          </div>
        </div>
      </header>

      <main id="contenu" className="has-tabbar">
        <section className="section atmo tex-dots">
          <svg className="wm wm--tr" viewBox="0 0 24 24" aria-hidden="true">
            <use href="#i-globe" />
          </svg>
          <div className="page">
            <nav className="crumbs" aria-label="Fil d’Ariane">
              <Link href="/">Accueil</Link>
              <Icon name="chevron-right" />
              <span aria-current="page">Lieux</span>
            </nav>
            <div style={{ marginTop: "var(--s-4)", maxWidth: "54ch" }}>
              <h1 className="t-h1">Chercher par lieu</h1>
              <p className="t-lead" style={{ marginTop: "var(--s-3)" }}>
                Choisir une région retient tout ce qui est classé dessous&nbsp;: demander
                «&nbsp;Conakry&nbsp;» trouve aussi un professionnel enregistré à Ratoma.
              </p>
            </div>

            {regions.length === 0 ? (
              <p className="t-sm" style={{ marginTop: "var(--s-10)", textAlign: "center" }}>
                Aucun lieu n’est publié pour le moment.
              </p>
            ) : (
              regions.map(({ region, children }) => (
                <div key={region.slug} style={{ marginTop: "var(--s-10)" }}>
                  <div
                    className="row row--between"
                    style={{
                      marginBottom: "var(--s-4)",
                      borderBottom: "1px solid var(--border)",
                      paddingBottom: "var(--s-3)",
                    }}
                  >
                    <h2 className="t-h4">{region.label_fr}</h2>
                    <Link className="link-action" href={directory(region.slug)}>
                      Tout {region.label_fr} <Icon name="arrow-right" size={18} className="ico--arrow" />
                    </Link>
                  </div>
                  {children.length === 0 ? (
                    <p className="t-xs">
                      Aucune subdivision publiée&nbsp;: cherchez dans toute la région.
                    </p>
                  ) : (
                    <div className="row row--wrap" style={{ gap: "var(--s-2)" }} data-reveal="fade">
                      {children.map((l) => (
                        <Link key={l.slug} className="chip" href={directory(l.slug)}>
                          <Icon name="pin" size={16} /> {l.label_fr}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
      <TabBar />
    </>
  );
}

/** The directory, filtered on one place. The API walks the tree downwards itself. */
function directory(slug: string): string {
  return `/?locality=${encodeURIComponent(slug)}`;
}

/**
 * The mockup's chrome, written here rather than imported.
 *
 * <p>`components/site.tsx` still emits the previous system's class names, and
 * none of them survives in `globals.css`. Once it carries `.hdr` and `.foot`,
 * this and the header above are one import.
 */
function SiteFooter() {
  return (
    <footer className="foot">
      <div className="page">
        <div className="foot__grid">
          <div>
            <div className="logo" style={{ color: "#fff" }}>
              <span className="logo__mark" aria-hidden="true">
                B
              </span>
              <span className="logo__word">
                Bala<em>a</em>ca
              </span>
            </div>
            <p
              className="t-sm"
              style={{
                color: "var(--text-on-dark-muted)",
                marginTop: "1rem",
                maxWidth: "34ch",
              }}
            >
              Trouver un professionnel près de chez soi, voir ce qu’il fait, et réserver. Sans
              compte, sans appel, sans négociation d’horaire.
            </p>
          </div>
          <div>
            <div className="foot__title">Découvrir</div>
            <div className="foot__list">
              <Link href="/metiers">Tous les métiers</Link>
              <Link href="/idees">Idées et occasions</Link>
              <Link href="/">Recherche</Link>
              <Link href="/lieux">Par ville</Link>
            </div>
          </div>
          <div>
            <div className="foot__title">Professionnels</div>
            <div className="foot__list">
              <Link href="/professionnels">Pourquoi Balaaca</Link>
              <Link href="/professionnels/tarifs">Tarifs</Link>
              <Link href="/inscription">Créer ma page</Link>
              <Link href="/rejoindre">Rejoindre une équipe</Link>
            </div>
          </div>
          <div>
            <div className="foot__title">Aide</div>
            <div className="foot__list">
              <Link href="/professionnels/comment-ca-marche">Comment ça marche</Link>
              <Link href="/bookings">Retrouver ma réservation</Link>
            </div>
          </div>
        </div>
        <div className="foot__bottom">
          <span>© 2026 Balaaca</span>
          <span>Conakry, Guinée, et bientôt ailleurs</span>
        </div>
      </div>
    </footer>
  );
}

function TabBar() {
  return (
    <nav className="tabbar" aria-label="Navigation mobile">
      <Link className="tabbar__item" href="/">
        <Icon name="home" />
        <span>Accueil</span>
      </Link>
      <Link className="tabbar__item" href="/metiers">
        <Icon name="grid" />
        <span>Métiers</span>
      </Link>
      <Link className="tabbar__item" href="/">
        <Icon name="search" />
        <span>Rechercher</span>
      </Link>
      <Link className="tabbar__item" href="/bookings">
        <Icon name="calendar-check" />
        <span>Réservation</span>
      </Link>
    </nav>
  );
}
