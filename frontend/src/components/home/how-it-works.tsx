const STEPS = [
  {
    title: "Vous choisissez la prestation",
    body: "Chaque prestation affiche son prix, sa durée et la façon dont elle se passe : sur place, en dépôt, ou chez vous.",
  },
  {
    title: "Vous prenez un créneau libre",
    body: "Seuls les horaires réellement disponibles sont proposés. Vous choisissez la personne si le salon en compte plusieurs.",
  },
  {
    title: "Vous gardez une référence",
    body: "Huit caractères, faciles à dicter au téléphone. Elle vous permet de déplacer ou d’annuler votre rendez-vous.",
  },
];

export function HowItWorks() {
  return (
    <section className="section section--surface atmo tex-dots">
      <div className="page">
        <div className="section-head">
          <div className="section-head__text">
            <p className="t-overline">Réserver</p>
            <h2 className="t-h2">Trois écrans, pas de compte</h2>
          </div>
        </div>
        <div className="howto" data-reveal-group>
          {STEPS.map((s) => (
            <div className="howto__item" key={s.title}>
              <h3 className="howto__title">{s.title}</h3>
              <p className="t-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
