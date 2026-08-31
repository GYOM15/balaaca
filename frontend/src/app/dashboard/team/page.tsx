import { api } from "@/lib/api";
import { env } from "@/lib/env";
import type { StaffList } from "@/lib/types";
import { addMember, invite, replaceMember } from "./actions";

export const dynamic = "force-dynamic";

const REFUSALS: Record<string, string> = {
  FORBIDDEN: "Seul le proprietaire compose l'equipe.",
  NOTHING_TO_PUBLISH: "Il resterait personne de reservable sur une page publiee.",
  NOT_INVITABLE: "Cette personne a deja un compte, ou c'est vous.",
  RESOURCE_NOT_FOUND: "Cette personne n'existe plus.",
};

/**
 * The people who work here.
 *
 * <p>Nobody is deleted. Someone who has left is set inactive, because removing
 * the row would take their appointments' history with it and the salon would
 * lose the record of who saw which customer.
 */
export default async function Team({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invited?: string }>;
}) {
  const query = await searchParams;
  const team = await api<StaffList>("/v1/staff");

  return (
    <main>
      <h2>Equipe</h2>

      {query.error ? (
        <p className="problem">{REFUSALS[query.error] ?? "La demande n'a pas abouti."}</p>
      ) : null}

      {query.invited ? (
        <p className="problem">
          Code d'invitation&nbsp;: <strong>{query.invited}</strong>
          <br />
          Il n'est affiche qu'une fois. Transmettez-le, avec ce lien&nbsp;:{" "}
          <code>{env.publicOrigin}/rejoindre</code>
        </p>
      ) : null}

      {team.data.map((person) => (
        <details key={person.staff_id}>
          <summary>
            {person.display_name} — {person.role === "OWNER" ? "proprietaire" : "equipe"}
            {person.active ? "" : " (a quitte)"}
            {person.bookable ? "" : " (non reservable)"}
          </summary>
          <form action={replaceMember}>
            <input type="hidden" name="id" value={person.staff_id} />
            <Fields member={person} />
            <button type="submit">Enregistrer</button>
          </form>
          {person.role === "OWNER" ? null : (
            <form action={invite}>
              <input type="hidden" name="id" value={person.staff_id} />
              <button type="submit">Creer un code d'acces</button>
            </form>
          )}
        </details>
      ))}

      <h3>Ajouter quelqu'un</h3>
      <p>
        Une chaise, pas un compte&nbsp;: on ajoute la personne qui travaille ici
        bien avant qu'elle ne se connecte, et beaucoup ne se connecteront jamais.
      </p>
      <form action={addMember}>
        <Fields member={null} />
        <button type="submit">Ajouter</button>
      </form>
    </main>
  );
}

function Fields({ member }: { member: StaffList["data"][number] | null }) {
  return (
    <>
      <label>
        Nom
        <input
          type="text"
          name="display_name"
          required
          maxLength={120}
          defaultValue={member?.display_name ?? ""}
        />
      </label>
      <label>
        <input type="checkbox" name="bookable" defaultChecked={member?.bookable ?? true} />{" "}
        Reservable par les clients
      </label>
      <label>
        <input type="checkbox" name="active" defaultChecked={member?.active ?? true} /> Travaille
        ici
      </label>
    </>
  );
}
