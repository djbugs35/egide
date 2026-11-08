// Contenu de la vue 3D (jalon 14, MODELE § 23) : ce que la scène montre à un instant, lu dans le monde comme la 2D, et
// décodage du relief. Pur, sans Cesium ni DOM, testé : les positions sont celles du moteur, sans second calcul.
import {cap_vers, direct, vers_degres} from "../moteur/geodesie.js";
import {horizon_radar} from "../moteur/geometrie.js";
import {parametres_radar, portee_site, positions_radars} from "../moteur/radars.js";
import {couverture_reelle} from "../moteur/terrain.js";
import {position_noeud} from "./reseau_vue.js";
import {calque_vecteur} from "./symboles.js";

const position = ({lat, lon, alt}) => ({lat_deg: vers_degres(lat), lon_deg: vers_degres(lon), alt: alt ?? 0});

/** Rendre les drones en vol à montrer : {id, lat_deg, lon_deg, alt (m), detecte, cap (rad)} ; `montre` restreint (vue du CDC). */
function drones_scene(monde, calques, montre) {
  return monde.drones
    .filter((d) => d.vivant && !d.arrive && monde.t >= d.depart && calques[d.detection === null ? "drones_inconnus" : "drones_detectes"] && montre(d))
    .map((d) => ({id: `d${d.id}`, ...position(d.geo), detecte: d.detection !== null, cap: d.route.length ? cap_vers(d.geo, d.route[0].geo) : 0}));
}

/** Rendre les avions et drones défensifs à montrer, à leur altitude ; `vide` : plus de munitions. */
function vecteurs_scene(monde, calques) {
  return monde.avions
    .filter((avion) => !avion.perdu && calques[calque_vecteur(avion)])
    .map((avion) => ({id: `v${avion.id}`, ...position(avion.geo), icone: avion.groupe.icone ?? "turbopropulseur", vide: avion.munitions === 0, camp: "ami", sol: false}));
}

/** Rendre les unités au sol : radars sur leur mât, batteries, centres et cibles ; `alt` est la hauteur au-dessus du sol. */
function fixes_scene(monde, calques) {
  const {scenario} = monde;
  const radars = !calques.radars ? [] : positions_radars(scenario).map((geo, i) => ({id: `r${i}`, ...position(geo), icone: parametres_radar(scenario, i).icone ?? "radar_pylone", camp: "ami"}));
  const batteries = !calques.postes ? [] : monde.postes.filter((p) => p.batterie !== undefined && p.munitions > 0)
    .map((p) => ({id: `b${p.batterie}`, ...position(p.geo), alt: 0, icone: p.unite.icone ?? "batterie_moyenne", camp: "sol"}));
  const centres = !calques.reseau ? [] : monde.reseau.centres.map((c, k) => ({id: `c${k}`, ...position(c.geo), alt: 0, icone: "c2", camp: "ami"}));
  const cibles = !calques.cibles ? [] : monde.cibles.map((c, k) => ({id: `s${k}`, ...position(c.geo), alt: 0, icone: "site", camp: "sol"}));
  return [...radars, ...batteries, ...centres, ...cibles].map((e) => ({...e, sol: true, vide: false}));
}

/** Rendre {drones, unites, icone_drone} à montrer à l'instant du monde, selon les mêmes calques que la 2D. */
export function entites_scene(monde, calques, montre = () => true) {
  return {drones: drones_scene(monde, calques, montre), unites: [...vecteurs_scene(monde, calques), ...fixes_scene(monde, calques)], icone_drone: monde.scenario.rouge.icone ?? "drone_delta"};
}

/** Rendre l'entité d'un identifiant de la scène, au format de trouver_sous_curseur, ou null (batterie : pas d'inspecteur). */
export function entite_depuis_id(monde, id) {
  const [genre, numero] = [id?.[0], Number(id?.slice(1))];
  if (genre === "d") return {type: "drone", objet: monde.drones[numero]};
  if (genre === "v") return {type: "avion", objet: monde.avions.find((avion) => avion.id === numero)};
  if (genre === "s") return {type: "cible", objet: monde.cibles[numero], indice: numero};
  if (genre === "r") return {type: "radar", objet: {geo: positions_radars(monde.scenario)[numero], indice: numero}, indice: numero};
  if (genre !== "c") return null;
  const objet = {geo: monde.reseau.centres[numero].geo, indice: numero};
  return numero === 0 ? {type: "conduite", objet} : {type: "centre", objet, indice: numero - 1};
}

