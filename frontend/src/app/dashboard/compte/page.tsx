import { Icon } from "@/components/icon";
import { Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import type { CurrentMember } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The sign-in account, which this product does not own.
 *
 * <p>The address and the password belong to the realm that authenticates the
 * caller. The business API publishes neither: `/v1/me` answers a staff id, a
 * display name, a role and whether the person is bookable, and no operation in
 * the contract reads an e-mail or sets a password.
 *
 * <p>The design draws a field and a button for each. Drawing them disabled with
 * a sentence underneath was honest, and still left two controls a reader could
 * press for nothing. So neither is drawn now: the password is a link to the
 * realm's own screen, and the address is a paragraph saying why there is
 * nothing to press.
 */

/**
 * Where somebody chooses a new password, in this product's own colours.
 *
 * <p>Deliberately not the account console under `/realms/balaaca/account`. That
 * console exists and works, but `init-realm.sh` sets `loginTheme` and
 * `emailTheme` and no `accountTheme`, so Keycloak serves it from its stock
 * `keycloak.v3`: its favicon, its typography, "Account Management" in the tab.
 * This path renders `login-reset-password.ftl` out of
 * `infrastructure/keycloak/themes/balaaca`, which is this product's own screen
 * down to the wordmark.
 *
 * <p>Built from the issuer rather than from an address written here, because
 * the issuer is already the address the browser is sent to: /api/auth/login
 * redirects to the authorization endpoint discovered under it. A second
 * statement of where the realm lives is the one that goes stale.
 */
function newPasswordUrl(): string {
  const url = new URL(`${env.issuer}/login-actions/reset-credentials`);
  // Which application the reader came from, and not decoration: the theme's
  // header links back to `client.baseUrl`, and with no client_id Keycloak fills
  // that in with its own account console - so the way back out of the screen
  // would lead further into Keycloak instead of home.
  url.searchParams.set("client_id", env.clientId);
  return url.toString();
}

export default async function Account() {
  const me = await api<CurrentMember>("/v1/me");
  const role = me.role === "OWNER" ? "Propriétaire" : "Équipe";

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
            <h1 className="appbar__title">Mon compte</h1>
            {/* The design prints the e-mail here. Nothing serves it, so the
                line says who is signed in instead - which is the question a
                shared counter machine actually raises. */}
            <div className="appbar__sub">
              {me.display_name} · {role}
            </div>
          </div>
          <div className="appbar__actions" />
        </div>
      </div>

      <main id="contenu" className="app__main has-tabbar">
        <div className="app__inner">
          <div className="stack" style={{ maxWidth: 720 }}>
            <div className="panel">
              <div className="panel__head">
                <div>
                  <div className="panel__title">Identité de connexion</div>
                  <div className="panel__sub">Qui vous êtes dans cet établissement</div>
                </div>
              </div>
              <div className="card__body">
                {/* Read back, not edited. Every one of these is set somewhere
                    else - the name and the role by whoever runs the team, the
                    third by the same screen - and an input here would be a
                    second way to change them that saves nowhere.

                    "Réservable" earns its line: an employee is not shown the
                    team screen, so this is the only place they can find out
                    whether customers can book them. */}
                <div className="dl dl--lined">
                  <div className="dl__row">
                    <span className="dl__key">Nom affiché</span>
                    <span className="dl__val">{me.display_name}</span>
                  </div>
                  <div className="dl__row">
                    <span className="dl__key">Rôle</span>
                    <span className="dl__val">{role}</span>
                  </div>
                  <div className="dl__row">
                    <span className="dl__key">Réservable par les clients</span>
                    <span className="dl__val">{me.bookable ? "Oui" : "Non"}</span>
                  </div>
                </div>

                <div style={{ marginTop: "var(--s-5)" }}>
                  <Notice
                    tone="info"
                    icon="mail"
                    title="Votre adresse e-mail ne se change pas ici"
                  >
                    Balaaca ne garde pas l’adresse avec laquelle vous vous connectez&nbsp;:
                    elle appartient au service qui vous authentifie, qui s’en sert aussi
                    comme identifiant. En changer reviendrait à changer de compte, et
                    aujourd’hui seul un administrateur de la plateforme peut le faire.
                    Il n’y a pas non plus de lien de vérification à envoyer d’ici&nbsp;:
                    la confirmation de l’adresse, lorsqu’elle est demandée, se fait au
                    moment de la connexion.
                  </Notice>
                </div>
              </div>
            </div>

            <div className="panel" style={{ marginTop: "var(--s-6)" }}>
              <div className="panel__head">
                <div>
                  <div className="panel__title">Mot de passe</div>
                  <div className="panel__sub">Gardé par le service qui vous connecte</div>
                </div>
              </div>
              <div className="card__body">
                <p className="field__hint">
                  Votre mot de passe n’est jamais passé par Balaaca et ne peut donc pas
                  être changé depuis cette page. L’écran qui le change est celui du
                  service qui vous connecte, aux couleurs de Balaaca&nbsp;: vous y
                  saisissez votre adresse, un lien vous arrive par e-mail, et vous
                  choisissez le nouveau mot de passe.
                </p>
                <div style={{ marginTop: "var(--s-4)" }}>
                  {/* A link and not a button, because it goes somewhere - and a
                      plain anchor rather than the Button component, whose Link
                      is for routes inside this application. */}
                  <a className="btn btn--primary" href={newPasswordUrl()}>
                    <span className="btn__icon--idle" style={{ display: "inline-flex" }}>
                      <Icon name="lock" size={18} />
                    </span>
                    <span className="btn__label--idle">Changer mon mot de passe</span>
                  </a>
                </div>
                <p className="field__hint" style={{ marginTop: "var(--s-3)" }}>
                  Vous quittez Balaaca le temps de le faire.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
