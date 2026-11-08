// Contenu de la vue 3D (jalon 14, MODELE § 23) : ce que la scène montre à un instant, lu dans le monde comme la 2D, et
// décodage du relief. Pur, sans Cesium ni DOM, testé : les positions sont celles du moteur, sans second calcul.
import {vers_degres} from "../moteur/geodesie.js";
import {parametres_radar, positions_radars} from "../moteur/radars.js";
import {calque_vecteur} from "./symboles.js";

const position = ({lat, lon, alt}) => ({lat_deg: vers_degres(lat), lon_deg: vers_degres(lon), alt: alt ?? 0});

/** Rendre le cap (rad, depuis le nord) de `a` vers `b` sur la sphère : il oriente une silhouette, l'écart à l'ellipsoïde ne se voit pas. */
function cap_vers(a, b) {
  const dLon = b.lon - a.lon;
  return Math.atan2(Math.sin(dLon) * Math.cos(b.lat), Math.cos(a.lat) * Math.sin(b.lat) - Math.sin(a.lat) * Math.cos(b.lat) * Math.cos(dLon));
}

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
