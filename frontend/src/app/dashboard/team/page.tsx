import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { Icon } from "@/components/icon";
import { ActionButton, Avatar, Badge, EmptyState, Notice, SectionHead } from "@/components/ui";
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

  // Who the salon can go to. Active, and not the caller: the API refuses a
  // departed colleague and refuses the owner naming themselves. The third
  // condition is having an account, which StaffView does not carry - so it is
  // said in words below and named again by the refusal, rather than guessed at
  // by a screen that would be wrong either way round.
  const candidates =
    me.role === "OWNER"
      ? team.data.filter((p) => p.active && p.staff_id !== me.staff_id)
      : [];

  return (
    <div className="stack stack-8">
      <header className="pro-head">
        <h1 className="pro-head__title">Équipe</h1>
        <p className="t-small t-muted">
          Une chaise n'est pas un compte&nbsp;: on ajoute la personne qui
          travaille ici bien avant qu'elle ne se connecte, et beaucoup ne se
          connecteront jamais.
        </p>
      </header>

      {query.error ? (
        <Notice tone="danger" title="La modification n'a pas abouti">
          {REFUSALS[query.error] ?? "Réessayez, ou rechargez la page."}
        </Notice>
      ) : null}

      {query.transfer ? (
        <Notice tone="danger" title="Le salon n'a pas changé de mains">
          {TRANSFER_REFUSALS[query.transfer] ?? "Réessayez, ou rechargez la page."}
        </Notice>
      ) : null}

      {query.given ? (
        <Notice tone="success" title="Le salon a changé de propriétaire">
          {query.given} est désormais propriétaire. Vous gardez votre chaise, vos
          horaires et vos rendez-vous — mais seul {query.given} peut vous rendre
          le salon.
        </Notice>
      ) : null}

      {query.invited ? (
        <Notice tone="success" title="Code d'accès créé" icon="key">
          <span className="stack stack-2" style={{ display: "grid" }}>
            <span>
              Transmettez ce code à {query.name ?? "cette personne"}, avec le lien{" "}
              <strong>{env.publicOrigin}/rejoindre</strong>.
            </span>
            {/* readOnly rather than a paragraph: a long press on a field offers
                Copy on a phone, and this string is shown exactly once. */}
            <input
              className="input tnum"
              readOnly
              value={query.invited}
              aria-label="Code d'invitation"
            />
            <span className="t-caption t-dim">
              Il n'est affiché qu'une fois. En créer un autre remplace celui-ci —
              c'est aussi comme ça qu'on le révoque.
            </span>
          </span>
        </Notice>
      ) : null}

      <section className="stack stack-4">
        <SectionHead
          label="Les personnes"
          aside={`${bookable} réservable${bookable > 1 ? "s" : ""} sur ${team.data.length}`}
        />

        <div className="stack stack-3">
          {team.data.map((person) => (
            <details className="card card--pad" key={person.staff_id}>
              <summary className="row row--between row-3 row--wrap">
                <span className="row row-3 grow">
                  <Avatar name={person.display_name} />
                  <span className="stack stack-1">
                    <span className="t-body" style={{ fontWeight: 600 }}>
                      {person.display_name}
                    </span>
                    <span className="t-caption t-dim">
                      {person.role === "OWNER" ? "Propriétaire" : "Équipe"}
                    </span>
                  </span>
                </span>
                {person.active ? null : <Badge label="A quitté" tone="outline" />}
                {person.active && !person.bookable ? (
                  <Badge label="Non réservable" tone="neutral" />
                ) : null}
              </summary>

              <div className="stack stack-4" style={{ marginTop: "var(--space-4)" }}>
                <form action={replaceMember} className="stack stack-4">
                  <input type="hidden" name="id" value={person.staff_id} />
                  <Fields member={person} />
                  <ActionButton label="Enregistrer" variant="primary" type="submit" icon="check" />
                </form>

                {person.role === "OWNER" ? null : (
                  <form action={invite} className="stack stack-2">
                    <input type="hidden" name="id" value={person.staff_id} />
                    <input type="hidden" name="name" value={person.display_name} />
                    <ActionButton
                      label="Créer un code d'accès"
                      variant="secondary"
                      type="submit"
                      icon="key"
                    />
                    <span className="field__hint">
                      Pour que {person.display_name} ouvre son propre agenda depuis
                      son téléphone.
                    </span>
                  </form>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="stack stack-4">
        <SectionHead label="Ajouter quelqu'un" />
        <form action={addMember} className="card card--pad-lg stack stack-4">
          <Fields member={null} />
          <ActionButton label="Ajouter" variant="primary" type="submit" icon="plus" />
        </form>
      </section>

      {/* Last on the page, and behind a disclosure per person. Nothing else
          here is irreversible from the caller's side, and the two things a
          founder does most - add somebody, hand out a code - should not sit
          next to the one they do once. */}
      {me.role === "OWNER" ? (
        <section className="stack stack-4">
          <SectionHead label="Céder le salon" />
          <p className="t-small t-muted">
            Un collègue peut reprendre le salon à votre place. Il doit déjà
            s'être connecté avec un code d'accès&nbsp;: une chaise sans compte ne
            peut pas le recevoir.
          </p>

          <Notice tone="warning" title="C'est définitif de votre côté">
            Vous ne serez plus propriétaire. Seul le nouveau propriétaire pourra
            vous rendre le salon. Votre chaise, vos horaires et vos rendez-vous,
            eux, ne changent pas.
          </Notice>

          {candidates.length === 0 ? (
            <EmptyState
              compact
              sketch="chair"
              title="Personne à qui le céder"
              body="Vous êtes seul à travailler ici. Ajoutez la personne qui reprend, créez-lui un code d'accès, et le salon pourra lui revenir une fois qu'elle se sera connectée."
            />
          ) : (
            <div className="stack stack-3">
              {candidates.map((person) => (
                <details className="card card--pad" key={person.staff_id}>
                  <summary className="row row--between row-3 row--wrap">
                    <span className="row row-3 grow">
                      <Avatar name={person.display_name} size="sm" />
                      <span className="t-body">{person.display_name}</span>
                    </span>
                    <span className="t-caption t-dim">Transférer la propriété</span>
                  </summary>

                  <form
                    action={transferOwnership}
                    className="stack stack-3"
                    style={{ marginTop: "var(--space-4)" }}
                  >
                    <input type="hidden" name="id" value={person.staff_id} />
                    <input type="hidden" name="name" value={person.display_name} />
                    <p className="field__hint">
                      <Icon name="alert-triangle" size={14} /> {person.display_name}{" "}
                      pourra publier la page, composer l'équipe et céder le salon à
                      son tour. Vous ne le pourrez plus.
                    </p>
                    <ActionButton
                      label={`Transférer la propriété à ${person.display_name}`}
                      variant="danger"
                      type="submit"
                      icon="arrow-right"
                    />
                  </form>
                </details>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function Fields({ member }: { member: StaffView | null }) {
  return (
    <>
      <label className="field">
        <span className="field__label">
          Nom<span className="field__req" aria-hidden="true">*</span>
        </span>
        <input
          className="input"
          type="text"
          name="display_name"
          required
          maxLength={120}
          defaultValue={member?.display_name ?? ""}
        />
        <span className="field__hint">
          <Icon name="info" size={14} /> Tel qu'une cliente le lira sur votre page.
        </span>
      </label>

      <label className="switch">
        <input type="checkbox" name="bookable" defaultChecked={member?.bookable ?? true} />
        <span className="switch__track"><span className="switch__thumb" /></span>
        <span className="grow">
          <span className="t-small">Réservable par les clients</span>
          <span className="field__hint" style={{ display: "block" }}>
            Une réceptionniste travaille ici sans être réservable.
          </span>
        </span>
      </label>

      <label className="switch">
        <input type="checkbox" name="active" defaultChecked={member?.active ?? true} />
        <span className="switch__track"><span className="switch__thumb" /></span>
        <span className="grow">
          <span className="t-small">Travaille ici</span>
          <span className="field__hint" style={{ display: "block" }}>
            Décochée pour quelqu'un qui est parti. Ses rendez-vous passés
            restent, et son accès s'arrête à la requête suivante.
          </span>
        </span>
      </label>
    </>
  );
}
