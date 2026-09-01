import type { CSSProperties } from "react";
import { Icon } from "@/components/icon";
import { Avatar, Badge, EmptyState, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import type { CurrentMember, StaffList, StaffView } from "@/lib/types";
import { addMember, invite, replaceMember, transferOwnership } from "./actions";

export const dynamic = "force-dynamic";

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire compose l'équipe.",
  // One sentence for both, because the API sends one code for both: a member
  // who cannot be invited and a team that would be left with nobody bookable
  // are the same INVALID_STATE_TRANSITION. Branching on codes the catalogue
  // does not publish is how these refusals used to read "la demande n'a pas
  // abouti" while the server knew exactly what was wrong.
  INVALID_STATE_TRANSITION:
    "Cette personne ne peut pas être invitée, ou votre page resterait sans personne de réservable.",
  RESOURCE_NOT_FOUND: "Cette personne n'existe plus.",
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
    "Cette personne n'a pas encore de compte, ou ne travaille plus ici. Créez-lui un code d'accès, laissez-la se connecter, puis revenez.",
};

/** The consequence list of a transfer, which the mockup spaces by hand. */
const CONSEQUENCES = {
  "--stack-gap": "var(--s-2)",
  marginTop: "var(--s-4)",
} as CSSProperties;

const CONSEQUENCE_ROW: CSSProperties = { alignItems: "flex-start", gap: "var(--s-3)" };

