# ADR-0009 - Inscription autonome : creer un tenant avant qu'un tenant existe

Statut : Accepte
Complete l'ADR-0002, qui a resolu la lecture du tenant et laisse l'ecriture
initiale sans reponse.

## Contexte

L'ADR-0002 a pose que le tenant se resout en base, depuis le sujet du jeton,
a travers `users` et `provider_staff`. Il a casse la circularite de la
**lecture** avec `app_resolve_provider`, une fonction `SECURITY DEFINER`.

Il reste que rien ne cree ces lignes. La politique du tenant sur `providers`
porte `WITH CHECK (id = app_current_provider())` : sans GUC lie, le predicat
vaut `NULL` et n'admet aucune ligne. Le resultat est une impasse complete et
silencieuse - verifiee sur PostgreSQL 18.6 :

1. un salon s'inscrit dans Keycloak, l'auto-inscription etant ouverte ;
2. il obtient un jeton parfaitement valide ;
3. `app_resolve_provider` ne trouve rien, et **chaque** route authentifiee
   repond 403 ;
4. aucun role ne peut executer l'`INSERT` qui le sortirait de la.

Toute la surface authentifiee - agenda, catalogue, horaires, annulation,
report - etait donc inatteignable par quiconque de nouveau. Ce n'etait pas une
fonctionnalite manquante mais un mur devant le produit.

Trois options ont ete pesees.

- **Amorcer chaque salon a la main**, par migration ou par `psql`. Cela marche
  pour dix salons et pour aucun modele economique.
- **Ouvrir une politique `INSERT` a `balaaca_app`.** Une politique qui admet
  une ligne `provider_staff` sans tenant lie est une prise de controle : un
  compte fraichement inscrit, connaissant un `provider_id`, s'ajoute comme
  `OWNER` chez un concurrent et le resolver lui remet son tenant a la requete
  suivante. Le predicat qui l'empecherait doit lire `providers`, que la
  connexion ne voit pas encore.
- **Une fonction `SECURITY DEFINER`**, comme pour la lecture.

## Decision

**Une seule fonction, `app_register_provider`, ecrit les trois lignes dans une
transaction, et elle appartient a son propre role.**

`balaaca_registrar` est distinct de `balaaca_resolver`, qui reste en lecture
seule. La question « qu'est-ce qui peut faire naitre un prestataire » a alors
exactement une reponse, et un audit la trouve en une requete sur les
proprietaires de fonctions. Le role est `NOLOGIN` : ses `GRANT INSERT` ne sont
atteignables qu'a travers cette fonction.

Trois points portent la securite, et aucun n'est une preference de style.

1. **La ligne `providers` est inseree AVANT la ligne `provider_staff`.** Un
   appelant qui passerait l'identifiant d'un prestataire existant echoue sur
   `providers_pkey` avant qu'une appartenance soit ecrite. Inversees, les deux
   insertions font de cette fonction la prise de controle que l'option 2
   rendait possible. Verifie.
2. **Deux politiques contraignent le definer lui-meme.**
   `providers_registration` n'admet qu'un prestataire dormant (`PENDING`, non
   publie), `provider_staff_registration` qu'une ligne `OWNER`. Aucune
   reecriture de la fonction ne peut donc publier une page a l'inscription.
3. **L'unicite est traduite en SQLSTATE dans la fonction.** Toute violation
   d'unicite arrive en `23505` ; distinguer trois contraintes en Java
   demanderait le type d'exception du pilote PostgreSQL dans un module qui n'a
   aucune autre raison d'en dependre. `providers_slug_key` devient `Z0001`,
   `uq_provider_staff_one_active_membership` et `users_keycloak_user_id_key`
   deviennent `Z0002`. Tout le reste est re-leve tel quel.

`POST /v1/providers` est en consequence `@Authenticated` et **pas**
`@TenantBound` - la seule route de la plateforme dans ce cas - et ne declare
aucun scope : un scope dit ce qu'un appelant peut faire *dans son propre
prestataire*, et il n'en a pas encore.

Deux codes d'erreur sont ajoutes au catalogue ferme, `SLUG_UNAVAILABLE` et
`ALREADY_REGISTERED`. Les deux sont des `409` et aucun n'etait exprimable : un
client qui ne peut pas les distinguer ne peut pas dire au salon lequel des deux
il tient, alors que l'un se corrige en choisissant une autre poignee et l'autre
ne se corrige par rien.

## Consequences

Positives : un salon s'inscrit seul, de bout en bout, sans intervention. La
frontiere d'ecriture privilegiee est un seul objet nomme, contraint par des
politiques, et son ordre d'insertion est teste. Le compte est cree a partir du
jeton verifie et jamais d'un corps de requete, donc le nom au journal d'audit
est celui que l'identite porte.

Negatives, et elles sont reelles :

- un cinquieme role de base de donnees a creer sur un VPS, et trois scripts
  d'amorcage a garder d'accord ;
- la logique d'inscription vit en plpgsql, hors de portee du compilateur et des
  tests unitaires ; seules les suites `*IT` sur Testcontainers la couvrent ;
- deux SQLSTATE inventes (`Z0001`, `Z0002`) sont un vocabulaire propre au
  projet, documente dans la migration et dans CANONICAL.md, et invisible
  partout ailleurs ;
- un compte ne peut tenir qu'un seul salon. C'est l'index
  `uq_provider_staff_one_active_membership` de l'ADR-0002 qui l'impose, pas
  cette decision, mais c'est ici que l'utilisateur le rencontre.

## A revisiter quand

Une personne doit tenir plusieurs salons, ou etre employee chez deux
prestataires. La contrainte d'une appartenance active unique tombe alors, le
resolver ne peut plus rendre un seul `uuid`, et l'inscription cesse d'etre le
seul chemin d'ecriture privilegie : il faudra aussi inviter quelqu'un dans un
prestataire existant. C'est un ADR qui remplace celui-ci, pas un contournement.
