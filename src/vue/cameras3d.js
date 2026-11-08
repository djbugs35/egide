// Caméras de la vue 3D (jalon 14.3, MODELE § 23) : où se place l'observateur selon le mode choisi. Pur, testé.
import {inverse} from "../moteur/geodesie.js";
import {positions_radars} from "../moteur/radars.js";
import {entite_depuis_id} from "./scene3d.js";

/** Modes de caméra, dans l'ordre du menu. */
export const MODES_CAMERA = [
  {id: "libre", libelle: "Caméra libre"}, {id: "suivi", libelle: "Suivre la sélection"}, {id: "radar", libelle: "Depuis un radar"},
  {id: "site", libelle: "Depuis le site attaqué"}, {id: "commandant", libelle: "Vue commandant"}, {id: "dessus", libelle: "Vue de dessus"},
];

// Hauteur de l'observateur posé sur un site attaqué (m au-dessus du sol).
const HAUTEUR_SITE = 30;
const VUES_FIXES = {commandant: {inclinaison: -0.6, recul: 2.2}, dessus: {inclinaison: -Math.PI / 2, recul: 3}};
const en_vol = (monde) => monde.drones.filter((d) => d.vivant && !d.arrive && monde.t >= d.depart);

/** Rendre la position moyenne {lat, lon} de l'essaim en vol, ou le centre du théâtre s'il n'y en a plus. */
export function barycentre_essaim(monde) {
  const drones = en_vol(monde);
  if (!drones.length) return monde.scenario.theatre.origine;
  return {lat: drones.reduce((s, d) => s + d.geo.lat, 0) / drones.length, lon: drones.reduce((s, d) => s + d.geo.lon, 0) / drones.length};
}

/** Rendre l'indice de la cible que visent le plus de drones en vol ; sans drone en vol, la plus frappée. */
export function site_attaque(monde) {
  const compte = monde.cibles.map(() => 0);
  for (const d of en_vol(monde)) compte[d.cible]++;
  const valeurs = compte.some((n) => n > 0) ? compte : monde.fuites;
  return valeurs.indexOf(Math.max(...valeurs));
}

/** Rendre l'unité à suivre : la sélection si elle vole, sinon le premier drone en vol, sinon le premier avion. */
function a_suivre(monde, selection) {
  const entite = selection ? entite_depuis_id(monde, selection) : null;
  if (entite && ["drone", "avion"].includes(entite.type)) return entite.objet;
  return en_vol(monde)[0] ?? monde.avions.find((a) => !a.perdu) ?? null;
}

/** Rendre l'indice du radar d'où regarder : le radar sélectionné, sinon le plus proche de l'essaim. */
function radar_observateur(monde, selection, essaim) {
  if (selection?.startsWith("r")) return Number(selection.slice(1));
  const distances = positions_radars(monde.scenario).map((geo) => inverse(geo, {...essaim, alt: 0}).distance);
  return distances.indexOf(Math.min(...distances));
}

/**
 * Rendre la consigne de caméra : null (libre), {type: "fixe", inclinaison (rad), recul (× rayon de détection)},
 * {type: "suivi", geo} ou {type: "poste", geo, hauteur (m au-dessus du sol), vers (geo visé)}.
 */
export function consigne_camera(mode, monde, selection) {
  if (VUES_FIXES[mode]) return {type: "fixe", ...VUES_FIXES[mode]};
  if (mode === "suivi") {
    const unite = a_suivre(monde, selection);
    return unite ? {type: "suivi", geo: unite.geo} : null;
  }
  const essaim = barycentre_essaim(monde);
  if (mode === "radar") {
    const geo = positions_radars(monde.scenario)[radar_observateur(monde, selection, essaim)];
    return {type: "poste", geo, hauteur: geo.alt ?? 0, vers: essaim};
  }
  if (mode === "site") return {type: "poste", geo: monde.cibles[site_attaque(monde)].geo, hauteur: HAUTEUR_SITE, vers: essaim};
  return null;
}
