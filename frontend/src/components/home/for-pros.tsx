import Link from "next/link";

/**
 * The four figures are the reach of the platform, not its traffic: how many
 * trades the taxonomy holds, how many communes and prefectures the map has, and
 * two facts about the product. Nothing here counts a customer.
 */
export function ForPros({ trades, settlements }: { trades: number; settlements: number }) {
  return (
    <section className="section section--dark on-dark atmo grain grain--dark tex-halo tex-halo--dark">
      <div className="page">
        <div
          className="cols cols--2"
          style={{ alignItems: "center", gap: "var(--s-10)" }}
          data-reveal-group
        >
          <div>
            <p className="t-overline" style={{ color: "var(--accent)" }}>
              Vous exercez un métier
            </p>
            <h2 className="t-h1" style={{ color: "#fff", marginTop: "var(--s-3)" }}>
              Votre page, votre agenda, votre QR code.
            </h2>
            <p
              className="t-lead"
              style={{ color: "var(--text-on-dark-muted)", marginTop: "var(--s-4)" }}
            >
              Vos clients réservent depuis WhatsApp ou depuis l’affiche collée sur votre
              porte. Vous voyez la journée d’un coup d’œil, vous confirmez, et vous
              travaillez.
            </p>
            <div className="row row--wrap" style={{ marginTop: "var(--s-7)" }}>
              <Link className="btn btn--inverse btn--lg" href="/inscription">
                <span className="btn__label--idle">Créer ma page</span>
              </Link>
              <Link className="btn btn--ghost btn--lg on-dark" href="/professionnels">
                <span className="btn__label--idle">Comment ça fonctionne</span>
              </Link>
            </div>
          </div>
          <div className="facts-band" style={{ gap: "var(--s-8)" }} data-reveal-group>
            <Fact number={String(trades)} label="métiers couverts" />
            <Fact number={String(settlements)} label="communes et préfectures" />
            <Fact number="0" label="compte à créer pour vos clients" />
            <Fact number="3G" label="pensé pour les connexions lentes" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Fact({ number, label }: { number: string; label: string }) {
  return (
    <div className="factbig">
      <div className="factbig__num" style={{ color: "var(--accent)" }}>
        {number}
      </div>
      <div className="factbig__lbl" style={{ color: "var(--text-on-dark-muted)" }}>
        {label}
      </div>
    </div>
  );
}
