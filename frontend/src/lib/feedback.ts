import { redirect } from "next/navigation";

/**
 * The other half of `?error=`.
 *
 * <p>Eleven server actions could tell a provider they had been refused and not
 * one could tell them they had been heard. A save redirected back to a screen
 * that looked identical to the one they submitted, which is indistinguishable
 * from a save that did nothing - so the first thing the owner asked, testing
 * his own product, was why nothing ever says it worked.
 *
 * <p>Success travels the way a refusal already travels: one parameter on the
 * URL the action lands on. Nothing new to learn, and the back button, a reload
 * and a shared link behave the way they already do for a refusal.
 */
export const SUCCESS_PARAM = "ok";

/**
 * When that success was raised, base 36, and it is not decoration.
 *
 * <p>A refusal is rendered into the page, so an identical refusal twice in a
 * row is drawn twice. A toast is raised from the browser when the URL changes,
 * and confirming one appointment after another lands on the SAME URL every
 * time - `?ok=APPOINTMENT_CONFIRMED` again, on the same day's diary. Nothing
 * changed, so nothing re-renders, and the provider confirming five bookings in
 * a row would be told about the first one only.
 *
 * <p>Subordinate to `ok` and named for it, the way `report_error` is named for
 * `report`. Read by the toast region and by nothing else: `ok` stays the bare
 * code, so a screen that would rather draw its confirmation than raise it can
 * still branch on it.
 */
export const SUCCESS_AT_PARAM = "ok_at";

/**
 * What happened, named.
 *
 * <p>Keyed like the screens' REFUSALS maps and deliberately unlike them in one
 * respect: a refusal key is a code the contract publishes, while nothing
 * published says what SUCCEEDED, so these are this application's own. The union
 * below is what closes them - a code with no sentence here is a compile error
 * rather than a toast the provider never sees.
 *
 * <p>Every sentence names the thing that changed. "Enregistré" would be true of
 * any button on any of these screens, and a confirmation that could have come
 * from anywhere is worth about as much as no confirmation at all.
 */
export const SUCCESSES = {
  /* The agenda. */
  APPOINTMENT_CONFIRMED: "Le rendez-vous est confirmé.",
  APPOINTMENT_COMPLETED: "Le rendez-vous est marqué terminé.",
  APPOINTMENT_NO_SHOW: "Le rendez-vous est marqué comme absence.",
  APPOINTMENT_CANCELLED: "Le rendez-vous est annulé.",
  APPOINTMENT_RESCHEDULED: "Le rendez-vous est déplacé.",
  WALK_IN_BOOKED: "Le rendez-vous est inscrit à l’agenda.",

  /* Opening hours, and the three kinds of exception to them. */
  HOURS_SAVED: "Les horaires sont à jour.",
  TIME_OFF_ADDED: "L’absence est enregistrée.",
  CUSTOM_HOURS_ADDED: "Les horaires exceptionnels sont enregistrés.",
  DAY_CLOSED: "La journée est fermée.",
  CLOSURE_REMOVED: "L’exception est supprimée.",

  /* The public page, and the rules the diary runs on. */
  PROFILE_SAVED: "Votre page publique est à jour.",
  PROFILE_PUBLISHED: "Votre page est en ligne.",
  PROFILE_UNPUBLISHED: "Votre page est retirée de l’annuaire.",
  POLICY_SAVED: "Vos règles de réservation sont à jour.",
  LOGO_SAVED: "Le logo est enregistré.",
  COVER_SAVED: "La photo de couverture est enregistrée.",

  /* Services. */
  SERVICE_CREATED: "La prestation est créée.",
  SERVICE_SAVED: "La prestation est à jour.",
  SERVICE_PUBLISHED: "La prestation est publiée.",
  SERVICE_UNPUBLISHED: "La prestation est retirée de votre page.",
  PERFORMERS_SAVED: "Les personnes qui réalisent cette prestation sont à jour.",
  PHOTO_ADDED: "La photo est ajoutée à la prestation.",
  PHOTO_REMOVED: "La photo est retirée de la prestation.",

  /* The team. */
  MEMBER_ADDED: "La personne est ajoutée à l’équipe.",
  MEMBER_SAVED: "La fiche de cette personne est à jour.",
  MEMBER_DEACTIVATED: "Cette personne ne peut plus se connecter ni être réservée.",
  OWNERSHIP_TRANSFERRED: "L’établissement a changé de propriétaire.",

  /* Customers. */
  NOTES_SAVED: "Votre note sur ce client est enregistrée.",

  /* What a provider sends to the platform about their own suspension. */
  CONTESTATION_SENT: "Votre contestation est transmise.",

  /* Moderation. */
  REPORT_REVIEWED: "Le signalement est traité.",
  CONTESTATION_READ: "La contestation est marquée lue.",
  PROVIDER_SUSPENDED: "Le professionnel est suspendu.",
  PROVIDER_REINSTATED: "Le professionnel est rétabli.",
} as const;

export type SuccessCode = keyof typeof SUCCESSES;

/**
 * Ends a server action on the screen the provider should land on, carrying the
 * confirmation to show when they get there.
 *
 * <p>The mirror of the refusal line one `catch` above it, and it throws exactly
 * as `redirect` does, so it is the last statement of the action and never the
 * middle of one. `revalidatePath` still belongs before it: this decides what
 * the reader is told, not what the reader is shown.
 *
 * <p>`path` is the whole destination, query and fragment included, because two
 * screens already need both - the diary must come back to the days it was being
 * read on, and the photographs panel scrolls to the service it belongs to. So
 * the address is parsed rather than concatenated: a fragment folded into the
 * query loses that scroll and corrupts a parameter with it.
 *
 * <p>The base is a fiction and none of it survives - only the path, the query
 * and the fragment are written back out, which is also what makes it impossible
 * for this to send anybody off this origin.
 */
export function succeed(path: string, code: SuccessCode): never {
  const url = new URL(path, "https://balaaca.invalid");
  url.searchParams.set(SUCCESS_PARAM, code);
  url.searchParams.set(SUCCESS_AT_PARAM, Date.now().toString(36));
  return redirect(`${url.pathname}${url.search}${url.hash}`);
}