/** Rendre l'identifiant de la scène de l'entité inspectée ({type, id}), ou null. */
export function id_depuis_inspection(inspection) {
  if (!inspection) return null;
  if (inspection.type === "conduite") return "c0";
  if (inspection.type === "centre") return `c${inspection.id + 1}`;
  return `${{drone: "d", avion: "v", cible: "s", radar: "r"}[inspection.type]}${inspection.id}`;
}

// Hauteurs (m) des contours de couverture au-dessus de celle de l'essaim, pour lire la forme du volume.
const HAUTEURS_COUVERTURE = [1500, 5000];
const SECTEURS_CONTOUR = 72;
// Sommet de l'arc d'une liaison satellite : figuratif, à une hauteur qui reste dans le cadre du théâtre.
const SOMMET_SATELLITE = 120_000;

const degres = ({lat, lon}) => ({lat_deg: vers_degres(lat), lon_deg: vers_degres(lon)});
const contour_circulaire = (centre, rayon) => Array.from({length: SECTEURS_CONTOUR}, (_, a) => degres(direct(centre, (2 * Math.PI * a) / SECTEURS_CONTOUR, rayon)));

/** Rendre les hauteurs de contour : celle de l'essaim d'abord, puis les hauteurs supérieures. */
const hauteurs_contour = (essaim) => [essaim, ...HAUTEURS_COUVERTURE.filter((h) => h > essaim)];

/** Rendre la couverture d'un radar avec masques : portée du moteur (MODELE § 16.2) à chaque hauteur. */
const niveaux_masques = (masque, grille, hauteurs) => hauteurs.map((hauteur) => ({
  hauteur, contour: couverture_reelle(masque, grille, hauteur).map(({azimut, portee}) => degres(direct(masque.site, azimut, Math.max(portee, 500)))),
}));

const memoire_couvertures = new WeakMap();

/**
 * Rendre les volumes de couverture : [{id, niveaux: [{hauteur (m au-dessus du sol), contour [{lat_deg, lon_deg}]}]}], le
 * premier niveau à la hauteur de l'essaim. Calculés par le moteur, gardés tant que le monde ne change pas de scénario.
 */
export function couvertures_scene(monde) {
  const {scenario, reseau, couverture} = monde;
  if (memoire_couvertures.has(scenario)) return memoire_couvertures.get(scenario);
  const essaim = scenario.rouge.altitude;
  const hauteurs = hauteurs_contour(essaim);
  let volumes;
  if (reseau.masques) {
    volumes = reseau.masques.map((masque, i) => ({id: `r${i}`, niveaux: niveaux_masques(masque, reseau.grille, hauteurs)}));
  } else if (couverture.sites) {
    volumes = couverture.sites.map((site, i) => {
      const {hauteur_antenne: mat, portee_max: maximale} = parametres_radar(scenario, i);
      return {id: `r${i}`, niveaux: hauteurs.map((hauteur) => ({hauteur, contour: contour_circulaire(site.geo, hauteur === essaim ? portee_site(scenario, i) : Math.min(horizon_radar(mat, hauteur), maximale))}))};
    });
  } else {
    volumes = [{id: "frontiere", niveaux: [{hauteur: essaim, contour: contour_circulaire(scenario.theatre.origine, monde.rayonDetection)}]}];
  }
  memoire_couvertures.set(scenario, volumes);
  return volumes;
}

