# ADR-0007 - Instants en UTC, regles recurrentes en heure locale

Statut : Accepte

## Contexte

Un produit de reservation manipule deux natures de temps que tout confond :
un rendez-vous est un **instant** sur la ligne du temps, tandis que « le lundi
de 9 h a 18 h » est une **heure locale** qui n'a de sens que rapportee a un
fuseau.

La Guinee est en UTC+0 sans heure d'ete. C'est un piege : le code peut etre
faux et tous les tests locaux passer.

## Decision

| Concept | Type Java | Type SQL |
|---|---|---|
| Debut / fin d'un rendez-vous | `Instant` | `timestamptz` |
| Plage bloquee | `Instant` | `tstzrange` genere |
| Horaire recurrent hebdomadaire | `LocalTime` + `DayOfWeek` | `time` + `smallint` |
| Exception de calendrier | `LocalDate` | `date` |
| Fuseau du prestataire | `ZoneId` | `varchar(64)` IANA |

Regle : **instant pour ce qui est ponctuel, heure locale plus fuseau du
prestataire pour ce qui est recurrent.** La conversion se fait dans un seul
endroit, `shared-kernel`.

Une `java.time.Clock` est injectee partout. Sont interdits : `Instant.now()` ou
`LocalDateTime.now()` appeles directement dans du code metier, et toute date
manipulee comme une `String`.

`providers.timezone` a `Africa/Conakry` par defaut mais n'est jamais suppose :
le produit vise d'autres marches.

Le calcul de creneaux est une **fonction pure** - regles, exceptions,
rendez-vous existants, duree et tampons de la prestation, politique, plage,
fuseau, instant courant en entree ; liste de creneaux en sortie. Aucune
dependance JPA, aucun acces reseau, donc testable exhaustivement.

Ce que le frontend affiche n'est qu'une suggestion : le creneau est **recalcule
cote serveur** a la reservation, a partir de la duree de la prestation. Toute
duree ou heure de fin envoyee par le client est ignoree.

## Consequences

Positives : un prestataire peut changer de fuseau sans reecrire ses rendez-vous
passes. Le passage a un autre pays ne demande aucun changement de schema. Le
calcul de creneaux se teste sans base de donnees.

Negatives : deux representations coexistent, et confondre les deux est l'erreur
la plus facile a commettre. La conversion doit rester centralisee, sous peine
de la voir se disperser.

**Consequence de test, non negociable** : parce que UTC+0 sans heure d'ete
masque les bugs, les tests de propriete du calculateur de creneaux s'executent
**aussi** sous un fuseau a changement d'heure, `Europe/Paris`. Les cas limites
obligatoires sont : jour ferme, pause entre deux segments, exception de chaque
type, prestation plus longue que la fenetre restante, delai minimum, horizon
maximum, creneau a cheval sur minuit, et transition d'heure d'ete.

## A revisiter quand

Un prestataire doit exister sur plusieurs fuseaux a la fois, ou un employe
travaille dans un fuseau different de celui de son prestataire.
