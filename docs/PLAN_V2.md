# Égide v2 : de la simulation à la plateforme

Objectif : un outil ludique, à la manière d'un jeu de stratégie en temps réel vu de dessus, capable de prouver la
qualité de ses simulations. Unités et algorithmes se rangent dans des fichiers ; la Terre est un ellipsoïde avec son
relief ; on place les unités et on trace les plans de vol à la souris ; chaque modèle explique sa physique.

## Décisions prises (4 novembre 2026)
- **Vue** : 2,5D vue de dessus d'abord, esprit jeu vidéo (MapLibre GL et deck.gl). Une vue 3D (CesiumJS) viendra ensuite.
- **Modèles réels** : uniquement dans `prive/` (hors git, ou lien vers un dépôt privé). Le catalogue public reste
  notionnel, par classe, avec des ordres de grandeur publics et leurs sources.
- **Ordre** : jalon 0, puis 1, puis les autres. Toutes les idées ci-dessous sont retenues.
- **Arborescence** sans accents (`unites/`, `algos/unites/`) pour éviter les écarts entre macOS, Windows et git.

## Versions
- **v0.2.0** : moteur géodésique, catalogue et algorithmes en fichiers, carte 2,5D, éditeur, physique expliquée
  (jalons 0 à 4).
- **v0.3.0** : outils de preuve (jalon 5), interface centrée sur la carte avec calques, radars placés (jalon 6, premier
  lot), réseau d'information avec pannes et Vue du PC (jalon 7, lots 1 et 2), relief dans le moteur (jalon 2).
- **v0.4.0** : circulation de l'information lisible (jalon 8), centres de détection et de contrôle et batteries
  désignées (jalon 9), drones défensifs (jalon 10), auto-configuration et bibliothèque de scénarios (jalon 11).
- **v0.5.0** : éditeur de déploiement (jalon 12) : palette du catalogue, unités de modèles différents, moyens de
  communication par unité et réseau automatique, fiche d'unité (modèle, algorithmes), sauvegarde et import ; guide
  d'extension du catalogue ; README en guide utilisateur.
- **v0.6.0** : catalogue de 35 unités fictives par pays et icônes de jeu ; gomme, Maj+clic et « Tout effacer » dans
  l'éditeur.
- **v0.7.0** : formats d'échange pour outils externes (spécification, schémas JSON, validateur) ; plan des jalons 13 à
  15 (Déployer en 2D, Observer en 3D, sortie vers un moteur de jeu).
- **v0.8.0** : import du catalogue privé dans l'interface (page Catalogue : public seul, fusion ou remplacement,
  appliqué à la palette) ; six pays et huit icônes de jeu de plus ; arme déposée sur un avion chargée avec le scénario.
- **v0.8.1** : fond de carte par défaut sur les photographies IGN (Géoplateforme, sans clé) au lieu de CARTO, dont les
  tuiles exigent désormais une clé.

## Arborescence cible
```
unites/<famille>/<classe>/<unite>.json      catalogue public (notionnel), héritage par herite_de
unites/liaisons/  unites/terrains/          moyens de communication, reliefs (grilles d'altitudes)
prive/unites/…   prive/algos/…              catalogue privé, identifiants préfixés « prive/ »
algos/global/<role>/<algo>.js               détection, pistage, allocation, guidage, mouvement, comportement
algos/unites/<chemin de l'unité>/<role>.js  algorithmes propres à une unité
cartes/fonds/  cartes/relief/  cartes/batiments/   sources déclarées (tuiles, MNT, bâti), sans code
scenarios/                                  placements, plans de vol, zones, météo
```

## Jalons et critères de preuve

