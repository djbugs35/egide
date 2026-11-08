// Aides au déploiement (jalon 13, MODELE § 21.6) : règle, aimantation, aperçus avant pose, regroupement des unités
// proches. Pur, sans DOM, testé ; editeur.js ne fait que lire les gestes et dessiner ce qui est rendu ici.
import {unite_si} from "../moteur/catalogue.js";
import {direct, inverse, vers_degres} from "../moteur/geodesie.js";
import {enveloppe_poste} from "../moteur/couvertures.js";
import {horizon_radar} from "../moteur/geometrie.js";
import {portee_liaison} from "../moteur/reseau.js";
import {famille_de, hauteur_noeud} from "./deploiement.js";
import {element_sous} from "./edition.js";

// Au-delà, un moyen est sans limite pratique (satellite, 40 000 km) : un cercle de portée n'apprendrait rien.
const PORTEE_SANS_LIMITE = 10_000_000;
// Une unité à moins de ce rayon du curseur attire la pose.
const RAYON_AIMANT_PX = 12;

/** Rendre {distance (m), cap_deg (0 à 360, depuis le nord)} de `a` vers `b`, sur l'ellipsoïde. */
export function mesure(a, b) {
  const {distance, azimut_depart: azimut} = inverse(a, b);
  return {distance, cap_deg: distance === 0 ? 0 : (vers_degres(azimut) + 360) % 360};
}

/** Rendre une distance en m lisible : « 850 m », « 1,2 km », « 123 km ». */
export function texte_distance(metres) {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return metres < 10_000 ? `${(metres / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(metres / 1000)} km`;
}

/** Rendre le texte d'une mesure : « 123 km · cap 045° ». */
export const texte_mesure = ({distance, cap_deg: cap}) => `${texte_distance(distance)} · cap ${String(Math.round(cap) % 360).padStart(3, "0")}°`;

/** Rendre `segments` + 1 points de la géodésique de `a` à `b`, pour la tracer juste sur toute projection. */
export function points_geodesique(a, b, segments = 24) {
  const {distance, azimut_depart: azimut} = inverse(a, b);
  return Array.from({length: segments + 1}, (_, i) => direct(a, azimut, (distance * i) / segments));
}

/**
 * Rendre `geo` calé sur la grille de pas `pas` (m) du théâtre : plan azimutal équidistant autour de `origine`, nord
 * en haut (MODELE § 21.6). Deux clics dans une même maille donnent le même point.
 */
export function aimanter_grille(origine, geo, pas) {
  const {distance, azimut_depart: azimut} = inverse(origine, geo);
  const [x, y] = [distance * Math.sin(azimut), distance * Math.cos(azimut)].map((v) => Math.round(v / pas) * pas);
  return direct(origine, Math.atan2(x, y), Math.hypot(x, y));
}

/**
 * Rendre le point de pose de `geo`, visé au point écran `point`, selon `reglage` : {type: "aucune"}, {type: "grille",
 * pas (m), origine} ou {type: "unites", elements, versEcran}.
 */
export function aimanter(geo, point, reglage) {
  if (reglage.type === "grille") return aimanter_grille(reglage.origine, geo, reglage.pas);
  if (reglage.type === "unites") return element_sous(reglage.elements, reglage.versEcran, point, RAYON_AIMANT_PX)?.geo ?? geo;
  return geo;
}

/**
 * Rendre l'aperçu du dépôt de l'unité `id` : {rayon (m), libelle} pour un radar (portée contre l'essaim à
 * `altitudeEssaim` m) ou une batterie, null pour le reste ou si son fichier n'est pas encore chargé.
 */
export function apercu_depot(id, fichiers, altitudeEssaim) {
  if (!(id in fichiers)) return null;
  const famille = famille_de(id)?.id;
  const unite = unite_si(id, fichiers);
  if (famille === "capteurs") return {rayon: Math.min(horizon_radar(unite.hauteur_antenne, altitudeEssaim), unite.portee_max), libelle: "portée"};
  if (famille === "sol") return {rayon: enveloppe_poste(unite, altitudeEssaim), libelle: "bulle"};
  return null;
}

/**
 * Rendre la portée (m) du moyen `id` depuis le nœud `noeud`, l'autre extrémité étant supposée au sol sur le mât du
 * moyen ; null si le moyen est sans limite pratique ou si son fichier n'est pas encore chargé.
 */
export function apercu_liaison(monde, noeud, id, fichiers) {
  if (!(id in fichiers)) return null;
  const moyen = unite_si(id, fichiers);
  const portee = portee_liaison(moyen, hauteur_noeud(monde, noeud, moyen), moyen.hauteur_antenne);
  return portee >= PORTEE_SANS_LIMITE ? null : portee;
}

/**
 * Rendre les groupes de `points` écran ({x, y}) à moins de `seuilPx` du premier de leur groupe : [{x, y, nombre}],
 * position moyenne, pour les seuls groupes d'au moins deux.
 */
export function regrouper(points, seuilPx = 14) {
  const groupes = [];
  for (const p of points) {
    const groupe = groupes.find((g) => Math.hypot(g.x0 - p.x, g.y0 - p.y) <= seuilPx);
    if (groupe) Object.assign(groupe, {sx: groupe.sx + p.x, sy: groupe.sy + p.y, nombre: groupe.nombre + 1});
    else groupes.push({x0: p.x, y0: p.y, sx: p.x, sy: p.y, nombre: 1});
  }
  return groupes.filter((g) => g.nombre >= 2).map((g) => ({x: g.sx / g.nombre, y: g.sy / g.nombre, nombre: g.nombre}));
}
