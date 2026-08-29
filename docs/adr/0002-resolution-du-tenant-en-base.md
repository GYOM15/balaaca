# ADR-0002 — Le tenant est resolu en base, pas depuis un claim JWT

Statut : Accepte
Remplace la regle 3 du skill herite `multi-tenant-rls`.
Amende le 2026-08-29 apres revue adversariale, avant toute implementation.
La version initiale prescrivait un cache Redis et ne disait pas comment le
GUC PostgreSQL etait pose. Les deux points etaient des defauts reels ; ils sont
corriges ci-dessous et la raison de la correction est conservee.

## Contexte

Le tenant de Balaaca est le **prestataire**. Le pack de conventions herite d'un
autre projet imposait de lire le tenant depuis un claim `tenant_id` du JWT
verifie.

Trois problemes propres a Balaaca :

1. Un prestataire **cree son tenant apres son inscription**. Au premier login,
   aucun claim ne peut exister. Il faudrait un cycle de rafraichissement de
   token juste apres la creation du prestataire.
2. Retirer un employe d'une equipe ne prendrait effet qu'a l'expiration de son
   token, pas immediatement.
3. Keycloak deviendrait une **seconde source de verite** sur l'appartenance au
   tenant, a maintenir synchronisee avec `provider_staff`. Toute desynchro-
   nisation est une faille ou un blocage.

## Decision

Separation nette des sources de verite :

- Le **JWT** fait autorite sur l'**identite** (`sub`) et les **roles globaux**.
- La **base** fait autorite sur l'**appartenance au tenant**.

Resolution, executee par le `TenantBoundInterceptor` :

```
sub verifie -> users.keycloak_user_id -> users.id
            -> provider_staff.user_id -> provider_id
```

Fail-closed : pas d'appartenance resolvable, pas d'acces
(`NoProviderMembershipException`).

`provider_id` n'est **jamais** un parametre de methode, de DTO, de requete, de
chemin ou d'en-tete. Il est ambiant, lu depuis `TenantContext`.

### Correction 1 — aucun cache sur le chemin d'autorisation

La version initiale prescrivait un cache Redis a TTL court, avec invalidation
explicite au changement d'appartenance. C'etait une erreur, et elle annulait la
justification meme de cet ADR.

Un cache positif de N minutes **est** un jeton de N minutes. L'invalidation est
une double ecriture entre deux domaines de panne : si la transaction qui
supprime la ligne `provider_staff` committe et que l'eviction Redis echoue —
redemarrage, coupure reseau, exception entre les deux, seconde instance — un
employe revoque conserve un acces complet jusqu'a l'expiration du TTL, sans
reprise ni compensation. Le motif « la revocation doit etre immediate » invoque
plus haut pour ecarter le claim JWT devenait donc faux dans notre propre
implementation.

**Aucun cache sur le chemin d'autorisation.** La resolution est une jointure
indexee sur des chemins de cle primaire ; au volume de ce produit, la mettre en
cache achete une microseconde contre une faille. Si un jour le cout devient
mesurable, la forme sure est de mettre en cache un couple
`(provider_id, membership_epoch)` et de valider l'epoque a chaque requete, pas
de mettre en cache la decision elle-meme.

### Correction 2 — le GUC est pose par un hook de connexion

La version initiale ne disait pas **quand** `app.provider_id` etait pose. La
reponse evidente — un intercepteur — ne fonctionne pas : `TenantBoundInterceptor`
s'execute a `PLATFORM_BEFORE + 10`, donc **hors** de la transaction que Quarkus
ouvre a `PLATFORM_BEFORE + 200`. Il ne peut pas appeler un binder marque
`MANDATORY`. Suivie a la lettre, la version initiale produisait une application
dont **chaque requete tenant echouait**.

Le GUC est pose par un **hook de niveau connexion** — listener Agroal ou
integrateur Hibernate — qui emet, comme premiere instruction sur la connexion
enrolee dans chaque transaction :

```sql
SELECT set_config('app.provider_id', ?, true)
```

Un hook de connexion, contrairement a une annotation, couvre aussi toute
transaction ouverte sans `@TenantBound` — un oubli ne peut donc pas ouvrir
l'acces.

### Correction 3 — le predicat RLS doit degrader proprement

Verifie sur PostgreSQL 18.6 : `current_setting('app.provider_id')` sans
`missing_ok` leve `42704` quand le GUC est absent, et `''::uuid` leve `22P02`.
Les deux produisent un 500 au lieu d'un 404 propre. Toute politique s'ecrit donc :

```sql
provider_id = nullif(current_setting('app.provider_id', true), '')::uuid
```

qui vaut `NULL` en l'absence de GUC et filtre alors toutes les lignes.

### Limite assumee — une seule appartenance active par compte

`provider_staff` est une relation plusieurs-a-plusieurs par sa forme. Le
resolveur ne doit pas supposer silencieusement l'unicite : elle est **imposee**.

```sql
CREATE UNIQUE INDEX provider_staff_one_active_membership
    ON provider_staff (user_id)
    WHERE user_id IS NOT NULL AND status = 'ACTIVE';
```

Consequence : une personne ne peut pas encore etre employee chez deux
prestataires. C'est une limitation reelle — un coiffeur qui travaille dans deux
salons — assumee au lancement et documentee plutot que decouverte en
production.

Le mecanisme futur est nomme des maintenant pour ne pas etre improvise : une
appartenance active **selectionnee cote serveur**, revalidee contre
`provider_staff` a chaque requete et conservee contre la session du BFF. Jamais
un identifiant de prestataire fourni par le client. Il n'est pas construit
aujourd'hui.

## Consequences

Positives : une seule source de verite. Revocation reellement immediate, cette
fois. Aucun provisionnement Keycloak a la creation d'un prestataire. Le premier
login fonctionne sans cas particulier. Un oubli d'annotation ferme l'acces au
lieu de l'ouvrir.

Negatives : une jointure indexee par requete, non mise en cache et assumee comme
telle. Le hook de connexion est un point unique dont la defaillance doit etre
bruyante, pas silencieuse : sans GUC, toute lecture renvoie zero ligne, ce qui
doit etre couvert par un test dedie.

## A revisiter quand

Le cout de la resolution devient mesurable sous charge reelle, ou une personne
doit legitimement travailler chez plusieurs prestataires.