| Jalon | Contenu | Critère de preuve | État |
|---|---|---|---|
| 0 | Socle géodésique 3D, catalogue minimal, scénario v2 par chemins, migration v1 | Statistiques de la v0.1 retrouvées à moins de 3 σ ; géodésie sur exemples GeographicLib | **fait** |
| 1 | Registre d'algorithmes par rôle, portage du comportement actuel dans `algos/global/`, suite de conformité, index du catalogue | Bilans du jalon 0 rendus à l'identique ; conformité appliquée à tout fichier déposé | **socle fait** — pas de bibliothèque publique de modèles d'armes : ces modèles relèvent de `prive/` |
| 2 | Globe et carte 2,5D (MapLibre), sources configurables, relief dans le moteur (masquage radar), couverture réelle, tuiles hors ligne (PMTiles) | Sur relief plat, l'horizon calculé retrouve le § 2 | **fait** : fond de carte (MapLibre embarqué, 5 fonds, relief ombré et 3D, bâtiments 3D, globe) ; relief dans le moteur (terrains du catalogue, masques d'horizon, vue directe des liaisons, couverture réelle, MODELE § 16). Reste : tuiles de fond de carte hors ligne (PMTiles) |
| 3 | Éditeur façon jeu de stratégie : palette, glisser-déposer, sélection, groupes Ctrl+1–9, ordres enchaînés, plans de vol, vue en profil, zones dessinées, ordres en direct rejoués | Un raid avec ordres en direct se rejoue à l'identique | **fait** : cibles, orbites, plan de vol, zones, sélection, groupes, envoi, annulation, ordres en cours de raid rejoués, vue en profil |
| 4 | Physique expliquée : niveaux de fidélité, fiches (équations, hypothèses, validité, sources), inspecteur « pourquoi » | Chaque formule codée a sa fiche ; chaque fiche cite le code | **fait** : explorateur `catalogue.html`, inspecteur au clic, renvois au modèle vérifiés |
| 5 | Preuve : convergence en pas de temps, sensibilité (Morris, Sobol), duel A/B, empreinte de reproductibilité, dossier de preuve | Les résultats publiés portent leur empreinte et leur convergence | **outils faits** en ligne de commande (`src/preuve.js` : empreinte, convergence, duel apparié, Morris, dossier) ; Sobol et duel en écran partagé à faire |
| 6 | Idées ci-dessous, par lots | Selon l'idée | **en cours** : interface centrée sur la carte, radars placés et déplaçables, calques par type d'unité |
| 7 | Réseau d'information : liaisons paramétrables entre unités, synoptique de connectivité, situation perçue par unité | Avec un réseau entièrement connecté sans délai, bilans identiques à aujourd'hui | **lots 1 et 2 faits** : moyens filaire, radio, satellite, optique ; liaisons avec latence et portée ; synoptique ; outil Liaison ; latence des consignes ; pannes datées ; PC visé par l'essaim ; vue du PC. Reste : débit, brouillage, liaisons entre drones, postes sol en réseau |
| 8 | Lisibilité de l'information : impulsions animées le long des liaisons, journal « qui a vu quoi, qui a informé qui, quand », chaîne complète dans l'inspecteur | Chaque détection, transmission, mission et tir du moteur apparaît, à son instant, dans le journal | **fait** (MODELE § 17) |
| 9 | Centre de détection et de contrôle (CDC) : plusieurs centres, fusion des pistes, diffusion aux avions, aux batteries sol (désignation : tir plus tôt quand elles sont prévenues) et aux autres centres | Un CDC unique relié à tout, sans délai, redonne les bilans d'aujourd'hui | **fait** (MODELE § 18) ; reste : partage de charge entre centres, saturation d'un centre |
| 10 | Essaims de drones défensifs, notionnels par classe : armés, brouilleurs, intercepteurs kamikazes | Conformité du catalogue ; effet mesuré en duel apparié | **fait** (MODELE § 19) |
| 12 | Éditeur de déploiement : palette du catalogue, dépôt de chaque unité sur la carte (radars de modèles différents, batteries, C2, sites, avions, drones défensifs), moyens de communication par unité et liaisons sur moyen commun, réseau automatique, fiche de l'unité (modèle, algorithmes par rôle, effectifs), sauvegarde et import | Sans dépôt, bilans identiques ; résolution du déploiement identique en JavaScript et en Python | **fait** (MODELE § 21) |
| 13 | Mode Déployer en 2D stricte : vue de dessus verrouillée en édition, unités dessinées par la carte (couches MapLibre), regroupement et niveaux de détail, aperçus avant pose ([PLAN_3D.md](PLAN_3D.md)) | Une unité posée reste à sa position à toute échelle ; image identique à l'ancien rendu | à faire |
| 14 | Mode Observer en 3D (CesiumJS) : entités à leur altitude, couvertures radar en volumes masqués par le relief, liaisons et traînées en 3D, caméras, inspection, hors ligne ([PLAN_3D.md](PLAN_3D.md)) | Mêmes positions qu'en 2D à 1 m près ; volumes calculés par le moteur ; ≥ 30 images/s hors ligne | à faire |
| 15 | Sortie vers un moteur de jeu, en plus des vues du navigateur : format de rejeu, export du terrain, client de référence Godot, flux en direct ([PLAN_3D.md](PLAN_3D.md)) | Rejeu relu par le client aux mêmes positions et au même bilan | à faire |
| 16 | Essaim réactif : l'essaim apprend de ses pertes (réseau maillé), contourne les foyers défendus, se réaffecte vers les cibles qui laissent passer, esquive les tirs air (MODELE § 22) | Sans réaction, bilans identiques ; effet mesuré en duel apparié | **fait** : algorithme `global/reaction/essaim_adaptatif`, bascule « Réactif » (R), journal et inspecteur ; +18 % à +63 % de frappes sur la référence (duel apparié, 10 graines, MODELE § 22.6) |
| 11 | Auto-configuration : menaces à considérer, moyens disponibles du catalogue (quantités), zone dessinée ou pays (Natural Earth, domaine public), répartition des radars, CDC, batteries et avions qui minimise les frappes, vérifiée par simulation, enregistrée dans une bibliothèque de scénarios | La répartition proposée fait au moins aussi bien qu'une répartition uniforme, à IC 95 % | **fait** (MODELE § 20) : recherche locale sur trois paramètres ; reste : répartition des postes par cible, nombre de radars optimisé, recherche globale |

