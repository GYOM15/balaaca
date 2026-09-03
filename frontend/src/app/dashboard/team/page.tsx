import type { CSSProperties } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { Avatar, Badge, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import type { CurrentMember, ProviderProfile, StaffList, StaffView } from "@/lib/types";
import { addMember, invite, replaceMember, transferOwnership } from "./actions";

export const dynamic = "force-dynamic";

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire compose l’équipe.",
  // One sentence for both, because the API sends one code for both: a member
  // who can have no code minted for them and a team that would be left with
  // nobody bookable are the same INVALID_STATE_TRANSITION. Branching on codes
  // the catalogue does not publish is how these refusals used to read "la
  // demande n'a pas abouti" while the server knew exactly what was wrong.
  INVALID_STATE_TRANSITION:
    "Cette personne a déjà un compte, ou votre page resterait sans personne de réservable.",
  RESOURCE_NOT_FOUND: "Cette personne n’existe plus.",
  VALIDATION_FAILED: "Il faut un nom.",
};

/**
 * The transfer's refusals, kept apart from the ones above.
 *
 * <p>`VALIDATION_FAILED` does not mean here what it means on a name, and one
 * map keyed by code alone could only ever say one of the two. So the transfer
 * carries its own parameter and its own words.
 */
const TRANSFER_REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire peut céder le salon.",
  VALIDATION_FAILED:
    "Cette personne n’a pas encore de compte, ou ne travaille plus ici. Créez-lui un code de connexion, transmettez-le-lui, laissez-la se connecter, puis revenez.",
};

/** The dialog the appbar button opens. */
const ADD_DIALOG = "dlg-add-member";

/** The consequence list of a transfer, which the design spaces by hand. */
const CONSEQUENCES = {
  "--stack-gap": "var(--s-2)",
  marginTop: "var(--s-4)",
} as CSSProperties;

const CONSEQUENCE_ROW: CSSProperties = { alignItems: "flex-start", gap: "var(--s-3)" };

const CONSEQUENCE_ICON: CSSProperties = { color: "var(--danger)", marginTop: "2px" };

/**
 * Where a code is spent.
 *
 * <p>Written once because the owner sends it as often as he sends the code -
 * the code alone is unusable by somebody who does not know what to do with it.
 */
const JOIN = `${env.publicOrigin}/rejoindre`;

/**
 * The people who work here.
 *
 * <p>Nobody is deleted. Someone who has left is marked inactive, because
 * removing the row would take their appointments' history with it and the
 * salon would lose the record of who saw which customer.
 */
