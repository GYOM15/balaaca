import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { Icon } from "@/components/icon";
import { ActionButton, Avatar, Badge, Notice, SectionHead } from "@/components/ui";
import type { StaffList, StaffView } from "@/lib/types";
import { addMember, invite, replaceMember } from "./actions";

export const dynamic = "force-dynamic";

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le propriétaire compose l'équipe.",
  NOTHING_TO_PUBLISH:
    "Il ne resterait personne de réservable sur une page publiée. Dépubliez d'abord, ou gardez quelqu'un de réservable.",
  NOT_INVITABLE: "Cette personne a déjà un compte, ou c'est vous.",
  RESOURCE_NOT_FOUND: "Cette personne n'existe plus.",
  VALIDATION_FAILED: "Il faut un nom.",
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
  searchParams: Promise<{ error?: string; invited?: string; name?: string }>;
}) {
  const query = await searchParams;
  const team = await api<StaffList>("/v1/staff");

  const bookable = team.data.filter((p) => p.active && p.bookable).length;

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