/** Rendre les bulles sol : [{id, lat_deg, lon_deg, rayon (m), part (0 à 1, munitions restantes)}], par cible et par batterie placée. */
export function bulles_scene(monde) {
  const {sol} = monde.scenario;
  const parCible = monde.postes.length ? sol.munitions / monde.cibles.length : 0;
  const bulles = monde.cibles.flatMap((cible, k) => {
    const postes = monde.postes.filter((p) => p.cible === k && p.batterie === undefined);
    return postes.length ? [{id: `s${k}`, ...degres(cible.geo), rayon: sol.portee, part: Math.min(1, postes.reduce((n, p) => n + p.munitions, 0) / parCible)}] : [];
  });
  const initiales = sol.batteries ?? [];
  for (const p of monde.postes) {
    if (p.batterie !== undefined) bulles.push({id: `b${p.batterie}`, ...degres(p.geo), rayon: p.unite.portee, part: Math.min(1, p.munitions / Math.max(1, initiales[p.batterie]?.munitions ?? 1))});
  }
  return bulles;
}

/** Rendre les points d'une liaison : droite, ou montée et descente par le sommet figuratif pour un satellite. */
function trace_liaison(a, b, type, finEnVol = false) {
  const debut = {...degres(a), alt: a.alt ?? 0, vol: false};
  const fin = {...degres(b), alt: b.alt ?? 0, vol: finEnVol};
  if (type !== "satellite") return [debut, fin];
  return [debut, {lat_deg: (debut.lat_deg + fin.lat_deg) / 2, lon_deg: (debut.lon_deg + fin.lon_deg) / 2, alt: SOMMET_SATELLITE, vol: false}, fin];
}

/** Rendre les liaisons à tracer : [{points [{lat_deg, lon_deg, alt, vol}], actif, type}], `vol` pour une extrémité en vol ; une liaison hors portée a `actif` faux. */
export function liaisons_scene(monde) {
  const {reseau} = monde;
  if (reseau.mode === "complet") {
    return [...reseau.radars.map((radar) => [radar, reseau.centre]), ...reseau.centres.slice(1).map((c) => [c.geo, reseau.centre])]
      .map(([a, b]) => ({points: trace_liaison(a, b, "filaire"), actif: true, type: "filaire"}));
  }
  const fixes = reseau.fixes.flatMap((l) => {
    const [a, b] = [position_noeud(monde, l.de), position_noeud(monde, l.vers)];
    return a && b ? [{points: trace_liaison(a, b, l.moyen.type), actif: l.active, type: l.moyen.type}] : [];
  });
  const acces = reseau.acces.flatMap((liste, g) => {
    const ancre = position_noeud(monde, `avions:${g}`);
    const uniques = new Map(liste.map((a) => [`${a.sol}|${a.moyen.id}`, a]));
    return ancre ? [...uniques.values()].map((a) => ({points: trace_liaison(a.position, ancre, a.moyen.type, true), actif: true, type: a.moyen.type})) : [];
  });
  return [...fixes, ...acces];
}

/** Rendre l'altitude (m) d'un pixel de tuile « terrarium » (MODELE § 23). */
export const hauteur_terrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;

/**
 * Rendre la tuile source {z, x, y} et la fenêtre {echelle, dx, dy} à y lire pour la tuile (x, y, niveau) demandée :
 * au-delà de `zoomMax`, on lit une portion de la dernière tuile existante.
 */
export function fenetre_tuile(x, y, niveau, zoomMax) {
  const z = Math.min(niveau, zoomMax);
  const echelle = 2 ** (niveau - z);
  return {z, x: Math.floor(x / echelle), y: Math.floor(y / echelle), echelle, dx: x % echelle, dy: y % echelle};
}

/** Rendre la grille `taille` × `taille` des altitudes (m), au plus proche voisin, lue dans les pixels RGBA d'une tuile carrée. */
export function grille_hauteurs(rgba, cote, taille, {echelle, dx, dy}) {
  const grille = new Float32Array(taille * taille);
  const indice = (fraction, decalage) => Math.min(cote - 1, Math.round(((decalage + fraction) / echelle) * (cote - 1)));
  for (let ligne = 0; ligne < taille; ligne++) {
    for (let colonne = 0; colonne < taille; colonne++) {
      const k = 4 * (indice(ligne / (taille - 1), dy) * cote + indice(colonne / (taille - 1), dx));
      grille[ligne * taille + colonne] = hauteur_terrarium(rgba[k], rgba[k + 1], rgba[k + 2]);
    }
  }
  return grille;
}