## Idées retenues

**Prouver la qualité**
- Test de convergence : diviser le pas de temps jusqu'à stabilité des résultats.
- Analyse de sensibilité (Morris puis Sobol) : quels paramètres pilotent les fuites.
- Duel A/B : même graine, deux configurations en écran partagé, écart chiffré.
- Empreinte : condensé scénario + catalogue + versions d'algorithmes joint à chaque résultat.
- Validation des modèles de mouvement sur trajectoires ADS-B publiques.
- Dossier de preuve généré : hypothèses, résultats avec IC, convergence.

**Réalisme**
- Météo et nuit : vent, plafond, visibilité, effets sur l'IR et la désignation laser.
- Radar à courbes de probabilité de détection : SER, Swerling, fouillis de sol, fausses alarmes.
- Chaîne de commandement : latences de liaison, perte d'un nœud.
- Guerre électronique : brouillage, leurres.
- Logistique : retour à la base pour réarmer, vagues successives.

**Jeu et analyse**
- Brouillard de guerre : vérité terrain contre situation perçue, et l'écart entre les deux comme mesure.
- Équipe rouge automatique : algorithme génétique qui cherche le pire plan d'attaque.
- Optimiseur de déploiement bleu : où placer postes et orbites pour minimiser les fuites.
- Coût-efficacité : coût par interception, ratio d'échange.
- Cartes de chaleur (couverture réelle, couloirs de fuite) et enveloppes de tir.
- Missions défis ; rouge contre bleu à deux joueurs.

**Réseau et gestion de l'information** (demandé par l'utilisateur)
- Relier les unités entre elles par des moyens de communication : liaisons filaires, radio, satellite, optiques, entre
  unités de la défense comme entre drones de l'essaim, et liaisons mixtes.
- Chaque liaison paramétrable comme le reste (fichiers d'unités de liaison : débit, latence, portée, visibilité
  directe, sensibilité au brouillage) ; un radar n'alimente pas forcément tout le monde.
