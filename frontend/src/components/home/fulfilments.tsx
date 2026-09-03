import { Icon } from "@/components/icon";
import { stackGap } from "./fields";

/**
 * The three ways a service is delivered, as `Fulfilment` names them.
 *
 * <p>Copy, not data: the enum is closed in the contract and these three are the
 * whole of it, so a section explaining them cannot go stale without the
 * contract going with it.
 */
const FULFILMENTS = [
  {
    icon: "mode-onsite",
    title: "Sur place",
    body: "Vous vous rendez chez le prestataire et la prestation est réalisée pendant que vous attendez.",
  },
  {
    icon: "mode-dropoff",
    title: "Dépôt",
    body: "Vous déposez l’article, vous repassez le récupérer une fois le travail terminé.",
  },
  {
    icon: "mode-atcustomer",
    title: "À domicile",
    body: "Le prestataire se déplace jusqu’à l’adresse que vous indiquez.",
  },
];

export function Fulfilments() {
  return (
    <section
      className="section section--surface atmo tex-dots"
      style={{ paddingBlock: "var(--s-12)" }}
    >
      <div className="page">
        <div className="cols cols--2" style={{ gap: "var(--s-6)" }}>
          <div>
            <p className="t-overline t-overline--accent">Ce qui change tout</p>
            <h2 className="t-h3" style={{ marginTop: "var(--s-2)", maxWidth: "22ch" }}>
              Sur chaque prestation, vous savez comment ça se passe.
            </h2>
          </div>
          <div className="stack" style={stackGap("var(--s-3)")} data-reveal-group>
            {FULFILMENTS.map((f) => (
              <div
                key={f.icon}
                className="row"
                style={{ alignItems: "flex-start", gap: "var(--s-4)" }}
              >
                <span className="choice__icon">
                  <Icon name={f.icon} />
                </span>
                <div>
                  <div className="t-strong">{f.title}</div>
                  <p className="t-sm" style={{ marginTop: 2 }}>
                    {f.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
