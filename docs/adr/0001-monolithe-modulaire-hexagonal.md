# ADR-0001 - Monolithe modulaire hexagonal plutot que microservices

Statut : Accepte

## Contexte

Balaaca est un hub de prestataires. Une reservation touche, dans un seul geste
metier, le prestataire, sa prestation, ses disponibilites, son carnet clients,
le rendez-vous lui-meme et les notifications a planifier. L'equipe est reduite.
La cible de deploiement est un VPS.

Un decoupage en microservices imposerait une transaction distribuee la ou une
transaction ACID unique suffit, pour un benefice nul a cette echelle.

## Decision

Un **monolithe modulaire hexagonal**, un module Maven par contexte borne :

`shared-kernel`, `identity`, `providers`, `catalog`, `scheduling`, `booking`,
`billing`.

Chaque contexte est decoupe en quatre couches, dependances dirigees vers
l'interieur : `domain/` (sans framework), `ports/{inbound,outbound}`,
`application/`, `adapters/{inbound,outbound}`.

Un contexte parle a un autre par **appel Java in-process** a travers son port
entrant. Il n'y a **ni gRPC ni fichier `.proto`** dans ce projet.

Deux composants sont deployes separement parce que leur profil d'execution est
different : `notification-worker` (asynchrone, I/O reseau lente) et
`chatbot-service` (squelette).

Le module Maven est le moyen : il rend la violation de frontiere impossible a
la compilation, pas seulement detectable en revue. ArchUnit couvre le reste.

## Consequences

Positives : une reservation reste une transaction ACID unique. Un seul artefact
a deployer, a surveiller et a restaurer. Le refactoring inter-contextes reste
un refactoring de compilateur.

Negatives : la discipline de frontiere repose sur les modules Maven et
ArchUnit, jamais sur la bonne volonte. Le build est plus lent qu'un module
unique. Un contexte mal decoupe se paie par un cycle de dependances que le
build refusera.

## A revisiter quand

Un pilote nomme apparait pour extraire un contexte : mise a l'echelle
independante, isolation de panne, cadence de deploiement propre, propriete par
une autre equipe, technologie que le monolithe ne peut pas heberger, ou
frontiere reglementaire. « C'est plus propre » n'en est pas un.

L'extraction deplace la frontiere de **deploiement** ; la frontiere metier (le
port) ne bouge pas. C'est ce qui rend l'extraction peu couteuse plus tard et
inutile aujourd'hui.
