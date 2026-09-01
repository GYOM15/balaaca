import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon, Scene, TradeIcon } from "@/components/icon";
import { SiteFooter, SiteHeader, TabBar } from "@/components/site";

/**
 * The four screens a customer goes through, from the search to the reference.
 *
 * <p>Static, like the rest of the showcase: nothing here is read from the API.
 *
 * <p>Buttons are plain anchors carrying the mockup's own classes, for the same
 * reason as the pitch: `ui.tsx`'s `Button` puts the icon class on the glyph
 * where the design puts it on a wrapper.
 */
export const metadata: Metadata = {
  title: "Comment ça marche",
  description:
    "Vous cherchez, vous regardez, vous réservez, vous gardez une référence. " +
    "Rien à installer, rien à créer, rien à payer en ligne.",
};

/** How a search can be narrowed, and each one is a parameter the API takes. */
const SEARCH_CHIPS = ["Mot-clé", "Plusieurs métiers", "Commune", "Quartier libre"];

const MODES: [string, string, string][] = [
  [
    "mode-onsite",
    "Sur place",
    "Vous vous rendez chez le prestataire et la prestation est réalisée pendant que vous attendez.",
  ],
  [
    "mode-dropoff",
    "Dépôt",
    "Vous déposez l’article, vous repassez le récupérer une fois le travail terminé.",
  ],
  [
    "mode-atcustomer",
    "À domicile",
    "Le prestataire se déplace jusqu’à l’adresse que vous indiquez.",
  ],
];

const FAQ: [string, string][][] = [
  [
    [
      "Faut-il créer un compte ?",
      "Non. Le client ne crée jamais de compte sur Balaaca. Seul le professionnel se connecte.",
    ],
    [
      "Est-ce que je paie sur Balaaca ?",
      "Non. Vous payez le professionnel directement, comme d’habitude. Balaaca ne traite aucun paiement et ne prend aucune commission.",
    ],
    [
      "Le prix peut-il changer après ma réservation ?",
      "Non. Le prix est figé au moment de la réservation, même si le professionnel modifie son tarif ensuite.",
    ],
    [
      "Qui voit mon numéro de téléphone ?",
      "Le professionnel chez qui vous réservez, et lui seul. Il le conserve dans sa fiche client pour vous reconnaître la fois suivante.",
    ],
  ],
  [
    [
      "J’ai perdu ma référence.",
      "Le message WhatsApp du professionnel la contient. Sinon, appelez l’établissement : il vous retrouve avec votre numéro.",
    ],
    [
      "Comment le professionnel me contacte-t-il ?",
      "Par WhatsApp, sur le numéro que vous avez indiqué. Il n’y a ni SMS ni e-mail automatique.",
    ],
    [
      "Puis-je annuler ?",
      "Oui, depuis votre page de suivi, dans le délai fixé par le professionnel. Passé ce délai, appelez-le directement.",
    ],
    [
      "Et pour une prestation à domicile ?",
      "On vous demande votre commune, votre quartier et des repères écrits. Aucune position GPS n’est demandée ni enregistrée.",
    ],
  ],
];

const SUMMARY_STYLE = {
  cursor: "pointer",
  listStyle: "none",
  gap: "var(--s-3)",
} as const;

