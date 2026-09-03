import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon, TradeIcon } from "@/components/icon";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";

/**
 * The pitch, and the only page where Balaaca talks about Balaaca.
 *
 * <p>Static. It reads nothing, so there is no `force-dynamic` and no `api`
 * call: the deployment can serve it from the edge, which is what a provider on
 * a slow connection notices first.
 *
 * <p>The buttons are plain anchors carrying the mockup's own classes - the
 * `btn--inverse` variant and the `btn__label--idle` span - rather than
 * `ui.tsx`'s `Button`, whose `icon` prop puts the class on the glyph where the
 * design puts it on a wrapper.
 */
export const metadata: Metadata = {
  title: "Espace professionnel",
  description:
    "Vos clients réservent seuls, depuis un lien WhatsApp ou le QR code collé " +
    "sur votre porte. Vous ouvrez l’agenda le matin et vous savez qui vient.",
};

/** The three promises under the hero, each one already built. */
const HERO_PROOF: [string, string][] = [
  ["lock", "Aucune commission"],
  ["qr", "QR code à vie"],
  ["whatsapp", "Clients prévenus sur WhatsApp"],
];

const PROOF_STYLE = {
  gap: "var(--s-2)",
  color: "var(--text-on-dark-muted)",
  fontSize: "var(--fs-xs)",
  fontWeight: 600,
} as const;

const SHOPFRONT: [string, string][] = [
  [
    "Chaque prestation affiche son prix",
    "Fini les dix mêmes questions par jour sur WhatsApp.",
  ],
  [
    "Chaque prestation dit comment elle se passe",
    "Sur place, en dépôt avec un délai promis, ou chez le client.",
  ],
  [
    "Jusqu’à cinq photos par prestation",
    "Ce que vous savez faire, montré plutôt que décrit.",
  ],
];

const DAY_CHIPS: [string, string][] = [
  ["calendar", "Jour et semaine"],
  ["users", "Plusieurs personnes"],
  ["calendar-x", "Fermetures et congés"],
  ["note", "Fiches clients"],
];

/** The three fulfilment modes, as a provider chooses them per service. */
const MODES: [string, string, string, string][] = [
  [
    "mode-onsite",
    "Sur place",
    "Le client vient et attend sur place.",
    "Durée réelle réservée dans votre agenda",
  ],
  [
    "mode-dropoff",
    "Dépôt",
    "Le client dépose et repasse. Le rendez-vous ne dure que la remise au comptoir.",
    "« Prêt sous 48 h » affiché au client",
  ],
  [
    "mode-atcustomer",
    "À domicile",
    "Vous vous déplacez chez le client. L’adresse est jointe au rendez-vous.",
    "Adresse écrite jointe au rendez-vous",
  ],
];


/**
 * Ce que le produit refuse, et POURQUOI.
 *
 * <p>La raison n'est pas une décoration : un refus sans raison est une excuse,
 * et c'est la raison qui fait la différence entre une position et une liste de
 * fonctionnalités manquantes. Chaque ligne engage le produit, donc chaque ligne
 * se relit avant d'être publiée.
 *
 * <p>« Aucun SMS ni e-mail automatique » est parti : le client choisit son
 * canal depuis V049, et la phrase était devenue fausse.
 */
const REFUSALS: [string, string][] = [
  [
    "Aucun paiement en ligne, aucun acompte.",
    "Vous encaissez comme aujourd’hui, en espèces ou en mobile money, directement. Balaaca ne touche jamais votre argent et n’a donc rien à vous retenir.",
  ],
  [
    "Aucune note, aucun avis client.",
    "Une moyenne sur quatre avis ne dit rien de vrai sur un salon, et elle se manipule le premier jour. Tant qu’on ne sait pas la rendre honnête, on ne la met pas.",
  ],
  [
    "Aucune mise en avant payante.",
    "Le classement est alphabétique, pour tout le monde, et il le restera. Personne ne paie pour passer devant vous.",
  ],
  [
    "Aucune statistique de chiffre d’affaires.",
    "Vos prix sont sur votre page, pas dans un tableau de bord qui vous compare aux autres. Ce que vous gagnez ne regarde que vous.",
  ],
  [
    "Aucune application à télécharger.",
    "Tout tient dans le navigateur, sur le téléphone que vous avez déjà. Rien à installer, rien à mettre à jour, rien qui prenne de la place.",
  ],
];

