import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, api, isSignedIn } from "@/lib/api";
import type { CurrentMember, ProviderProfile } from "@/lib/types";

/** A diary. Cached, it would be stale before it was drawn. */
export const dynamic = "force-dynamic";

/**
 * Everything behind a sign-in.
 *
 * <p>The guard is here rather than on each page: a page added without one is
 * the kind of omission nobody notices until it is public, and there is no
 * legitimate page under /dashboard that a stranger may read.
 *
 * <p>It is not the only guard. The API refuses every one of these calls without
 * a token, and refuses again on the caller's row in the database - this only
 * decides whether to render a sign-in link or a dashboard.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isSignedIn())) redirect("/api/auth/login?next=/dashboard");

  let me: CurrentMember;
  let provider: ProviderProfile;
  try {
    [me, provider] = await Promise.all([
      api<CurrentMember>("/v1/me"),
      api<ProviderProfile>("/v1/provider-profile"),
    ]);
  } catch (error) {
    // A verified token whose subject belongs to no active business. They have
    // an account and not a salon, which is a different thing from being signed
    // out - so they are told, rather than bounced back to a sign-in that would
    // succeed and land them here again.
    if (error instanceof ApiError && error.status === 403) {
      return (
        <main>
          <h1>Aucune activite rattachee a ce compte</h1>
          <p>
            Votre compte existe, mais il n'est rattache a aucune activite. Si un
            collegue vous a invite, ouvrez le lien qu'il vous a envoye.
          </p>
          <SignOut />
        </main>
      );
    }
    throw error;
  }

  return (
    <>
      <header>
        <h1>{provider.business_name}</h1>
        <p>
          {me.display_name} — {me.role === "OWNER" ? "proprietaire" : "membre de l'equipe"}
          {provider.published ? "" : " — page non publiee"}
        </p>
        <nav>
          <ul>
            <li>
              <Link href="/dashboard">Agenda</Link>
            </li>
            <li>
              <Link href="/dashboard/hours">Horaires</Link>
            </li>
            {/* Hidden for an employee because the server refuses them anyway.
                The check is on the server; this only stops the refusal being
                the first they hear of it. */}
            {me.role === "OWNER" ? (
              <>
                <li>
                  <Link href="/dashboard/services">Prestations</Link>
                </li>
                <li>
                  <Link href="/dashboard/team">Equipe</Link>
                </li>
                <li>
                  <Link href="/dashboard/profile">Ma page</Link>
                </li>
              </>
            ) : null}
            <li>
              <Link href={`/p/${provider.slug}`}>Voir ma page publique</Link>
            </li>
            <li>
              <SignOut />
            </li>
          </ul>
        </nav>
      </header>
      <hr />
      {children}
    </>
  );
}

/** POST, because a sign-out on GET is triggered by any image tag anywhere. */
function SignOut() {
  return (
    <form method="post" action="/api/auth/logout">
      <button type="submit">Se deconnecter</button>
    </form>
  );
}
