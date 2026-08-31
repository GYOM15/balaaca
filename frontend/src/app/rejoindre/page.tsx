import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/api";
import { join } from "./actions";

export const dynamic = "force-dynamic";

export default async function Join({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  if (!(await isSignedIn())) redirect("/api/auth/login?next=/rejoindre");
  const query = await searchParams;

  return (
    <main>
      <h1>Rejoindre une equipe</h1>
      <p>Entrez le code que le proprietaire vous a transmis.</p>

      {query.error ? (
        <p className="problem">
          {query.error === "ALREADY_REGISTERED"
            ? "Ce compte est deja rattache a une activite."
            : "Ce code ne fonctionne pas. Il est peut-etre expire, ou deja utilise. Demandez-en un autre."}
        </p>
      ) : null}

      <form action={join}>
        <label>
          Code
          <input
            type="text"
            name="code"
            required
            minLength={20}
            maxLength={64}
            pattern="[A-Za-z0-9_-]+"
            defaultValue={query.code ?? ""}
          />
        </label>
        <button type="submit">Rejoindre</button>
      </form>
    </main>
  );
}
