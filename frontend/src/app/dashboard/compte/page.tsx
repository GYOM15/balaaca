import { Icon } from "@/components/icon";
import { Notice } from "@/components/ui";
import { api } from "@/lib/api";
import type { CurrentMember } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The sign-in account, which this product does not own.
 *
 * <p>The address and the password are held by the realm that authenticates the
 * caller, and the business API publishes neither: `/v1/me` answers a staff id,
 * a display name, a role and whether the person is bookable, and there is no
 * operation anywhere in the contract that reads an e-mail or sets a password.
 * So the two controls the design draws here are drawn, and disabled, and the
 * page says why - a field that accepts what you type and forgets it is worse
 * than a field that tells you it cannot.
 */
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
                <div className="panel__title">Identité de connexion</div>
              </div>
              <div className="card__body">
                <div className="field">
                  <label className="field__label" htmlFor="a-email">
                    Adresse e-mail
                  </label>
                  <input className="input" type="email" id="a-email" name="aemail" disabled />
                </div>
                <div style={{ marginTop: "var(--s-4)" }}>
                  <Notice
                    tone="warning"
                    title="Pas encore modifiable ici"
                    actions={
                      <button className="btn btn--secondary btn--sm" type="button" disabled>
                        <span className="btn__label--idle">Envoyer le lien de vérification</span>
                      </button>
                    }
                  >
                    Votre adresse de connexion et votre mot de passe appartiennent au
                    service qui vous authentifie, pas à Balaaca. Cette page ne peut donc
                    ni afficher votre adresse ni la changer pour l’instant&nbsp;: rien de
                    ce qui est saisi ici n’est enregistré.
                  </Notice>
                </div>
              </div>
            </div>

            <div className="panel" style={{ marginTop: "var(--s-6)" }}>
              <div className="panel__head">
                <div className="panel__title">Mot de passe</div>
              </div>
              <div className="card__body">
                <div className="field">
                  <label className="field__label" htmlFor="a-pwd">
                    Nouveau mot de passe
                  </label>
                  <input className="input" type="password" id="a-pwd" name="pwd" disabled />
                  <p className="field__hint">Au moins 10 caractères.</p>
                  <p className="field__hint">
                    Le mot de passe est gardé par le même service&nbsp;: le bouton
                    ci-dessous reste inactif tant qu’il n’est pas relié.
                  </p>
                </div>
                <div style={{ marginTop: "var(--s-4)" }}>
                  <button className="btn btn--primary" type="button" disabled>
                    <span className="btn__label--idle">Changer le mot de passe</span>
                    <span className="btn__icon--busy">
                      <Icon name="loader" size={18} className="ico--spin" />
                    </span>
                    <span className="btn__label--busy">Modification…</span>
                    <span className="btn__icon--done">
                      <Icon name="check" size={18} />
                    </span>
                    <span className="btn__label--done">Modifié</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
