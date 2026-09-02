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
(recommandation : Balaaca - un seul compte a verifier, un seul quota a
surveiller, et un salon qui part n'emporte pas le numero).

Prendre le temps qu'il faut : c'est un abonnement payant et une verification
d'entreprise, et rien d'autre n'attend apres.

### Facturation et quotas de plan
`billing` a un fichier et `subscriptions` n'a aucune ligne de Java.

Ce n'est pas du code en attente, ce sont **quatre decisions** : quels paliers ;
ce que chaque palier limite (membres ? rendez-vous par mois ? services ?) ; le
prix en GNF ; et s'il y a un palier gratuit. Les inventer serait le pire des
deux mondes.

`PLAN_LIMIT_REACHED` **est sorti du catalogue d'erreurs**. Il y etait publie
alors qu'aucun chemin ne pouvait le lever : un client qui branchait dessus
branchait sur quelque chose qui ne pouvait pas arriver. Il reviendra le jour ou
les paliers existent. `ErrorCatalogueTest` verifie desormais les deux sens, donc
un code publie sans producteur casse la construction.

## Decide, chiffre, pas encore fait

### ~~Limiter le rythme des inscriptions~~ (fait)
`V020` a ferme l'oracle pour tout compte qui a deja un salon. Il reste qu'un
compte **sans** salon peut sonder les poignees, exactement comme n'importe quel
formulaire d'inscription qui repond « ce nom est pris ».

Le fermer demande une limite de debit, pas une erreur differente. `RATE_LIMITED`
(429) est deja publie et deja leve - mais pour la **contention** de reservation
(`BookingContendedException`), ce qui est un autre sujet : une limite
d'inscription aurait besoin d'un compteur, et Redis est deja dans la compose
pour cela.

A faire quand il y aura assez de salons pour que la liste vaille la peine d'etre
enumeree.

### ~~Un vrai systeme d'alerte~~ (fait)
Un port `Alerter`, deux canaux - le journal par defaut, un webhook si
`balaaca.alerts.channel=webhook`. La destination reste ton choix : un bot
Telegram, un hook Discord, un sujet ntfy, un webhook Slack acceptent tous la
meme forme.

Le point difficile n'etait pas d'envoyer un message mais de ne pas en envoyer
quatre cents : une panne de canal produit une notification morte par message, et
un canal qui en recoit quatre cents est un canal qu'on coupe - apres quoi plus
rien n'alerte. Une alerte par type et par fenetre, et la suivante dit combien
elle represente.

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

## Ce que le design montre et que le contrat ne sert pas

Releve en reproduisant le prototype ecran par ecran, le 2026-09-01. Chaque
ligne est un element du design rendu sans cette donnee, ou retire. **Rien n'a
ete invente et rien n'a ete ajoute au backend.** A decider une par une.

### L'annuaire, la ou ca se voit le plus

- **`ProviderSummary` n'a ni les modes ni un prix a partir de.** Les pastilles
  `Sur place / Depot / A domicile` et le `des 90 000 GNF` sont sur chaque carte
  du design - accueil, recherche, collections. Les deux absents, tout le pied
  de carte disparait. `fulfilments: Fulfilment[]` et `price_from: Money`
  finiraient la carte. C'est la plus visible des lacunes.
- **`GET /v1/providers` n'accepte pas de parametre de mode.** Le groupe de
  cases `Mode` des filtres est retire plutot que d'expedier trois cases qui ne
  filtrent rien. Un parametre `fulfilment` repetable le rendrait.
- **`LocalityView` n'a pas de `provider_count`.** La bande Lieux de l'accueil
  compte huit tuiles chiffrees ; seule `/v1/areas` publie un lieu avec un
  compte, donc la bande montre les quartiers les plus fournis au lieu des
  communes du design.
- **Pas de total.** `ProviderSummaryPage` publie la page et `next_cursor`, donc
  la barre dit "N sur cette page" et non "23 professionnels".

### Le reste, par ecran

- `CategoryFamily` n'a pas de description : le sous-titre sous chaque famille
  sur /metiers. `CategoryView` n'a pas d'alias de recherche : taper
  "barbiers" ne trouve plus rien.
- `PublicProviderView` n'a pas d'annee de creation (`depuis 2016`).
  `PublicStaffMember` n'a pas de `bookable` : la pastille `Non reservable`.
- `CustomerBookingView` n'a ni `fulfilment` ni `turnaround_hours` : la ligne
  Deroulement et la note de mode sont deduites de la prestation nommee.
  `available-slots` ne distingue pas un jour ferme d'un jour complet.
- `GET /v1/appointments` n'a pas de filtre de mode : la file des depots est
  filtree cote client sur +/-90 jours, limite 200. Elle tronque pour un salon
  charge, et le compteur Agenda de la barre laterale est un plancher.
- `ServiceOfferingView` n'a pas de photo : une vignette par ligne coute une
  requete par prestation.
- `CustomerSummaryView` n'a ni `has_notes` ni `no_show_count` ;
  `CustomerVisitView` ne porte aucun montant : le prix de chaque visite de
  l'historique.
- **Moderation : aucune operation ne liste les etablissements.** L'ecran
  `moderation/businesses` du design n'a aucune source. `ProviderProfileView`
  n'a pas de `report_count`, `ProviderReportView` n'a pas la reference de
  reservation, et rien ne renvoie l'identite de l'operateur.
- **Compte et Reglages** : ni verification d'e-mail ni changement de mot de
  passe cote contrat - c'est Keycloak. Les commandes sont dessinees et
  desactivees, avec la phrase qui le dit.
- `409 SLUG_UNAVAILABLE` ne porte aucune suggestion d'adresse : l'ecran du
  design en propose une.
- **`design.html` montre SIX statuts de rendez-vous, l'API en a cinq.** Le
  sixieme est `Pret`, qui existe deja comme `ready_at` sur un depot sans etre
  un statut.

## Trous fonctionnels connus

- **`customers.blocked`.** La colonne existe, rien ne l'ecrit, et
  `SchemaCoverageTest` ne s'en apercoit pas : sa recherche est une sous-chaine,
  et `blockedFrom` contient `blocked`. **Deux choses a faire** : resserrer la
  barriere sur des limites de mot, puis decider ce que bloquer un client veut
  dire au moment de reserver. La premiere revelera probablement d'autres
  colonnes, chacune demandant une decision.
- **Tout le vocabulaire francais du produit est sans accents.** Les 35 metiers
  (`Esthetique`, `Video`, `Patisserie`, `Electricite`, `Demenagement`), les 8
  familles (`Beaute`, `Evenementiel`) et les 51 localites (`Boke`, `Labe`,
  `Nzerekore`, `Gueckedou`, `Telimele`) sont semes sans accents par V016, V025
  et la carte des localites. C'est du texte client, affiche sur la page
  d'accueil, dans chaque carte et dans la recherche.
  **Le piege** : `ProviderDirectorySqlRepository` fait
  `c.label_fr ILIKE '%' || :name || '%'` sans `unaccent`. Accentuer les
  libelles seuls **casse la recherche** pour qui tape « esthetique » au clavier,
  ce que fera tout le monde. Les deux vont ensemble : une migration qui
  accentue, et une colonne generee `translate(lower(label_fr), 'aeiou accentues',
  'aeiou')` indexee en trigramme sur laquelle le `ILIKE` porte - `translate` et
  `lower` sont IMMUTABLE, `unaccent()` ne l'est pas et ne s'indexe donc pas
  directement. Compter une demi-journee. Trouve en faisant tourner la pile.
- **`chatbot-service`** : hors perimetre. Ce sera un service Python
  completement detache, et pas maintenant.

## Fait

Le recours : un prestataire suspendu repond a la plateforme, relit son message,
et l'exploitant le lit dans une file a cote des signalements. Les photos par
prestation, cinq au plus, avec redimensionnement a 1600 px qui regle le poids et
ferme la steganographie dans les bits de poids faible. Le fil d'onboarding :
`GET /v1/provider-profile/readiness` dit ce qui manque AVANT le refus, avec les
memes predicats que la barriere.

Transfert de propriete, la clientele (trois routes plus les ecrans),
`latitude`/`longitude` retires et remplaces par la commune et le quartier sur la
page publique, QR code et lien public, limite de debit sur les inscriptions, et
le texte mort `PENDING` dans les quatre objets qui le citaient encore. Verifie
en base : plus aucune fonction, vue ou politique ne nomme un statut de
prestataire inatteignable. Les deux occurrences restantes parlent du statut d'un
rendez-vous et du statut d'un signalement, tous deux bien reels.

Cote front, les cinquante-cinq operations publiees sont toutes appelees.