const CONSEQUENCE_ICON: CSSProperties = { color: "var(--danger)", marginTop: "2px" };

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
    transfer?: string;
    given?: string;
  }>;
}) {
  const query = await searchParams;
  const [me, team] = await Promise.all([
    api<CurrentMember>("/v1/me"),
    api<StaffList>("/v1/staff"),
  ]);

  const bookable = team.data.filter((p) => p.active && p.bookable).length;
  const size = team.data.length;

  // Who the salon can go to. Active, and not the caller: the API refuses a
  // departed colleague and refuses the owner naming themselves. The third
  // condition is having an account, which StaffView does not carry - so it is
  // said in words below and named again by the refusal, rather than guessed at
  // by a screen that would be wrong either way round.
  const candidates =
    me.role === "OWNER"
      ? team.data.filter((p) => p.active && p.staff_id !== me.staff_id)
      : [];
  const transferable = new Set(candidates.map((p) => p.staff_id));

  return (
    <>
      <div className="appbar">
        <div className="appbar__in">
          <div>
            <h1 className="appbar__title">Équipe</h1>
            <div className="appbar__sub">
              {size} personne{size > 1 ? "s" : ""} · {bookable} réservable
              {bookable > 1 ? "s" : ""}
            </div>
          </div>
          <div className="appbar__actions">
            <button className="btn btn--primary btn--sm" type="button" data-dialog-open="dlg-add">
              <Icon name="user-plus" size={16} className="btn__icon--idle" />
              <span className="btn__label--idle">Ajouter quelqu'un</span>
            </button>
          </div>
        </div>
      </div>

      <main className="app__main has-tabbar" id="contenu">
        <div className="app__inner">
          {query.error ? (
            <div style={{ marginBottom: "var(--s-5)" }}>
              <Notice tone="danger" title="La modification n'a pas abouti">
                {REFUSALS[query.error] ?? "Réessayez, ou rechargez la page."}
              </Notice>
            </div>
          ) : null}

          {query.transfer ? (
            <div style={{ marginBottom: "var(--s-5)" }}>
              <Notice tone="danger" title="Le salon n'a pas changé de mains">
                {TRANSFER_REFUSALS[query.transfer] ?? "Réessayez, ou rechargez la page."}
              </Notice>
            </div>
          ) : null}

          {query.given ? (
            <div style={{ marginBottom: "var(--s-5)" }}>
              <Notice tone="success" title="Le salon a changé de propriétaire">
                {query.given} est désormais propriétaire. Vous gardez votre chaise, vos
                horaires et vos rendez-vous — mais seul {query.given} peut vous rendre
                le salon.
              </Notice>
            </div>
          ) : null}

          {query.invited ? (
            <div style={{ marginBottom: "var(--s-5)" }}>
              <Notice tone="success" title="Code d'accès créé" icon="shield">
                Transmettez ce code à {query.name ?? "cette personne"}, avec le lien{" "}
                <strong>{env.publicOrigin}/rejoindre</strong>.
                <div className="publink" style={{ marginTop: "var(--s-3)" }}>
                  <span className="publink__url">{query.invited}</span>
                  <button
                    className="btn btn--ghost btn--sm btn--icon"
                    type="button"
                    data-copy={query.invited}
                    aria-label="Copier le code d'accès"
                  >
                    <Icon name="copy" size={18} className="btn__icon--idle" />
                  </button>
                </div>
                <div className="t-xs" style={{ marginTop: "var(--s-3)" }}>
                  Il n'est affiché qu'une fois. En créer un autre remplace celui-ci —
                  c'est aussi comme ça qu'on le révoque.
                </div>
              </Notice>
            </div>
          ) : null}

          <div className="panel">
            {size === 0 ? (
              <EmptyState
                compact
                sketch="chair"
                title="Personne dans l'équipe"
                body="Ajoutez la première personne qui travaille ici : elle pourra être proposée aux clients dès que votre page sera en ligne."
              />
            ) : null}
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
                    <div className="t-xs" style={{ marginTop: "var(--s-2)" }}>
                      {person.role === "OWNER"
                        ? "Propriétaire de l'établissement"
                        : "Membre de l'équipe"}
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

                      {person.role === "OWNER" ? null : (
                        <form action={invite}>
                          <input type="hidden" name="id" value={person.staff_id} />
                          <input type="hidden" name="name" value={person.display_name} />
                          <button className="menu__item" type="submit">
                            <Icon name="lock" size={18} /> Créer un code d'accès
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
              dans l'équipe sans être proposée à la réservation. Une chaise n'est pas un
              compte&nbsp;: on ajoute la personne qui travaille ici bien avant qu'elle ne
              se connecte, et beaucoup ne se connecteront jamais.
            </Notice>
          </div>

          <dialog className="dialog" id="dlg-add">
            <div className="dialog__inner">
              <div className="dialog__head">
                <h2 className="dialog__title">Ajouter quelqu'un</h2>
              </div>
              <form action={addMember}>
                <div className="dialog__body">
                  <p>
                    La chaise existe d'abord, le compte vient après&nbsp;: créez-lui
                    ensuite un code d'accès depuis sa ligne, et transmettez-le-lui.
                  </p>
                  <div style={{ marginTop: "var(--s-5)" }}>
                    <MemberFields member={null} prefix="add" />
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
            <dialog className="dialog" id={`dlg-edit-${person.staff_id}`} key={person.staff_id}>
              <div className="dialog__inner">
                <div className="dialog__head">
                  <h2 className="dialog__title">{person.display_name}</h2>
                </div>
                <form action={replaceMember}>
                  <input type="hidden" name="id" value={person.staff_id} />
                  <div className="dialog__body">
                    <MemberFields member={person} prefix={`edit-${person.staff_id}`} />
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

          {team.data.filter(canDeactivate).map((person) => (
            <dialog className="dialog" id={`dlg-off-${person.staff_id}`} key={person.staff_id}>
              <div className="dialog__inner">
                <div className="dialog__head">
                  <h2 className="dialog__title">Désactiver cette personne&nbsp;?</h2>
                </div>
                <form action={replaceMember}>
                  <input type="hidden" name="id" value={person.staff_id} />
                  <input type="hidden" name="display_name" value={person.display_name} />
                  {/* The PUT replaces the whole row, so what is not meant to change
                      travels with it. `active` is left out on purpose: absent is
                      false, and false is the whole point of this form. */}
                  {person.bookable ? (
                    <input type="hidden" name="bookable" value="on" />
                  ) : null}
                  <div className="dialog__body">
                    <p>
                      {person.display_name} ne pourra plus se connecter et disparaîtra
                      du choix proposé aux clients.{" "}
                      <strong>Ses rendez-vous à venir ne sont pas annulés</strong>.
                      Pensez à les réattribuer depuis l'agenda.
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

          {/* Behind a dialog, and the consequences are read before the button is
              reachable. Nothing else on this page is irreversible from the
              caller's side: only the new owner can hand the salon back. */}
          {candidates.map((person) => (
            <dialog className="dialog" id={`dlg-own-${person.staff_id}`} key={person.staff_id}>
              <div className="dialog__inner">
                <div className="dialog__head">
                  <h2 className="dialog__title">
                    Céder la propriété de l'établissement&nbsp;?
                  </h2>
                </div>
                <form action={transferOwnership}>
                  <input type="hidden" name="id" value={person.staff_id} />
                  <input type="hidden" name="name" value={person.display_name} />
                  <div className="dialog__body">
                    <p>
                      <strong>
                        Cette action est définitive et vous ne pourrez pas l'annuler
                        vous-même.
                      </strong>
                    </p>
                    <ul className="stack" style={CONSEQUENCES}>
                      <li className="row" style={CONSEQUENCE_ROW}>
                        <span style={CONSEQUENCE_ICON}>
                          <Icon name="alert-circle" size={16} />
                        </span>
                        <span className="t-sm">
                          {person.display_name} deviendra propriétaire de
                          l'établissement.
                        </span>
                      </li>
                      <li className="row" style={CONSEQUENCE_ROW}>
                        <span style={CONSEQUENCE_ICON}>
                          <Icon name="alert-circle" size={16} />
                        </span>
                        <span className="t-sm">
                          Vous deviendrez un membre ordinaire de l'équipe.
                        </span>
                      </li>
                      <li className="row" style={CONSEQUENCE_ROW}>
                        <span style={CONSEQUENCE_ICON}>
                          <Icon name="alert-circle" size={16} />
                        </span>
                        <span className="t-sm">
                          Vous perdrez l'accès à l'équipe, au catalogue et à la
                          publication de la page.
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
                        <span className="field__hint">
                          Cette personne doit déjà s'être connectée avec un code
                          d'accès&nbsp;: une chaise sans compte ne peut pas recevoir le
                          salon.
                        </span>
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

function MemberFields({ member, prefix }: { member: StaffView | null; prefix: string }) {
  return (
    <>
      <div className="field">
        <label className="field__label" htmlFor={`${prefix}-name`}>
          Nom
          <span className="field__req" aria-hidden="true">
            *
          </span>
        </label>
        <input
          className="input"
          type="text"
          id={`${prefix}-name`}
          name="display_name"
          placeholder="Fanta Diallo"
          maxLength={120}
          required
          defaultValue={member?.display_name ?? ""}
        />
        <span className="field__hint">Tel qu'une cliente le lira sur votre page.</span>
      </div>

      <label className="check" style={{ marginTop: "var(--s-4)" }}>
        <input type="checkbox" name="bookable" defaultChecked={member?.bookable ?? true} />
        <span className="check__box">
          <Icon name="check" />
        </span>
        <span className="check__text">
          <strong>Réservable par les clients</strong>
          <span>
            Elle apparaîtra au moment de choisir une personne. Une réceptionniste
            travaille ici sans l'être.
          </span>
        </span>
      </label>

      <label className="check" style={{ marginTop: "var(--s-4)" }}>
        <input type="checkbox" name="active" defaultChecked={member?.active ?? true} />
        <span className="check__box">
          <Icon name="check" />
        </span>
        <span className="check__text">
          <strong>Travaille ici</strong>
          <span>
            Décochée pour quelqu'un qui est parti. Ses rendez-vous passés restent, et
            son accès s'arrête à la requête suivante.
          </span>
        </span>
      </label>
    </>
  );
}