export default function HowItWorks() {
  return (
    <>
      <SiteHeader active="comment-ca-marche" />

      <main id="contenu" className="has-tabbar">
        <section
          className="hero atmo grain grain--dark tex-halo tex-halo--dark"
          style={{ paddingBottom: "var(--s-8)" }}
        >
          <div
            className="page hero__in"
            style={{ paddingBlock: "var(--s-12) var(--s-10)" }}
          >
            <div
              className="feature feature--wide-left"
              style={{ alignItems: "center" }}
            >
              <div>
                <p className="hero__eyebrow" data-enter="1">
                  <Icon name="help" size={18} /> Côté client
                </p>
                <h1 className="t-display hero__title" data-enter="2">
                  Quatre écrans, <em>aucun compte.</em>
                </h1>
                <p className="hero__sub" data-enter="3">
                  Vous cherchez, vous regardez, vous réservez, vous gardez une
                  référence. Rien à installer, rien à créer, rien à payer en
                  ligne.
                </p>
                <div
                  className="row row--wrap"
                  style={{ marginTop: "var(--s-8)", gap: "var(--s-3)" }}
                  data-enter="4"
                >
                  {/* The mockup's /search is the hub itself here: the
                      directory and its filters live at the root. */}
                  <Link className="btn btn--inverse btn--lg" href="/">
                    <span
                      className="btn__icon--idle"
                      style={{ display: "inline-flex" }}
                    >
                      <Icon name="search" size={18} />
                    </span>
                    <span className="btn__label--idle">
                      Chercher un professionnel
                    </span>
                  </Link>
                  <Link className="btn btn--secondary btn--lg" href="/bookings">
                    <span className="btn__label--idle">
                      Retrouver ma réservation
                    </span>
                  </Link>
                </div>
              </div>
              <div className="feature__art" data-enter="5">
                <HomeScreenShot />
              </div>
            </div>
          </div>
        </section>

        <section className="section section--lg atmo tex-rules">
          <div className="page">
            <div className="stepline" data-reveal>
              <div className="stepline__n">01</div>
              <div>
                <h2 className="t-h2">Vous cherchez</h2>
                <p className="t-lead" style={{ marginTop: "var(--s-4)" }}>
                  Par mot, par métier, par commune ou par quartier. Demander
                  «&nbsp;Conakry&nbsp;» retient aussi ce qui est enregistré à
                  Ratoma.
                </p>
                <p className="t-body" style={{ marginTop: "var(--s-4)" }}>
                  Les résultats sont classés par ordre alphabétique. Personne ne
                  paie pour passer devant, et aucun classement ne dépend de ce
                  que vous avez cherché hier.
                </p>
                <div
                  className="row row--wrap"
                  style={{ marginTop: "var(--s-6)", gap: "var(--s-2)" }}
                >
                  {SEARCH_CHIPS.map((chip) => (
                    <span className="chip" key={chip}>
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
              <div className="stepline__art">
                <Scene
                  name="storefront"
                  className="scene-ill"
                  style={{ color: "var(--p-warm-300)" }}
                />
              </div>
            </div>

            <div className="stepline" data-reveal>
              <div className="stepline__n">02</div>
              <div>
                <h2 className="t-h2">
                  Vous regardez la page du professionnel
                </h2>
                <p className="t-lead" style={{ marginTop: "var(--s-4)" }}>
                  Ses prestations, ses prix, ses horaires, son équipe, et
                  surtout la façon dont chaque prestation se déroule.
                </p>
                <div
                  className="stack"
                  style={
                    {
                      "--stack-gap": "var(--s-3)",
                      marginTop: "var(--s-6)",
                    } as CSSProperties
                  }
                >
                  {MODES.map(([icon, name, body]) => (
                    <div
                      className="row"
                      style={{ alignItems: "flex-start", gap: "var(--s-4)" }}
                      key={name}
                    >
                      <span className="choice__icon">
                        <Icon name={icon} />
                      </span>
                      <span>
                        <span className="t-strong">{name}</span>
                        <span
                          className="t-sm"
                          style={{ display: "block", marginTop: "2px" }}
                        >
                          {body}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="stepline__art">
                <PublicPageShot />
              </div>
            </div>

            <div className="stepline" data-reveal>
              <div className="stepline__n">03</div>
              <div>
                <h2 className="t-h2">Vous prenez un créneau libre</h2>
                <p className="t-lead" style={{ marginTop: "var(--s-4)" }}>
                  Vous choisissez le jour, l’horaire, et la personne si
                  l’établissement en compte plusieurs.
                </p>
                <p className="t-body" style={{ marginTop: "var(--s-4)" }}>
                  Seuls les créneaux réellement disponibles sont proposés.
                  Balaaca ne publie jamais l’emploi du temps de quelqu’un : ce
                  qui est déjà pris n’apparaît nulle part, il est simplement
                  absent de la liste.
                </p>
                <div
                  className="card card--pad-sm"
                  style={{
                    marginTop: "var(--s-6)",
                    background: "var(--accent-soft)",
                    borderColor: "var(--border-accent)",
                    boxShadow: "none",
                  }}
                >
                  <p
                    className="t-sm"
                    style={{ color: "var(--accent-strong)" }}
                  >
                    <Icon name="lock" size={16} /> Le prix affiché au moment où
                    vous réservez est figé. Il ne changera pas, même si le
                    professionnel modifie son tarif ensuite.
                  </p>
                </div>
              </div>
              <div className="stepline__art">
                <SlotPickerShot />
              </div>
            </div>

            <div className="stepline" data-reveal>
              <div className="stepline__n">04</div>
              <div>
                <h2 className="t-h2">Vous gardez une référence</h2>
                {/* The mockup opened this with "Huit caractères, faciles à dire
                    au téléphone". AppointmentSqlRepository.mintReference draws
                    thirty-two random bytes and returns the base64url of them -
                    forty-three characters nobody dictates - so the sentence
                    that counted them is gone rather than false. */}
                <p className="t-lead" style={{ marginTop: "var(--s-4)" }}>
                  C’est la seule chose à conserver : il n’y a pas de compte à
                  retrouver.
                </p>
                <p className="t-body" style={{ marginTop: "var(--s-4)" }}>
                  Elle ouvre votre page de suivi : déplacer le rendez-vous,
                  l’annuler dans le délai fixé par le professionnel, ou signaler
                  un problème.
                </p>
                <div
                  className="row row--wrap"
                  style={{ marginTop: "var(--s-6)", gap: "var(--s-3)" }}
                >
                  <Link className="btn btn--secondary" href="/bookings">
                    <span
                      className="btn__icon--idle"
                      style={{ display: "inline-flex" }}
                    >
                      <Icon name="search" size={18} />
                    </span>
                    <span className="btn__label--idle">
                      Retrouver une réservation
                    </span>
                  </Link>
                </div>
              </div>
              <div className="stepline__art">
                <ConfirmationShot />
              </div>
            </div>
          </div>
        </section>

        <section className="section section--sunken atmo grain">
          <svg className="wm wm--br" viewBox="0 0 24 24" aria-hidden="true">
            <use href="#i-message" />
          </svg>
          <div className="page">
            <div className="section-head">
              <div className="section-head__text">
                <p className="t-overline">Questions fréquentes</p>
                <h2 className="t-h2">Ce qu’il faut savoir avant de réserver</h2>
              </div>
            </div>
            <div className="cols cols--2" style={{ gap: "var(--s-6)" }}>
              {FAQ.map((column, i) => (
                <div
                  className="stack"
                  key={i}
                  style={{ "--stack-gap": "var(--s-2)" } as CSSProperties}
                >
                  {column.map(([question, answer]) => (
                    // <details>, so an answer opens with no JavaScript and the
                    // browser's own find-in-page reaches the closed ones.
                    <details className="card card--pad-sm" key={question}>
                      <summary
                        className="row row--between"
                        style={SUMMARY_STYLE}
                      >
                        <span className="t-strong">{question}</span>
                        <Icon name="chevron-down" size={18} />
                      </summary>
                      <p className="t-sm" style={{ marginTop: "var(--s-3)" }}>
                        {answer}
                      </p>
                    </details>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="section section--dark on-dark atmo grain grain--dark tex-halo tex-halo--dark"
          style={{ paddingBlock: "var(--s-14)" }}
        >
          <div
            className="page"
            style={{
              display: "grid",
              gap: "var(--s-6)",
              justifyItems: "center",
              textAlign: "center",
            }}
          >
            <h2 className="t-h1" style={{ color: "#fff", maxWidth: "22ch" }}>
              Trouvez quelqu’un près de chez vous
            </h2>
            <p
              className="t-lead"
              style={{
                color: "var(--text-on-dark-muted)",
                maxWidth: "50ch",
              }}
            >
              35 métiers, à Conakry et dans l’intérieur du pays.
            </p>
            <Link className="btn btn--inverse btn--lg" href="/">
              <span className="btn__label--idle">Commencer une recherche</span>
              <Icon name="arrow-right" size={18} className="ico--arrow" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
      <TabBar />
    </>
  );
}


/* --- The device mockups -------------------------------------------------- */
/* Local rather than shared: the pitch shows three of the same four, but a
   component file is not this page's to add. */

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

/** A provider's public page, in a browser frame. */
function PublicPageShot() {
  return (
    <div className="shot-browser">
      <div className="shot-browser__bar">
        <span className="shot-browser__dot" />
        <span className="shot-browser__dot" />
        <span className="shot-browser__dot" />
        <span className="shot-browser__url">balaaca.gn/p/salon-aissatou</span>
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

const SLOT_GROUP_STYLE = {
  fontWeight: 700,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  fontSize: "9px",
  marginTop: "2px",
} as const;

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
              style={{ background: "var(--bg-sunken)", borderStyle: "dashed" }}
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
