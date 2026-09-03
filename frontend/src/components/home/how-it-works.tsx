/**
 * The third step counted the booking reference at eight characters, which was
 * true of nothing: it was forty-three of base64url, and the contract has since
 * made it the business's three initials, an optional hyphen and six characters
 * drawn from an alphabet with 0, O, 1, I and L removed - nine or ten in all.
 * A promise about a reference is a promise the customer checks the moment they
 * are given one, so it says what it is now rather than a figure.
 */
const STEPS = [
  {
    title: "Vous choisissez la prestation",
    body: "Chaque prestation affiche son prix, sa durée et la façon dont elle se passe : sur place, en dépôt, ou chez vous.",
  },
  {
    title: "Vous prenez un créneau libre",
    body: "Seuls les horaires réellement disponibles sont proposés. Vous choisissez la personne si le salon en compte plusieurs.",
  },
  {
    title: "Vous gardez une référence",
    body: "Les initiales du professionnel et six caractères, choisis pour être faciles à dicter au téléphone. Elle vous permet de déplacer ou d’annuler votre rendez-vous.",
  },
];

/**
 * The light that runs 1 -> 2 -> 3.
 *
 * <p>Here and not in globals.css because globals.css is the design system,
 * byte-identical to the prototype and asserted against the Keycloak theme's
 * copy of its tokens; this is one section's own behaviour on one route, and it
 * has no second call site to justify a system-wide rule. It is scoped by
 * `.howto--lit` so nothing else can pick it up, and it borrows the system's
 * tokens rather than restating any value it already names.
 *
 * <p>The rest state is declared in the rules and the light is added by the
 * animations. Switching the animations off - which is what a reader asking for
 * reduced motion gets - therefore leaves a finished design: numbers in circles
 * on a drawn rail, standing still.
 *
 * <p>The two pseudo-elements are the ones the system already spends on this
 * component, the number and the rail beside it, so this restyles them rather
 * than adding markup. There is no third to spend, and no script either: this
 * is a server component.
 */
const TRAVELLING_LIGHT = `
.howto--lit {
  /* One full pass, split evenly between the three steps. No token for it: the
     duration scale tops out at 240 ms, which is the pace of an interface
     answering a tap, not of something a reader is meant to watch travel. */
  --lit-pass: 5.4s;
  --lit-step: 0s;
}
.howto--lit .howto__item { padding-top: var(--s-12); }
.howto--lit .howto__item:nth-child(2) { --lit-step: calc(var(--lit-pass) / 3); }
.howto--lit .howto__item:nth-child(3) { --lit-step: calc(var(--lit-pass) / 3 * 2); }

.howto--lit .howto__item::before {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--r-circle);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  font-size: var(--fs-sm);
  color: var(--text-tertiary);
  animation: bal-howto-glow var(--lit-pass) var(--ease-out) var(--lit-step) infinite;
}

/* The rail leaves the circle at its middle and carries the light to the next
   number, which is why it starts one circle-radius down rather than at --s-2.
   The light is a bright core in a warm halo; --accent alone reads as nothing
   at two pixels against --border, which is a warm light beige itself. */
.howto--lit .howto__item::after {
  top: calc(1.25rem - 1px);
  height: 2px;
  background:
    linear-gradient(90deg,
      transparent,
      var(--accent) 35%,
      var(--accent-strong) 50%,
      var(--accent) 65%,
      transparent) no-repeat,
    var(--border);
  background-size: 38% 100%;
  background-position: -70% 0;
  animation: bal-howto-travel var(--lit-pass) var(--lit-step) infinite;
}

@keyframes bal-howto-glow {
  0% { border-color: var(--border-strong); color: var(--text-tertiary); box-shadow: 0 0 0 0 var(--accent-soft); }
  6%, 30% { border-color: var(--accent); color: var(--accent-strong); box-shadow: 0 0 0 5px var(--accent-soft); }
  42%, 100% { border-color: var(--border-strong); color: var(--text-tertiary); box-shadow: 0 0 0 0 var(--accent-soft); }
}

/* Out of the circle once it is lit, and off the far end at 33.334% - which is
   the instant the next number lights, so the two read as one handover.
   Linear, and it is the one place --ease-out is refused: the system's easing
   is tuned for an interface answering a tap, and a light that covers most of
   the rail in its first quarter-second is a flash rather than a journey. */
@keyframes bal-howto-travel {
  0%, 6% { background-position: -70% 0; animation-timing-function: linear; }
  33.334%, 100% { background-position: 170% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .howto--lit .howto__item::before,
  .howto--lit .howto__item::after { animation: none; }
}
`;

export function HowItWorks() {
  return (
    <section className="section section--surface atmo tex-dots">
      <style dangerouslySetInnerHTML={{ __html: TRAVELLING_LIGHT }} />
      <div className="page">
        <div className="section-head">
          <div className="section-head__text">
            <p className="t-overline">Réserver</p>
            <h2 className="t-h2">Trois écrans, pas de compte</h2>
          </div>
        </div>
        <div className="howto howto--lit" data-reveal-group>
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