export default function ProLanding() {
  return (
    <>
      <SiteHeader />

      <main id="contenu" className="has-tabbar">
        <section className="hero atmo grain grain--dark tex-halo tex-halo--dark">
          <div className="page hero__in">
            <div
              className="feature feature--wide-left"
              style={{ alignItems: "center" }}
            >
              <div>
                <p className="hero__eyebrow" data-enter="1">
                  <Icon name="store" size={18} /> Espace professionnel
                </p>
                <h1 className="t-display hero__title" data-enter="2">
                  Votre carnet de rendez-vous, <em>enfin à jour.</em>
                </h1>
                <p className="hero__sub" data-enter="3">
                  Vos clients réservent seuls, depuis un lien WhatsApp ou le QR
                  code collé sur votre porte. Vous ouvrez l’agenda le matin et
                  vous savez qui vient.
                </p>
                <div
                  className="row row--wrap"
                  style={{ marginTop: "var(--s-8)", gap: "var(--s-3)" }}
                  data-enter="4"
                >
                  <Link className="btn btn--inverse btn--lg" href="/inscription">
                    <span className="btn__label--idle">Créer ma page</span>
                  </Link>
                  <Link
                    className="btn btn--secondary btn--lg"
                    href="/professionnels/tarifs"
                  >
                    <span className="btn__label--idle">Voir les tarifs</span>
                  </Link>
                </div>
                <div
                  className="row row--wrap"
                  style={{ marginTop: "var(--s-8)", gap: "var(--s-6)" }}
                  data-enter="5"
                >
                  {HERO_PROOF.map(([icon, label]) => (
                    <span className="row" style={PROOF_STYLE} key={label}>
                      <Icon name={icon} size={18} /> {label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="feature__art" data-enter="5">
                <div className="shot-stack">
                  <SlotPickerShot />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="feat section--surface atmo tex-dots">
          <div className="page feat__in">
            <div className="feat__text" data-reveal="left">
              <p className="t-overline t-overline--accent">Votre vitrine</p>
              <h2 className="t-h2 hair" style={{ marginTop: "var(--s-5)" }}>
                Une page qui répond avant vous
              </h2>
              <p className="t-lead" style={{ marginTop: "var(--s-4)" }}>
                Vos prestations, vos prix, vos horaires, votre équipe. Le client
                sait ce que ça coûte et comment ça se passe avant même de vous
                écrire.
              </p>
              {/* Pas de coche. Le cercle vert coché est le geste qu'emploient
                  toutes les pages de produit, et c'est pour cela qu'il se lit
                  comme généré ; un filet et un intertitre disent la même chose
                  et ressemblent à de l'imprimé. */}
              <div className="marks mark-a" style={{ marginTop: "var(--s-7)" }}>
                <ul>
                  {SHOPFRONT.map(([title, detail]) => (
                    <li key={title}>
                      <b>{title}</b>
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {/* La capture est absolue dans sa colonne et la section la rogne :
                ses bordures droite et basse n'existent pas, elles sont coupées
                avec le reste. Une marge négative ferait déborder sur le texte
                au lieu de couper. */}
            <div className="feat__art" data-reveal="right">
              <div className="shot">
                <PublicPageShot />
              </div>
            </div>
          </div>
        </section><section className="feat feat--flip section--sunken atmo grain">
          <svg className="wm wm--bl" viewBox="0 0 24 24" aria-hidden="true">
            <use href="#i-calendar" />
          </svg>
          <div className="page feat__in">
            {/* feat--flip puts the text second and anchors the capture to the
                RIGHT of its own column, so it grows leftward and off the page.
                Anchored that way it cannot reach the text, which is what stops
                it overlapping. */}
            <div className="feat__art" data-reveal="left">
              <div className="shot">
                <DashboardShot />
              </div>
            </div>
            <div className="feat__text" data-reveal="right">
              <p className="t-overline t-overline--accent">Votre atelier</p>
              <h2 className="t-h2 hair" style={{ marginTop: "var(--s-5)" }}>
                La journée d’un coup d’œil
              </h2>
              <p className="t-lead" style={{ marginTop: "var(--s-4)" }}>
                Qui vient, à quelle heure, pour quoi, et ce qui attend votre
                accord. Confirmer, déplacer, marquer une absence, saisir
                quelqu’un qui passe sans rendez-vous.
              </p>
              <div className="marks mark-c" style={{ marginTop: "var(--s-7)" }}>
                <ul>
                  {DAY_CHIPS.map(([icon, label]) => (
                    <li key={label}>
                      <span className="rule" aria-hidden="true" />
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="feat atmo tex-rules">
          <div className="page feat__in">
            {/* Le texte a gauche, l'image a droite : la rangee precedente a
                l'image a gauche, et deux rangees de suite du meme cote donnent
                la monotonie que la revue de design avait relevee. */}
            <div className="feat__text" data-reveal="left">
              <p className="t-overline t-overline--accent">Votre adresse, à vie</p>
              <h2 className="t-h2 hair" style={{ marginTop: "var(--s-5)" }}>
                Un lien court, un QR code, et c’est tout
              </h2>
              <p className="t-lead" style={{ marginTop: "var(--s-4)" }}>
                Collez l’affiche sur votre vitrine, mettez le lien dans votre
                statut WhatsApp. L’adresse de votre page ne changera jamais&nbsp;:
                ce que vous imprimez aujourd’hui fonctionnera dans cinq ans.
              </p>
              <div className="dl dl--lined" style={{ marginTop: "var(--s-7)" }}>
                <div className="dl__row">
                  <span className="dl__key">Votre lien</span>
                  <span className="dl__val">balaaca.com/p/votre-nom</span>
                </div>
                {/* Redevenue vraie avec V043. Elle avait été retirée parce que
                    la référence faisait quarante-trois caractères de base64url
                    que personne ne dicte ; elle en fait dix, dont les trois
                    initiales de l’établissement. */}
                <div className="dl__row">
                  <span className="dl__key">Référence d’un rendez-vous</span>
                  <span className="dl__val">Dix caractères, dictables</span>
                </div>
                <div className="dl__row">
                  <span className="dl__key">Compte client à créer</span>
                  <span className="dl__val">Aucun</span>
                </div>
              </div>
            </div>
            <div className="feat__art" data-reveal="scale">
              <div className="shot-stack">
                <PosterShot />
                <ConfirmationShot />
              </div>
            </div>
          </div>
        </section>

        {/* Le manifeste passe AVANT les trois façons. Il vient de la section
            ivoire qui le precede et repart sur du creux : deux fonds clairs
            encadrent la seule bande sombre de cette moitie de page, ce qui la
            fait exister. Derriere les trois façons, il fermait la page sur du
            sombre juste avant le pied, qui l'est aussi. */}
        <section className="creed on-dark" data-reveal>
          <div className="page">
            <p className="t-overline">Honnêteté</p>
            <h2 className="t-h2">Ce que Balaaca refuse de faire</h2>
            <p className="creed__lead">
              Tout le monde publie la liste de ce qu’un produit sait faire.
              Celle-ci est plus courte à écrire et plus longue à assumer.
            </p>

            <div className="creed__list">
              {REFUSALS.map(([refusal, why], index) => (
                <div
                  className="creed__item"
                  key={refusal}
                  style={{ "--i": index } as CSSProperties}
                >
                  <p className="creed__no">{refusal}</p>
                  <p className="creed__why">{why}</p>
                </div>
              ))}
            </div>

          </div>
        </section>

        <section className="section section--sunken atmo grain">
          <div className="page">
            <div className="section-head">
              <div className="section-head__text">
                <p className="t-overline t-overline--accent">Trois façons de travailler</p>
                <h2 className="t-h1">
                  Balaaca comprend votre métier
                </h2>
                <p className="t-lead">
                  Un garage ne travaille pas comme un salon, et un plombier ne
                  reçoit personne. Chaque prestation porte son mode, et c’est ce
                  que le client lit avant de réserver.
                </p>
              </div>
            </div>
            <div className="valueband" data-reveal-group>
              {MODES.map(([icon, name, body, note]) => (
                <div className="valueband__item" key={name}>
                  <span style={{ color: "var(--accent-strong)" }}>
                    <Icon name={icon} size={32} />
                  </span>
                  <h3 className="t-h3" style={{ marginTop: "var(--s-4)" }}>
                    {name}
                  </h3>
                  <p className="t-body" style={{ marginTop: "var(--s-3)" }}>
                    {body}
                  </p>
                  <p
                    className="t-sm"
                    style={{
                      color: "var(--accent)",
                      marginTop: "var(--s-4)",
                      fontWeight: 700,
                    }}
                  >
                    {note}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Ivoire : les trois façons juste au-dessus sont en creux, et deux fonds
            identiques colles n'en font qu'un. La page finit en clair avant le
            pied, qui est vert. */}
        <section className="section atmo grain">
          <div className="page">
            <div
              className="feature feature--wide-left"
              style={{ alignItems: "center" }}
            >
              <div data-reveal="left">
                <p className="t-overline t-overline--accent">Dix minutes</p>
                <h2 className="t-h1" style={{ marginTop: "var(--s-4)" }}>
                  Le nom, le métier, une prestation, vos horaires.
                </h2>
                <p className="t-lead" style={{ marginTop: "var(--s-4)" }}>
                  Vous publiez, et le lien est prêt à être collé dans votre
                  statut WhatsApp. Rien n’est visible tant que vous ne l’avez
                  pas décidé.
                </p>
                <div
                  className="row row--wrap"
                  style={{ marginTop: "var(--s-7)", gap: "var(--s-3)" }}
                >
                  <Link className="btn btn--primary btn--lg" href="/inscription">
                    <span className="btn__label--idle">Créer ma page</span>
                    <Icon name="arrow-right" size={18} className="ico--arrow" />
                  </Link>
                  <Link
                    className="btn btn--secondary btn--lg"
                    href="/professionnels/comment-ca-marche"
                  >
                    <span className="btn__label--idle">
                      Voir comment ça marche
                    </span>
                  </Link>
                </div>
              </div>
              <div className="feature__art" data-reveal="right">
                <HomeScreenShot />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <TabBar />
    </>
  );
}


/* --- The device mockups -------------------------------------------------- */
/* Local rather than shared: `comment-ca-marche` shows three of the same four,
   but a component file is not this page's to add. */

/** Step four of the booking flow, on a telephone. */
function SlotPickerShot() {
  return (
    <div className="shot-phone">
      <div className="shot-phone__screen">
        <span className="shot-phone__notch" />
        <div className="mini">
          <div className="mini__bar">
            <span className="mini__logo">B</span>
            <span className="mini__sub">Étape 4 sur 5</span>
          </div>
          <div className="mini__body">
            <div
              className="mini__title"
              style={{ fontSize: "15px", lineHeight: 1.25 }}
            >
              Quel horaire, mercredi 9 septembre ?
            </div>
            <div className="mini__sub">
              Seuls les créneaux réservables sont affichés.
            </div>
            <div className="mini__sub" style={SLOT_GROUP_STYLE}>
              Matin
            </div>
            <div className="mini__grid3">
              <span className="mini__slot">10:00</span>
              <span className="mini__slot mini__slot--on">10:30</span>
              <span className="mini__slot">11:00</span>
            </div>
            <div className="mini__sub" style={SLOT_GROUP_STYLE}>
              Après-midi
            </div>
            <div className="mini__grid3">
              <span className="mini__slot">13:00</span>
              <span className="mini__slot">14:30</span>
              <span className="mini__slot">16:00</span>
            </div>
            <div
              className="mini__card"
              style={{
                background: "var(--bg-sunken)",
                borderStyle: "dashed",
              }}
            >
              <div className="mini__row">
                <span className="mini__sub">Prix figé</span>
                <strong style={{ marginLeft: "auto", fontSize: "13px" }}>
                  150 000 GNF
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SLOT_GROUP_STYLE = {
  fontWeight: 700,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  fontSize: "9px",
  marginTop: "2px",
} as const;

/** A provider's public page, in a browser frame. */
function PublicPageShot() {
  return (
    <div className="shot-browser">
      <div className="shot-browser__bar">
        <span className="shot-browser__dot" />
        <span className="shot-browser__dot" />
        <span className="shot-browser__dot" />
        <span className="shot-browser__url">balaaca.com/p/salon-aissatou</span>
      </div>
      <div className="shot-browser__body mini">
        <div className="mini__cover">
          <svg
            viewBox="0 0 200 150"
            aria-hidden="true"
            style={{
              position: "absolute",
              right: "-14px",
              top: "-30px",
              width: "150px",
              color: "rgba(201,168,106,.5)",
            }}
          >
            <use href="#s-chair" />
          </svg>
        </div>
        <div className="mini__body">
          <div className="mini__row">
            <span className="mini__logo">SA</span>
            <span>
              <span className="mini__title">Salon Aïssatou</span>
              <span className="mini__sub" style={{ display: "block" }}>
                Coiffure · Nongo, Ratoma
              </span>
            </span>
            {/* The mockup carried two `style` attributes here, of which a
                browser keeps the first; `.mini__pill` declares a border with
                no colour, so the pill needs both. */}
            <span
              className="mini__pill"
              style={{
                marginLeft: "auto",
                borderColor: "var(--success-border)",
                background: "var(--success-bg)",
                color: "var(--success-text)",
              }}
            >
              Ouvert
            </span>
          </div>
          <div className="mini__card">
            <div className="mini__row">
              <strong style={{ fontSize: "12px" }}>Tresses collées</strong>
              <strong style={{ marginLeft: "auto", fontSize: "12px" }}>
                150 000 GNF
              </strong>
            </div>
            <div className="mini__row" style={{ gap: "5px" }}>
              <span
                className="mini__pill"
                style={{
                  borderColor: "var(--brand-border)",
                  background: "var(--brand-soft)",
                  color: "var(--brand)",
                }}
              >
                <Icon name="mode-onsite" /> Sur place
              </span>
              <span className="mini__sub">3 h</span>
            </div>
          </div>
          <div className="mini__card">
            <div className="mini__row">
              <strong style={{ fontSize: "12px" }}>Coiffure de mariée</strong>
              <strong style={{ marginLeft: "auto", fontSize: "12px" }}>
                650 000 GNF
              </strong>
            </div>
            <div className="mini__row" style={{ gap: "5px" }}>
              <span
                className="mini__pill"
                style={{
                  borderColor: "var(--info-border)",
                  background: "var(--info-bg)",
                  color: "var(--info-text)",
                }}
              >
                <Icon name="mode-atcustomer" /> À domicile
              </span>
              <span className="mini__sub">4 h</span>
            </div>
          </div>
          <div className="mini__btn">Réserver une prestation</div>
        </div>
      </div>
    </div>
  );
}

const NAV_ITEM_STYLE = {
  gap: "6px",
  padding: "5px 6px",
  borderRadius: "5px",
  fontSize: "10px",
  fontWeight: 600,
  whiteSpace: "nowrap",
} as const;

const DASHBOARD_NAV: [string, string, boolean][] = [
  ["home", "Aujourd’hui", true],
  ["calendar", "Agenda", false],
  ["tag", "Prestations", false],
  ["store", "Ma page", false],
  ["users", "Clientèle", false],
];

const DASHBOARD_DAY: [string, string, string, string][] = [
  ["var(--warning)", "11:00", "Kadiatou Camara", "Tissage · à confirmer"],
  ["var(--brand)", "09:00", "Aminata Diallo", "Soin & brushing · confirmé"],
  ["var(--success)", "15:30", "Hadja Sylla", "Soin & brushing · terminé"],
];

/** The provider's own day, in a browser frame. */
function DashboardShot() {
  return (
    <div className="shot-browser">
      <div className="shot-browser__bar">
        <span className="shot-browser__dot" />
        <span className="shot-browser__dot" />
        <span className="shot-browser__dot" />
        <span className="shot-browser__url">balaaca.com/dashboard</span>
      </div>
      {/* La grille est dans la feuille de style et non ici : en ligne, elle
          etait impossible a reprendre au point d'arret, ou la barre laterale
          doit reprendre de la largeur. */}
      <div className="shot-browser__body mini shot-dash">
        <div
          style={{
            background: "var(--surface-inverse)",
            padding: "10px 8px",
            display: "grid",
            gap: "6px",
            alignContent: "start",
          }}
        >
          <div
            className="mini__row"
            style={{ gap: "6px", marginBottom: "4px" }}
          >
            <span className="mini__logo">B</span>
            <span
              style={{ color: "#fff", fontWeight: 800, fontSize: "11px" }}
            >
              Balaaca
            </span>
          </div>
          {DASHBOARD_NAV.map(([icon, label, current]) => (
            <div
              className="mini__row"
              key={label}
              style={{
                ...NAV_ITEM_STYLE,
                background: current ? "rgba(255,255,255,.14)" : "transparent",
                color: current ? "#fff" : "rgba(182,198,193,.9)",
              }}
            >
              <Icon name={icon} size={16} /> {label}
            </div>
          ))}
        </div>
        <div className="mini__body">
          <div className="mini__row">
            <span className="mini__title">Aujourd’hui</span>
            <span className="mini__sub" style={{ marginLeft: "auto" }}>
              Lundi 7 septembre
            </span>
          </div>
          {DASHBOARD_DAY.map(([accent, at, who, what]) => (
            <div
              className="mini__appt"
              key={who}
              style={{ "--appt-accent": accent } as CSSProperties}
            >
              <span className="mini__time">{at}</span>
              <span>
                <strong style={{ fontSize: "11px" }}>{who}</strong>
                <span className="mini__sub" style={{ display: "block" }}>
                  {what}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The dark modules of a fake QR, by coordinate.
 *
 * <p>A drawing, not a code: it encodes nothing and is never scanned. The
 * coordinates are the mockup's own, kept as data so the markup stays readable.
 */
const QR_ROWS: [number, number[]][] = [
  [8, [3, 6, 7, 9, 11, 12, 13, 16, 18, 19, 21, 23, 24, 26]],
  [11, [4, 6, 7, 9, 10, 11, 13, 16, 18, 19, 21, 24, 26]],
  [14, [2, 4, 5, 7, 10, 12, 13, 15, 17, 18, 20, 23, 25, 26]],
  [17, [3, 6, 8, 9, 11, 12, 14, 17, 19, 20, 22, 25]],
  [20, [2, 3, 5, 6, 7, 9, 12, 14, 15, 17, 20, 22, 23, 25]],
  [23, [3]],
];

/** The three corner squares that make a QR read as one. */
const QR_FINDERS: [number, number][] = [
  [1, 1],
  [1, 21],
  [21, 1],
];

/** The printable poster, as a provider tapes it to the window. */
function PosterShot() {
  return (
    <div className="poster">
      <span
        className="mini__logo"
        style={{ width: "26px", height: "26px", fontSize: "13px" }}
      >
        B
      </span>
      <div
        style={{
          fontSize: "15px",
          fontWeight: 800,
          letterSpacing: "-.02em",
          lineHeight: 1.2,
        }}
      >
        Salon Aïssatou
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "var(--text-tertiary)",
          marginTop: "-6px",
        }}
      >
        Réservez en scannant
      </div>
      <svg
        className="poster__qr"
        viewBox="0 0 29 29"
        shapeRendering="crispEdges"
        width="108"
        height="108"
        aria-hidden="true"
      >
        <rect width="29" height="29" fill="#fff" />
        {QR_ROWS.map(([y, xs]) =>
          xs.map((x) => (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="1"
              height="1"
              fill="#123C35"
            />
          )),
        )}
        {QR_FINDERS.map(([x, y]) => (
          <g
            key={`${x}-${y}`}
            fill="none"
            stroke="#123C35"
            strokeWidth="1"
          >
            <rect x={x} y={y} width="7" height="7" />
            <rect
              x={x + 2}
              y={y + 2}
              width="3"
              height="3"
              fill="#123C35"
            />
          </g>
        ))}
      </svg>
      <div
        style={{
          fontSize: "10.5px",
          fontWeight: 700,
          color: "var(--accent-strong)",
          letterSpacing: ".04em",
        }}
      >
        balaaca.com/p/salon-aissatou
      </div>
    </div>
  );
}

/** What the customer sees once the slot is taken. */
function ConfirmationShot() {
  return (
    <div className="shot-phone shot-phone--sm">
      <div className="shot-phone__screen">
        <span className="shot-phone__notch" />
        <div className="mini">
          <div
            className="mini__body"
            style={{
              paddingTop: "22px",
              justifyItems: "center",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                background: "var(--success-bg)",
                border: "1px solid var(--success-border)",
                color: "var(--success)",
                display: "grid",
                placeItems: "center",
                marginInline: "auto",
              }}
            >
              <Icon name="check" />
            </div>
            <div className="mini__title" style={{ textAlign: "center" }}>
              C’est réservé.
            </div>
            <div
              style={{
                border: "1.4px dashed var(--border-strong)",
                borderRadius: "6px",
                padding: "7px 10px",
                fontWeight: 800,
                letterSpacing: ".14em",
                fontSize: "15px",
              }}
            >
              JZ75 KA5V
            </div>
            <div className="mini__sub">
              Gardez cette référence pour déplacer ou annuler.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const HOME_TRADES = [
  "coiffure",
  "couture",
  "mecanique-auto",
  "traiteur",
  "plomberie",
  "photographie",
];

/** The customer's first screen, on a telephone. */
function HomeScreenShot() {
  return (
    <div className="shot-phone shot-phone--sm">
      <div className="shot-phone__screen">
        <span className="shot-phone__notch" />
        <div className="mini">
          <div
            style={{
              background: "var(--surface-inverse)",
              padding: "22px 12px 14px",
            }}
          >
            <div
              style={{
                color: "#fff",
                fontSize: "15px",
                fontWeight: 800,
                letterSpacing: "-.02em",
                lineHeight: 1.2,
              }}
            >
              Le bon professionnel,{" "}
              <span style={{ color: "var(--accent)" }}>
                à l’heure qui vous arrange.
              </span>
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: "8px",
                padding: "8px 10px",
                marginTop: "10px",
                display: "grid",
                gap: "6px",
              }}
            >
              <div
                className="mini__sub"
                style={{
                  fontSize: "8.5px",
                  fontWeight: 700,
                  letterSpacing: ".09em",
                  textTransform: "uppercase",
                }}
              >
                Que cherchez-vous
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-tertiary)",
                }}
              >
                Tresses, vidange, robe…
              </div>
              <div className="mini__btn" style={{ padding: "6px" }}>
                Rechercher
              </div>
            </div>
          </div>
          <div className="mini__body">
            <div className="mini__grid3">
              {HOME_TRADES.map((slug) => (
                <div
                  key={slug}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "8px 4px",
                    display: "grid",
                    justifyItems: "center",
                    gap: "3px",
                    background: "var(--surface)",
                  }}
                >
                  <span style={{ color: "var(--brand)" }}>
                    <TradeIcon slug={slug} size={18} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
