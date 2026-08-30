# Backlog

Ce qui est decide mais pas fait, avec la raison d'attendre. Un element sans
raison n'est pas un backlog, c'est un oubli.

## En attente de toi

### Credentials WhatsApp
**Bloque : toutes les notifications.** Le canal est ecrit contre le contrat
publie de la Graph API et teste contre un serveur factice qui parle le meme
protocole ; il ne manque que le compte. Sans lui, un salon decouvre ses
rendez-vous en rafraichissant une page.

Il faudra : `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (utilisateur
systeme), `WHATSAPP_BUSINESS_ACCOUNT_ID`, quatre modeles approuves avec l'ordre
de leurs parametres, et la decision **numero Balaaca ou numero du salon**
(recommandation : Balaaca — un seul compte a verifier, un seul quota a
surveiller, et un salon qui part n'emporte pas le numero).

Prendre le temps qu'il faut : c'est un abonnement payant et une verification
d'entreprise, et rien d'autre n'attend apres.

### Facturation et quotas de plan
`billing` a un fichier, `subscriptions` n'a aucune ligne de Java, et
`PLAN_LIMIT_REACHED` est dans le catalogue d'erreurs sans que rien ne le leve.

Ce n'est pas du code en attente, ce sont **quatre decisions** : quels paliers ;
ce que chaque palier limite (membres ? rendez-vous par mois ? services ?) ; le
prix en GNF ; et s'il y a un palier gratuit. Les inventer serait le pire des
deux mondes.

## Decide, chiffre, pas encore fait

### Limiter le rythme des inscriptions
`V020` a ferme l'oracle pour tout compte qui a deja un salon. Il reste qu'un
compte **sans** salon peut sonder les poignees, exactement comme n'importe quel
formulaire d'inscription qui repond « ce nom est pris ».

Le fermer demande une limite de debit, pas une erreur differente. `RATE_LIMITED`
(429) est deja publie et deja leve — mais pour la **contention** de reservation
(`BookingContendedException`), ce qui est un autre sujet : une limite
d'inscription aurait besoin d'un compteur, et Redis est deja dans la compose
pour cela.

A faire quand il y aura assez de salons pour que la liste vaille la peine d'etre
enumeree.

### Un vrai systeme d'alerte
Le worker journalise chaque notification morte en `ERROR`, avec le
`provider_id`, le type et la cle de deduplication. Cela suffit a une recherche,
pas a reveiller quelqu'un. Voir `DEPLOYMENT.md`.

### Deploiement, sauvegardes
La CI construit, teste et verifie le contrat. **Rien ne pousse sur le VPS**, il
n'y a pas de `pg_dump` planifie, et le repertoire des images n'est dans aucune
sauvegarde. Voir `DEPLOYMENT.md`.

## Translate the repository to English

**The last step, deliberately.** `code-language` has required English for
everything a developer reads since the pack was written - down to the ADRs and
the commit messages - and it was broken anyway: this README, this file, the
deployment runbook and the nine ADRs are French. Pull request descriptions were
too.

`RepositoryLanguageTest` now freezes that debt. Nothing new can be written in
French, and `language-waivers.txt` lists exactly what is owed. **The pass is
finished when that file holds nothing but comments** - which is a completion
criterion a build can check, rather than a feeling.

Order, when the time comes: `README.md` first (the first thing anyone reads),
then `DEPLOYMENT.md` (an operator is the reader least likely to speak French),
then this file, then the ADRs as one set - a half-French decision log is worse
than a French one.

What a **customer** reads is untouched by this. User-facing copy stays French
first for the launch market, from an i18n catalogue. The rule is that the
repository is English, not that the product is.

## Trous fonctionnels connus

- **Transfert de propriete.** Il y a un `OWNER` et rien ne le deplace.
- **La clientele.** `customers` se remplit a chaque reservation et aucun
  endpoint ne la lit : un salon ne voit ni sa clientele ni l'historique d'une
  personne.
- **Recherche geographique.** `latitude` et `longitude` existent, rien ne les
  ecrit, et l'annuaire filtre la ville en texte.
- **QR code et lien court** `platform/<salon>`.
- **`chatbot-service`** : le repertoire est vide.
