/**
 * The four selections, and the words that go with them.
 *
 * <p>EDITORIAL, not data. There is no collections endpoint and there should not
 * be one: a selection is a sentence about an occasion plus a handful of trade
 * slugs, and the API already publishes the trades. What a table would add is a
 * second place to edit French copy, and a migration for every comma.
 *
 * <p>The design names its selections in English. This application's public
 * paths are French, so each one is transliterated once, here, and nowhere else:
 *
 * <pre>
 *   wedding         ->  /idees/mariage
 *   back-to-school  ->  /idees/rentree
 *   home-repair     ->  /idees/panne-maison
 *   vehicle         ->  /idees/vehicule
 * </pre>
 *
 * <p>`trades` holds `category_slug` values, in the order the chips are drawn.
 * One that `GET /v1/categories` no longer publishes is dropped by the pages
 * rather than drawn: a chip with no label is a promise the taxonomy has stopped
 * keeping.
 */

export type Collection = {
  /** The last segment of `/idees/[slug]`. */
  slug: string;
  /** Its rank in the list, as the index announces it. */
  eyebrow: string;
  title: string;
  lead: string;
  /** The sprite drawing this selection is illustrated by, without its `s-`. */
  scene: string;
  /** `category_slug` values, in the order the chips are drawn. */
  trades: readonly string[];
};

export const COLLECTIONS: readonly Collection[] = [
  {
    slug: "mariage",
    eyebrow: "Sélection 01",
    title: "Préparer un mariage",
    lead: "Le photographe, le traiteur, la salle, le DJ et la décoration, au même endroit, avec les disponibilités de chacun.",
    scene: "photographer",
    trades: [
      "photographie",
      "traiteur",
      "location-salle",
      "dj-animation",
      "decoration-evenementielle",
      "fleuriste",
      "video",
      "maquillage",
    ],
  },
  {
    slug: "rentree",
    eyebrow: "Sélection 02",
    title: "La rentrée",
    lead: "Uniformes cousus sur mesure, cours de soutien et cours de langues avant la reprise.",
    scene: "tailor",
    trades: ["couture", "cours-particuliers", "cours-langues", "formation-professionnelle"],
  },
  {
    slug: "panne-maison",
    eyebrow: "Sélection 03",
    title: "Une panne à la maison",
    lead: "Plomberie, climatisation, électricité, énergie solaire : quelqu’un se déplace chez vous.",
    scene: "tools",
    trades: [
      "plomberie",
      "climatisation",
      "electricite",
      "energie-solaire",
      "reparation-telephone",
    ],
  },
  {
    slug: "vehicule",
    eyebrow: "Sélection 04",
    title: "Votre véhicule",
    lead: "Révision, lavage, réparation moto ou location : déposez le matin, récupérez le soir.",
    scene: "mechanic",
    trades: ["mecanique-auto", "mecanique-moto", "lavage-auto", "location-vehicule", "auto-ecole"],
  },
];

/**
 * The heading over a trade's own section of a selection.
 *
 * <p>The design writes the people rather than the trade - "Photographes
 * disponibles" over `photographie`, "Garages auto disponibles" over
 * `mecanique-auto`. That is a French plural of an agent noun, and no rule
 * derives it from a label, so every heading the design wrote is kept here.
 *
 * <p>Keyed by slug and not by label on purpose: `label_fr` belongs to the
 * catalogue and has already chosen different words for three of these -
 * "Solaire et groupes", "Repetiteur et cours", "Formation pro". A trade added
 * to a selection later falls back to its own name, which reads.
 */
const HEADINGS: Record<string, string> = {
  photographie: "Photographes disponibles",
  traiteur: "Traiteurs disponibles",
  "location-salle": "Salles de réception disponibles",
  "dj-animation": "DJ & animation disponibles",
  "decoration-evenementielle": "Décoration événementielle disponibles",
  fleuriste: "Fleuristes disponibles",
  video: "Vidéastes disponibles",
  maquillage: "Maquilleuses disponibles",
  couture: "Ateliers de couture disponibles",
  "cours-particuliers": "Cours particuliers disponibles",
  "cours-langues": "Cours de langues disponibles",
  "formation-professionnelle": "Formations professionnelles disponibles",
  plomberie: "Plombiers disponibles",
  climatisation: "Froid & climatisation disponibles",
  electricite: "Électriciens disponibles",
  "energie-solaire": "Énergie solaire disponibles",
  "reparation-telephone": "Réparation de téléphones disponibles",
  "mecanique-auto": "Garages auto disponibles",
  "mecanique-moto": "Mécaniciens moto disponibles",
  "lavage-auto": "Lavage auto disponibles",
  "location-vehicule": "Location de véhicules disponibles",
  "auto-ecole": "Auto-écoles disponibles",
};

export function tradeHeading(slug: string, labelFr: string): string {
  return HEADINGS[slug] ?? `${labelFr} disponibles`;
}
