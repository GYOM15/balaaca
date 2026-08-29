# ADR-0005 — Aucun paiement construit maintenant, coutures preparees

Statut : Accepte

## Contexte

Deux besoins de paiement sont anticipes, aucun n'est immediat :

- **A. Abonnement** : apres une periode gratuite, un prestataire paie la
  plateforme. Les plans (`FREE`, `PRO`, `BUSINESS`) portent des quotas qui
  conditionnent le produit.
- **B. Paiement des prestations avec sequestre** : un client paierait la
  prestation sur la plateforme, qui gelerait les fonds jusqu'a confirmation du
  service par les deux parties. Explicitement lointain.

La proposition initiale etait d'extraire l'abonnement dans un service separe
communiquant par gRPC, et de garder le paiement des prestations dans le core.

## Decision

**Rien n'est construit maintenant.** Ni module de paiement, ni grand livre, ni
adaptateur PSP, ni `.proto`.

Deux distinctions structurent la decision.

**Les droits ne sont pas l'encaissement.** Sous le mot « abonnement » se
cachent deux systemes sans rapport : les **droits** (« ce prestataire est en
FREE, donc 5 prestations au maximum »), qui sont une regle produit lue sur
presque chaque ecriture du core ; et l'**encaissement** (debiter, facturer,
relancer, traiter les webhooks), a faible frequence et a I/O externe.

Les **droits restent in-process** dans le contexte `billing` du monolithe. Les
externaliser transformerait chaque `POST /services` en appel reseau synchrone :
une panne du module le moins critique bloquerait la creation de prestations,
ou ouvrirait les quotas. Le contournement habituel — mettre le plan en cache
dans le core — revient exactement a le garder dans le core, avec en plus la
machinerie de synchronisation.

L'**encaissement** pourra devenir un deployable separe. Mais alors la couture
naturelle est un **evenement** (« le paiement a reussi » → activer le plan),
pas un appel synchrone : une fois les droits restes dans le core, il ne reste
aucun appel synchrone core → facturation. gRPC couterait la chaine `.proto`,
les stubs, le mTLS et la discipline de versionnement pour acheter du streaming
et de la faible latence dont il n'y a aucun usage ici.

**La plateforme ne doit jamais detenir les fonds.** Geler l'argent d'un tiers
fait de Balaaca un intermediaire de paiement : agrement BCRG, KYC/LCB-FT,
comptes clients segregues. Le chemin realiste est un PSP qui gere lui-meme la
capture differee ou le paiement fractionne, la plateforme orchestrant sans etre
depositaire. Si les fonds ne sont jamais detenus, aucun grand livre de soldes
clients n'est necessaire — ce qui supprime le principal argument en faveur d'un
service separe.

## Ce qui est fait des maintenant

Uniquement ce qui coute zero aujourd'hui et cher plus tard :

1. `Money(amountMinor, Currency)` type partout ; la devise porte son echelle ;
   GNF n'est jamais code en dur.
2. Le prix fige sur le rendez-vous est nomme pour **ce qu'il signifie** (ce que
   le client doit), afin qu'une commission ou un reversement s'ajoutent plus
   tard sans rendre les lignes historiques ambigues.
3. La machine a etats du rendez-vous est deja atomique et conditionnelle en
   base, parce que le paiement conditionnera un jour ces transitions.
4. Rien de financier n'est jamais supprime physiquement.
5. `Idempotency-Key` est deja exige a la reservation : c'est la meme machinerie.
6. Un ADR enregistre ce que signifie un prix affiche aujourd'hui : ce que le
   client paie, sans composante fiscale ni commission visible.

## Consequences

Positives : aucune architecture fantome. La decision de topologie est reportee
au moment ou les faits seront connus.

Negatives : la faisabilite du sequestre depend de capacites PSP non verifiees —
notamment de savoir si un rail mobile money guineen autorise une autorisation
sans debit immediat. Cette investigation est deliberement reportee au moment de
l'implementation.

## A revisiter quand

L'abonnement doit reellement etre encaisse, ou le paiement des prestations
entre au programme. L'investigation des rails de paiement se fera alors, pas
avant.
