# ADR-0006 - `main` + `develop` + branches de feature

Statut : Accepte
Renverse la regle 5 du skill herite `branch-naming`.

## Contexte

Le pack de conventions herite impose du trunk-based : une seule branche `main`
protegee, et il liste explicitement une branche `develop` de longue duree comme
un anti-pattern.

Le proprietaire du projet a demande l'inverse : des branches de feature, et une
branche de developpement sur laquelle pousser en continu.

## Decision

- `main` : branche de release, toujours livrable.
- `develop` : branche d'integration, et branche par defaut du depot GitHub - de sorte qu'une pull request cible `develop` sans action particuliere.
- `feature/<kebab-slug>`, plus `fix/`, `chore/`, `docs/`, `ci/`.
- Une branche est coupee depuis `develop` et y retourne par pull request.
- `develop` est promue vers `main` aux jalons de phase.

Le reste du skill est conserve : kebab-case uniquement, pas de prefixe
personnel, un seul sujet par branche, duree de vie courte, fusion seulement sur
une barriere verte.

Cette inversion est enregistree ici pour qu'aucun lecteur ne se retrouve devant
deux regles contradictoires sans savoir laquelle fait autorite. C'est cet ADR
qui fait autorite.

## Consequences

Positives : `main` ne recoit que des etats promus deliberement. Le modele
correspond a la facon de travailler du proprietaire.

Negatives : `develop` peut deriver de `main` si la promotion n'est pas
reguliere ; c'est exactement le risque que le trunk-based evite. La discipline
de promotion frequente remplace la garantie structurelle.

**Limite reelle** : la protection de branche cote serveur est indisponible.
GitHub la reserve aux depots publics ou aux comptes payants, et le depot est
prive sur un compte gratuit. `main` n'est donc gardee que par le hook local
`.githooks/pre-push`, contournable par `--no-verify`, et aucun check de CI ne
peut etre rendu obligatoire. C'est une convention, pas une garantie, et cet ADR
le dit plutot que de le laisser croire.

## A revisiter quand

Le depot passe public ou le compte passe sur un plan payant : la protection de
branche et les checks obligatoires deviennent alors activables, et il faut le
faire immediatement.
