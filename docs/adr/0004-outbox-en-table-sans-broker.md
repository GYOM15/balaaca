# ADR-0004 - Outbox en table drainee par un worker, sans broker

Statut : Accepte
Remplace la regle de transport du skill herite `outbox-messaging`.

## Contexte

Une reservation doit declencher des effets que sa transaction ne peut pas
posseder : une confirmation immediate, un rappel a 24 h, un rappel a 2 h, un
avis au prestataire. Ces envois passent par WhatsApp, SMS ou email - des appels
reseau lents et faillibles.

Deux pieges classiques :

- envoyer dans la requete HTTP de reservation : le client attend un fournisseur
  externe, et un echec d'envoi fait echouer une reservation pourtant valide ;
- ecrire en base puis publier vers un broker : deux systemes qui ne peuvent pas
  valider ensemble, donc soit un evenement perdu, soit un evenement fantome.

Le skill herite imposait un outbox relaye vers Redpanda.

## Decision

L'outbox transactionnel est conserve. Le **broker est supprime**.

La table `notifications` **est** l'outbox. Les lignes sont inserees dans la
**meme transaction** que le rendez-vous. Le `notification-worker`, deployable
separe, les draine :

```sql
SELECT ... FROM notifications
WHERE status = 'PENDING' AND scheduled_at <= now() AND next_attempt_at <= now()
ORDER BY scheduled_at
FOR UPDATE SKIP LOCKED
LIMIT 50
```

`FOR UPDATE SKIP LOCKED` autorise plusieurs workers concurrents sans double
envoi et sans configuration de broker. Une ligne passe a `SENT` **seulement
apres** l'acquittement du canal.

Toutes les autres regles du skill restent : idempotence par `dedupe_key`
UNIQUE, livraison au moins une fois donc deduplication systematique, backoff
exponentiel avec jitter, nombre maximal de tentatives puis etat `DEAD`,
annulation des notifications en attente lorsqu'un rendez-vous est annule ou
reporte, dans la meme transaction.

Le worker se connecte avec son propre role PostgreSQL de moindre privilege.

## Consequences

Positives : zero composant d'infrastructure supplementaire a exploiter,
surveiller et sauvegarder. La securite transactionnelle est identique a celle
d'un outbox relaye. Le debogage se fait avec une requete SQL.

Negatives : le polling introduit une latence egale a son intervalle. La table
grossit et exige une purge des lignes terminees. Un fan-out vers plusieurs
consommateurs independants demanderait du travail que le broker donnerait
gratuitement.

## A revisiter quand

Le volume depasse ce qu'un polling absorbe confortablement, ou un deuxieme
consommateur independant des memes evenements apparait. La table devient alors
un producteur vers un broker sans que le code metier change : il ecrit deja son
evenement au meme endroit.