export default async function Team({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    invited?: string;
    name?: string;
    until?: string;
    transfer?: string;
    given?: string;
  }>;
}) {
  const query = await searchParams;
  // The profile is read for one sentence: the transfer warning names the
  // business being handed over, which is the whole point of reading it twice
  // before pressing the button.
  const [me, team, provider] = await Promise.all([
    api<CurrentMember>("/v1/me"),
    api<StaffList>("/v1/staff"),
    api<ProviderProfile>("/v1/provider-profile"),
  ]);

  // The zone is the business's, because the seven days a code lasts are counted
  // in the days the owner works, not in the browser's.
  const until = readDay(query.until, provider.timezone);

  const bookable = team.data.filter((p) => p.active && p.bookable).length;
  const size = team.data.length;

  // Who the salon can go to. Active, and not the caller: the API refuses a
  // departed colleague and refuses the owner naming themselves. The third
  // condition is having an account, which StaffView does not carry - so it is
  // named by the refusal rather than guessed at by a screen that would be
  // wrong either way round.
  const candidates =
    me.role === "OWNER"
      ? team.data.filter((p) => p.active && p.staff_id !== me.staff_id)
      : [];
  const transferable = new Set(candidates.map((p) => p.staff_id));

  return (
    <>
      <div className="appbar">
        <div className="appbar__in">
          <a
            className="btn btn--ghost btn--icon btn--sm hide-lg"
            href="#sections"
            aria-label="Menu"
          >
            <Icon name="menu" />
          </a>
          <div>
            <h1 className="appbar__title">Équipe</h1>
            <div className="appbar__sub">
              {size} personne{size > 1 ? "s" : ""} · {bookable} réservable
              {bookable > 1 ? "s" : ""}
            </div>
          </div>
          <div className="appbar__actions">
            <button
              className="btn btn--primary btn--sm"
              type="button"
              data-dialog-open={ADD_DIALOG}
            >
              <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                <Icon name="user-plus" size={18} />
              </span>
              <span className="btn__label--idle">Ajouter quelqu’un</span>
            </button>
          </div>
        </div>
      </div>

      <main id="contenu" className="app__main has-tabbar">
        <div className="app__inner">
          {query.error ? (
            <div style={{ marginBottom: "var(--s-5)" }}>
              <Notice tone="danger" title="La modification n’a pas abouti">
                {REFUSALS[query.error] ?? "Réessayez, ou rechargez la page."}
              </Notice>
            </div>
          ) : null}

          {query.transfer ? (
            <div style={{ marginBottom: "var(--s-5)" }}>
              <Notice tone="danger" title="Le salon n’a pas changé de mains">
                {TRANSFER_REFUSALS[query.transfer] ?? "Réessayez, ou rechargez la page."}
              </Notice>
            </div>
          ) : null}

          {query.given ? (
            <div style={{ marginBottom: "var(--s-5)" }}>
              <Notice tone="success" title="Le salon a changé de propriétaire">
                {query.given} est désormais propriétaire. Vous gardez votre chaise, vos
                horaires et vos rendez-vous, mais seul {query.given} peut vous rendre le
                salon.
              </Notice>
            </div>
          ) : null}

          {query.invited ? (
            <div style={{ marginBottom: "var(--s-5)" }}>
              {/* Declared where the code is in scope. `code` is base64url, which
                  uses + and / in its standard form but not in the URL-safe one
                  the platform mints - it is still encoded, because a query
                  value that is only safe by accident is a bug waiting for the
                  day somebody changes the alphabet. */}
              <Notice
                tone="success"
                title="Le code est prêt, à vous de le transmettre"
                icon="shield"
              >
                Rien n’a été envoyé. Copiez ce lien et donnez-le à{" "}
                {query.name ?? "cette personne"}.
                {/* One link, not a code and an address. It carries the code in
                    its query, so the person receiving it taps once and types
                    nothing - which is the whole reason the code stayed long.
                    /rejoindre reads `code` and prefills the field, so a link
                    that is retyped by hand still works. */}
                <div className="publink" style={{ marginTop: "var(--s-3)" }}>
                  <span className="publink__url">
                    {`${JOIN}?code=${encodeURIComponent(query.invited)}`}
                  </span>
                  <button
                    className="btn btn--ghost btn--sm btn--icon"
                    type="button"
                    data-copy={`${JOIN}?code=${encodeURIComponent(query.invited)}`}
                    aria-label="Copier le lien d’invitation"
                  >
                    <Icon name="copy" size={18} className="btn__icon--idle" />
                  </button>
                </div>
                <div className="t-xs" style={{ marginTop: "var(--s-3)" }}>
                  Affiché une seule fois
                  {until ? `, et valable jusqu’au ${until}` : ""}. En créer un autre
                  remplace celui-ci : c’est aussi comme ça qu’on le révoque.
                </div>
              </Notice>
            </div>
          ) : null}

          <div className="panel">
            <div className="list" style={{ borderTop: 0 }}>
              {team.data.map((person) => (
                <div
                  className="list__item"
                  style={{ alignItems: "flex-start" }}
                  key={person.staff_id}
                >
                  <Avatar name={person.display_name} />
                  <div className="grow">
                    <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
                      <span className="t-strong" style={{ fontSize: "var(--fs-sm)" }}>
                        {person.display_name}
                      </span>
                      {person.role === "OWNER" ? (
                        <Badge label="Propriétaire" tone="brand" icon="shield" />
                      ) : null}
                      {person.active ? (
                        <Badge label="Actif" tone="success" icon="check-circle" />
                      ) : (
                        <Badge label="A quitté" tone="neutral" icon="ban" />
                      )}
                      {person.bookable ? (
                        <Badge label="Réservable" tone="neutral" icon="calendar-check" />
                      ) : (
                        <Badge label="Non réservable" tone="neutral" icon="eye-off" />
                      )}
                    </div>
                    {/* The design prints a trade under the name - "Coiffeuse ·
                        tissages". Nothing stores one, so the line says the one
                        thing that is stored about a chair. */}
                    <div className="t-xs" style={{ marginTop: "var(--s-2)" }}>
                      {person.role === "OWNER"
                        ? "Propriétaire de l’établissement"
                        : "Membre de l’équipe"}
                    </div>
                  </div>

                  <details className="menu">
                    <summary
                      className="btn btn--ghost btn--icon btn--sm"
                      aria-label={`Actions sur ${person.display_name}`}
                    >
                      <Icon name="more-v" size={18} />
                    </summary>
                    <div className="menu__panel">
                      <button
                        className="menu__item"
                        type="button"
                        data-dialog-open={`dlg-edit-${person.staff_id}`}
                      >
                        <Icon name="pencil" size={18} /> Modifier
                      </button>

                      <Link
                        className="menu__item"
                        href={`/dashboard/hours?staff=${encodeURIComponent(person.staff_id)}`}
                      >
                        <Icon name="calendar" size={18} /> Horaires de cette personne
                      </Link>

                      {/* The diary has filtered by person the whole time and the
                          owner could not find it. The question is asked from
                          here - looking at Fanta, wondering what Fanta has
                          today - so the answer is offered from here. */}
                      <Link
                        className="menu__item"
                        href={`/dashboard?staff=${encodeURIComponent(person.staff_id)}`}
                      >
                        <Icon name="calendar-check" size={18} /> Rendez-vous de cette
                        personne
                      </Link>

                      {person.role === "OWNER" ? null : (
                        <form action={invite}>
                          <input type="hidden" name="id" value={person.staff_id} />
                          <input type="hidden" name="name" value={person.display_name} />
                          <button className="menu__item" type="submit">
                            <Icon name="lock" size={18} /> Créer son code de connexion
                          </button>
                        </form>
                      )}

                      {transferable.has(person.staff_id) || canDeactivate(person) ? (
                        <span className="menu__sep" />
                      ) : null}

                      {transferable.has(person.staff_id) ? (
                        <button
                          className="menu__item"
                          type="button"
                          data-dialog-open={`dlg-own-${person.staff_id}`}
                        >
                          <Icon name="shield" size={18} /> Céder la propriété
                        </button>
                      ) : null}

                      {canDeactivate(person) ? (
                        <button
                          className="menu__item menu__item--danger"
                          type="button"
                          data-dialog-open={`dlg-off-${person.staff_id}`}
                        >
                          <Icon name="ban" size={18} /> Désactiver
                        </button>
                      ) : null}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "var(--s-6)" }}>
            <Notice
              tone="info"
              title="Une personne « réservable » apparaît dans le choix du client"
            >
              Une apprentie ou une gérante qui ne prend pas de rendez-vous peut rester
              dans l’équipe sans être proposée à la réservation.
            </Notice>
          </div>

          <dialog className="dialog" id={ADD_DIALOG}>
            <div className="dialog__inner">
              <div className="dialog__head">
                <h2 className="dialog__title">Ajouter quelqu’un</h2>
              </div>
              <form action={addMember}>
                {/* The chair is created active. The design's dialog has no
                    switch for it, and a person added inactive would be added
                    to nothing. */}
                <input type="hidden" name="active" value="on" />
                <div className="dialog__body">
                  <p>
                    <strong className="t-strong">Rien ne lui sera envoyé.</strong>{" "}
                    Ajoutez la personne ici, puis créez son code depuis sa ligne et
                    transmettez-le. À saisir sur {JOIN}.
                  </p>
                  <div style={{ marginTop: "var(--s-5)" }}>
                    <div className="field">
                      <label className="field__label" htmlFor="add-name">
                        Nom
                        <span className="field__req" aria-hidden="true">
                          *
                        </span>
                      </label>
                      <input
                        className="input"
                        type="text"
                        id="add-name"
                        name="display_name"
                        placeholder="Fanta Diallo"
                        maxLength={120}
                        required
                      />
                      <p className="field__hint">
                        C’est ce nom que vos clientes verront au moment de choisir
                        une personne.
                      </p>
                    </div>
                    <label className="check" style={{ marginTop: "var(--s-4)" }}>
                      <input type="checkbox" name="bookable" defaultChecked />
                      <span className="check__box">
                        <Icon name="check" />
                      </span>
                      <span className="check__text">
                        <strong>Réservable par les clients</strong>
                        <span>Elle apparaîtra au moment de choisir une personne.</span>
                      </span>
                    </label>
                  </div>
                </div>
                <div className="dialog__foot">
                  <button className="btn btn--secondary" type="button" data-dialog-close>
                    <span className="btn__label--idle">Annuler</span>
                  </button>
                  <button className="btn btn--primary" type="submit">
                    <span className="btn__label--idle">Ajouter</span>
                  </button>
                </div>
              </form>
            </div>
          </dialog>

          {team.data.map((person) => (
            <dialog
              className="dialog"
              id={`dlg-edit-${person.staff_id}`}
              key={person.staff_id}
            >
              <div className="dialog__inner">
                <div className="dialog__head">
                  <h2 className="dialog__title">{person.display_name}</h2>
                </div>
                <form action={replaceMember}>
                  <input type="hidden" name="id" value={person.staff_id} />
                  <div className="dialog__body">
                    <div className="field">
                      <label
                        className="field__label"
                        htmlFor={`edit-${person.staff_id}-name`}
                      >
                        Nom
                        <span className="field__req" aria-hidden="true">
                          *
                        </span>
                      </label>
                      <input
                        className="input"
                        type="text"
                        id={`edit-${person.staff_id}-name`}
                        name="display_name"
                        placeholder="Fanta Diallo"
                        maxLength={120}
                        required
                        defaultValue={person.display_name}
                      />
                    </div>

                    <label className="check" style={{ marginTop: "var(--s-4)" }}>
                      <input
                        type="checkbox"
                        name="bookable"
                        defaultChecked={person.bookable}
                      />
                      <span className="check__box">
                        <Icon name="check" />
                      </span>
                      <span className="check__text">
                        <strong>Réservable par les clients</strong>
                        <span>Elle apparaîtra au moment de choisir une personne.</span>
                      </span>
                    </label>

                    <label className="check" style={{ marginTop: "var(--s-4)" }}>
                      <input type="checkbox" name="active" defaultChecked={person.active} />
                      <span className="check__box">
                        <Icon name="check" />
                      </span>
                      <span className="check__text">
                        <strong>Travaille ici</strong>
                        <span>
                          Décochée pour quelqu’un qui est parti. Ses rendez-vous passés
                          restent, et son accès s’arrête à la requête suivante.
                        </span>
                      </span>
                    </label>
                  </div>
                  <div className="dialog__foot">
                    <button className="btn btn--secondary" type="button" data-dialog-close>
                      <span className="btn__label--idle">Annuler</span>
                    </button>
                    <button className="btn btn--primary" type="submit">
                      <span className="btn__label--idle">Enregistrer</span>
                    </button>
                  </div>
                </form>
              </div>
            </dialog>
          ))}

          {/* Behind a dialog, and the consequences are read before the button is
              reachable. Nothing else on this page is irreversible from the
              caller's side: only the new owner can hand the salon back. */}
          {candidates.map((person) => (
            <dialog
              className="dialog"
              id={`dlg-own-${person.staff_id}`}
              key={person.staff_id}
            >
              <div className="dialog__inner">
                <div className="dialog__head">
                  <h2 className="dialog__title">
                    Céder la propriété de l’établissement&nbsp;?
                  </h2>
                </div>
                <form action={transferOwnership}>
                  <input type="hidden" name="id" value={person.staff_id} />
                  <input type="hidden" name="name" value={person.display_name} />
                  <div className="dialog__body">
                    <p>
                      <strong>
                        Cette action est définitive et vous ne pourrez pas l’annuler
                        vous-même.
                      </strong>
                    </p>
                    <ul className="stack" style={CONSEQUENCES}>
                      <li className="row" style={CONSEQUENCE_ROW}>
                        <span style={CONSEQUENCE_ICON}>
                          <Icon name="alert-circle" size={16} />
                        </span>
                        <span className="t-sm">
                          {person.display_name} deviendra propriétaire de{" "}
                          {provider.business_name}.
                        </span>
                      </li>
                      <li className="row" style={CONSEQUENCE_ROW}>
                        <span style={CONSEQUENCE_ICON}>
                          <Icon name="alert-circle" size={16} />
                        </span>
                        <span className="t-sm">
                          Vous deviendrez un membre ordinaire de l’équipe.
                        </span>
                      </li>
                      <li className="row" style={CONSEQUENCE_ROW}>
                        <span style={CONSEQUENCE_ICON}>
                          <Icon name="alert-circle" size={16} />
                        </span>
                        <span className="t-sm">
                          Vous perdrez l’accès au catalogue, à l’équipe et à la
                          publication.
                        </span>
                      </li>
                      <li className="row" style={CONSEQUENCE_ROW}>
                        <span style={CONSEQUENCE_ICON}>
                          <Icon name="alert-circle" size={16} />
                        </span>
                        <span className="t-sm">
                          Seul le nouveau propriétaire pourra vous rendre ces droits.
                        </span>
                      </li>
                    </ul>
                    <div style={{ marginTop: "var(--s-5)" }}>
                      <div className="field">
                        <label
                          className="field__label"
                          htmlFor={`confirm-${person.staff_id}`}
                        >
                          Écrivez CÉDER pour confirmer
                          <span className="field__req" aria-hidden="true">
                            *
                          </span>
                        </label>
                        {/* A gate for the hand, not for the server: the API takes no
                            confirmation word, so this only slows a misplaced tap. */}
                        <input
                          className="input"
                          type="text"
                          id={`confirm-${person.staff_id}`}
                          name="confirm"
                          placeholder="CÉDER"
                          autoComplete="off"
                          required
                          pattern="[Cc][ÉéEe][Dd][Ee][Rr]"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="dialog__foot">
                    <button className="btn btn--secondary" type="button" data-dialog-close>
                      <span className="btn__label--idle">Ne rien changer</span>
                    </button>
                    <button className="btn btn--danger" type="submit">
                      <span className="btn__label--idle">Céder la propriété</span>
                    </button>
                  </div>
                </form>
              </div>
            </dialog>
          ))}

          {team.data.filter(canDeactivate).map((person) => (
            <dialog
              className="dialog"
              id={`dlg-off-${person.staff_id}`}
              key={person.staff_id}
            >
              <div className="dialog__inner">
                <div className="dialog__head">
                  <h2 className="dialog__title">Désactiver cette personne&nbsp;?</h2>
                </div>
                <form action={replaceMember}>
                  <input type="hidden" name="id" value={person.staff_id} />
                  <input type="hidden" name="display_name" value={person.display_name} />
                  {/* The same PUT as the edit dialog, and not the same news.
                      Said here rather than guessed from `active`, which the
                      edit dialog can switch off too. */}
                  <input type="hidden" name="intent" value="deactivate" />
                  {/* The PUT replaces the whole row, so what is not meant to change
                      travels with it. `active` is left out on purpose: absent is
                      false, and false is the whole point of this form. */}
                  {person.bookable ? (
                    <input type="hidden" name="bookable" value="on" />
                  ) : null}
                  <div className="dialog__body">
                    <p>
                      Elle ne pourra plus se connecter et disparaîtra du choix proposé
                      aux clients.{" "}
                      <strong>Ses rendez-vous à venir ne sont pas annulés</strong>. Pensez
                      à les réattribuer depuis l’agenda.
                    </p>
                  </div>
                  <div className="dialog__foot">
                    <button className="btn btn--secondary" type="button" data-dialog-close>
                      <span className="btn__label--idle">Annuler</span>
                    </button>
                    <button className="btn btn--danger" type="submit">
                      <span className="btn__label--idle">Désactiver</span>
                    </button>
                  </div>
                </form>
              </div>
            </dialog>
          ))}
        </div>
      </main>
    </>
  );
}

/**
 * The shortcut is offered to everyone but the owner.
 *
 * <p>Not because the API forbids it - the edit dialog still carries the switch,
 * as it always has - but because a salon with no owner is nobody's intention,
 * and an owner leaving hands the salon over first.
 */
function canDeactivate(person: StaffView): boolean {
  return person.active && person.role !== "OWNER";
}

/**
 * The day a code stops working, or nothing at all.
 *
 * <p>The instant comes off the URL, so it is whatever the browser sent, and an
 * unparseable one throws out of Intl - taking down the one screen whose whole
 * job at that moment is to show a code that is shown once.
 */
function readDay(instant: string | undefined, timeZone: string): string | null {
  if (!instant) return null;
  const at = new Date(instant);
  return Number.isNaN(at.getTime())
    ? null
    : new Intl.DateTimeFormat("fr", { dateStyle: "long", timeZone }).format(at);
}