- Vue synoptique de la connectivité sur la carte : qui parle à qui, par quel moyen, avec quel retard ; l'information
  disponible pour chaque unité devient sa situation perçue.
- Par défaut, et jusque-là : tout le monde parle avec tout le monde, sans délai (MODELE § 15.2).

**Interopérabilité**
- Export ASTERIX des plots et pistes simulés (UDP) vers un système C2 ou des outils de test d'interfaces radar.
- Import et export KML / GeoJSON.

## Suggestions retenues
Toute suggestion proposée pendant le développement est retenue d'office (décision de l'utilisateur) et rangée ici
par thème, avec le jalon qui la portera. Elles se réalisent par lots, comme les idées ci-dessus.

| Thème | Suggestion | Jalon | État |
|---|---|---|---|
| Preuve | **Différentiel de scénario** : chaque résultat porte les chemins modifiés par rapport à la référence | 5 | **fait** (`src/preuve.js`, campagnes) |
| Preuve | **Réglages inertes** : griser les réglages que l'algorithme en jeu ne lit pas (`meta.parametres` × scénario) ; Morris a montré que `rouge.etalement_s` est inerte hors tactique dispersée | 5 | à faire |
| Preuve | **Un générateur par entité** : un flux de hasard par drone et par tireur (graine dérivée), pour que les duels restent synchronisés et que le gain des nombres communs monte | 5 | à faire |
| Preuve | **Pas adaptatif vérifié** : choisir le plus grand pas qui passe le test de convergence et l'inscrire au dossier | 5 | à faire |
| Preuve | **Tornade dans l'interface** : Morris en diagramme μ*–σ et en tornade ; cliquer un facteur lance son balayage | 5 | à faire |
| Preuve | **Duel de réseaux** : comparer deux architectures de liaisons sur les mêmes graines | 7 | à faire |
| Réseau | **Panne et attaque du réseau** : couper une liaison ou un nœud à un instant donné (comme un ordre) ; le centre de conduite devient une cible possible | 7 | **fait** |
| Réseau | **Situation perçue à l'écran** : basculer entre vérité terrain et ce que sait la conduite (pistes connues et leur retard) | 7 | **fait** (Vue du PC ; retard des pistes à représenter) |
| Menace | **Autonomie et sites de lancement** : drones partis de sites réels, à des centaines de km, avec une autonomie qui contraint les couloirs crédibles | 6 | à faire |
| Catalogue | **Explorateur du catalogue** : unités, héritage, sources, fidélité | 4 | **fait** (`catalogue.html`) |
| Catalogue | **Équations mises en forme** : KaTeX embarqué dans `vendor/`, équations reliées aux paragraphes du modèle | 4 | à faire |
| Catalogue | **Comparer deux fiches** : deux unités ou deux algorithmes du même rôle côte à côte, écarts surlignés | 4 | à faire |
| Catalogue | **Fiche de dépôt** : quand la conformité refuse un fichier privé, montrer la règle violée et la ligne fautive | 1 | à faire |
| Éditeur | **Chronologie des ordres** : frise sous la lecture, chaque ordre à retrouver, déplacer ou supprimer | 3 | à faire |
| Éditeur | **Zones à effet** : couloir d'entrée imposé à l'essaim, zone d'exclusion pour les avions | 3 | à faire |
| Éditeur | **Mini-carte** : vignette du théâtre avec le cadre de la vue, cliquable | 3 | à faire |
| Éditeur | **Sélection par type** : double-clic sur une unité, toutes celles du même type visibles sont sélectionnées | 3 | à faire |
| Éditeur | **Formations** : avions sélectionnés répartis en cercle, ligne ou grille autour du point visé | 3 | à faire |
| Carte | **Export vidéo du raid** : enregistrer la vue animée en vidéo ou GIF depuis l'interface | 2 | à faire |
| Carte | **Scénario dans l'adresse** : modifications, graine et vue encodées dans l'URL, à partager d'un lien | 2 | à faire |
| Carte | **Brouillard de carte** : assombrir ce que les capteurs ne couvrent pas | 2 | à faire |
| Menace | **Routes sous le masque** : un comportement d'essaim qui choisit ses couloirs dans les vallées, là où les masques d'horizon cachent l'approche | 6 | à faire |
| Carte | **Couverture combinée** : carte de chaleur du nombre de radars qui voient chaque point, à l'altitude de l'essaim, pour lire les trous d'un coup d'œil | 2 | à faire |
| Carte | **Terrain réel d'exemple** : fabriquer et livrer avec le dépôt un terrain réel du théâtre de référence (`node outils/terrain.js`, depuis un poste qui a le réseau) | 2 | à faire |
| Défense | **Brouillage calibré** : relier la constante de temps du brouillage à des classes notionnelles de brouilleur et de cible (l'effet pèse lourd sur le bilan : 30 brouilleurs font passer les frappes de 404 à 134 ± 98) | 10 | à faire |
| Défense | **Bases et autonomie des drones défensifs** : décollage depuis des bases placées, endurance, retour et relance | 10 | à faire |
| Auto-configuration | **Moyens au plus juste** : chercher les moyens les plus réduits qui tiennent un seuil de frappes (l'autre objectif proposé) | 11 | à faire |
| Auto-configuration | **Postes inégaux** : répartir les postes sol selon l'exposition de chaque cible plutôt qu'à parts égales | 11 | à faire |
| Déploiement | **Postes en réseau propre** : une batterie placée a son propre nœud réseau (aujourd'hui, celui du site le plus proche) | 12 | à faire |
| Déploiement | **Liaisons entre vecteurs** : relais radio entre groupes d'avions ou de drones dans le réseau automatique | 12 | à faire |
| Déploiement | **Sélection après dépôt** : l'unité déposée est sélectionnée et sa fiche s'ouvre | 12 | à faire |
| Déploiement | **Algorithme de détection par site** : chaque radar choisit son algorithme, pas seulement son modèle | 12 | à faire |
| Catalogue | **Catalogue par pays et icônes de jeu** : unités fictives inspirées de classes de différents pays (noms de plantes, valeurs de classe arrondies), silhouettes SVG sur pastille de pays, filtre de la palette par pays | 12 | **fait** |
| Catalogue | **Icônes orientées** : les silhouettes de vecteurs tournées selon leur cap | 12 | à faire |
| Catalogue | **Icônes des C2 et des sites** sur la carte (la palette les montre déjà) | 12 | à faire |
| Catalogue | **Formats d'échange** : spécification (docs/FORMATS.md), schémas JSON générés depuis le catalogue, validateur `node outils/valider.js` (rapport `--json`) pour les outils externes | 12 | **fait** |
| Catalogue | **Import du catalogue privé** : page Catalogue, choix Public seul / Fusionner / Remplacer, retenu dans le navigateur et appliqué à la palette ; index `prive/unites/index.json` par `node outils/indexer.js` | 12 | **fait** (`src/vue/catalogue_prive.js`) |
| Catalogue | **Schéma JSON du scénario** généré depuis `scenarios/reference.json` | 12 | à faire |
| Carte | **Théâtres prédéfinis** : choisir le centre du théâtre par un nom de lieu, liste de théâtres d'exemple | 0 | à faire |
| Essaim réactif | **Défense qui s'adapte en retour** : la conduite réaffecte avions et munitions vers les cibles où l'essaim se reporte (course aux armements rouge contre bleu) | 16 | à faire |
| Essaim réactif | **Rôles dans l'essaim** : éclaireurs sacrifiés pour sonder la défense, leurres qui attirent les tirs, frappeurs qui attendent la brèche | 16 | à faire |
| Essaim réactif | **Couper le maillage de l'essaim** : brouillage de ses liaisons, l'essaim n'apprend plus ses pertes (ou plus tard) | 16 | à faire |
| Essaim réactif | **Meilleure réponse rouge** : l'auto-configuration cherche les réglages de réaction qui maximisent les frappes contre un dispositif donné, pour éprouver la défense au pire cas | 16 | à faire |
