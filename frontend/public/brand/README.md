# La marque

`logo.png` et `logo-inverse.png` sont ce que le site affiche. Les remplacer
suffit : aucun code ne les nomme autrement que par ce chemin.

| Fichier | Fond | Où |
|---|---|---|
| `logo.png` | ivoire | en-tête, pied de page |
| `logo-inverse.png` | vert profond | barre latérale du carnet, couverture d'une page prestataire |
| `favicon-512.png` | — | onglet du navigateur, écran d'accueil d'un téléphone |

## D'où viennent ces fichiers, et leur limite

Ce sont des **découpes de la charte graphique**, une image de 1536 × 1024 px.
Le monogramme y est rendu à une soixantaine de pixels ; ces fichiers sont donc
agrandis à 256 px depuis cette source, avec les coins détourés.

À 26 px dans l'en-tête et à 32 px en favicon, la charte donne elle-même 16 px
comme taille minimale : c'est net et cela suffit.

**Ce que ces fichiers ne peuvent pas faire**, et c'est la raison de cette note :

- l'icône d'application en 1024 px que la charte demande (section 09) ;
- l'impression — carte de visite, enseigne, tampon (section 10) ;
- toute mise à l'échelle au-delà de 256 px.

Pour cela il faut le **vectoriel** : le `.svg`, le `.ai` ou le `.pdf` d'origine.
Déposé ici sous le même nom avec l'extension `.svg`, il remplace la découpe et
la ligne à changer est dans `src/components/ui.tsx`.

## Ce que la charte interdit

Déformation, changement de couleurs, effets et ombres, rotation, mauvais
contraste, ajout d'éléments. C'est pourquoi le monogramme n'a pas été redessiné
à la main depuis l'image : une approximation d'une marque est précisément ce que
cette liste proscrit.
