# ADR-0002 — Le tenant est resolu en base, pas depuis un claim JWT

Statut : Accepte
Remplace la regle 3 du skill herite `multi-tenant-rls`.

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

Le resultat est mis en cache dans Redis avec un TTL court et une invalidation
explicite a tout changement d'appartenance. La resolution est **fail-closed** :
pas d'appartenance resolvable, pas d'acces.

Ce qui ne change pas par rapport au skill herite, et qui en portait la vraie
intention : `provider_id` n'est **jamais** un parametre de methode, de DTO, de
requete, de chemin ou d'en-tete. Il est ambiant, lu depuis `TenantContext`.

## Consequences

Positives : une seule source de verite. Revocation immediate. Aucun
provisionnement Keycloak au moment de la creation d'un prestataire. Le premier
login fonctionne sans cas particulier.

Negatives : une lecture indexee supplementaire par requete, absorbee par le
cache. Le cache devient un chemin critique de securite : son invalidation doit
etre testee comme telle, et une panne Redis doit degrader vers la base, jamais
vers un acces ouvert.

## A revisiter quand

Un utilisateur doit appartenir a plusieurs tenants, ou le cout de la resolution
devient mesurable sous charge reelle.
