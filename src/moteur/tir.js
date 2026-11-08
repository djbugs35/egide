// Ce que partagent les couches air et sol : choix du drone visé et tirage du résultat d'un tir (MODELE § 8.5).
import {distance_oblique} from "./geodesie.js";
import {parcourir_voisins} from "./grille.js";

/** Rendre vrai si le drone vole : parti, ni détruit, ni arrivé sur sa cible. */
export const est_actif = (drone, t) => drone.vivant && !drone.arrive && t >= drone.depart;

/**
 * Rendre le drone actif le plus proche de `centre` (ECEF) à moins de `portee` m en distance oblique, ou null.
 * `exclureVises` écarte les drones qu'une roquette en vol vise déjà : on ne gaspille pas deux tirs sur un drone.
 */
export function plus_proche(monde, centre, portee, exclureVises, visible = null) {
  let retenu = null;
  let meilleure = portee;
  parcourir_voisins(monde.index, centre, portee, (drone) => {
    if (!est_actif(drone, monde.t) || (exclureVises && drone.vise) || (visible && !visible(drone))) return;
    const ecart = distance_oblique(drone.ecef, centre);
    if (ecart <= meilleure) {
      meilleure = ecart;
      retenu = drone;
    }
  });
  return retenu;
}

/** Ajouter un évènement au journal du monde, s'il est tenu (le rejeu de l'interface s'en nourrit). */
export function journaliser(monde, evenement) {
  if (monde.evenements) monde.evenements.push({t: monde.t, ...evenement});
}

/**
 * Tirer le résultat d'un tir de probabilité `pk` sur `drone` par la couche `couche` ("air" ou "sol"), tiré de
 * `origine` (géo) par le tireur `tireur` (numéro d'avion ou de poste). Le journal garde le drone visé et le Pk,
 * que l'inspecteur relit pour expliquer la survie d'un drone. `details` : champs de plus pour le journal.
 */
export function resoudre_tir(monde, drone, pk, couche, origine, tireur, details = {}) {
  if (!est_actif(drone, monde.t)) return;
  const detruit = monde.hasard.succes(pk);
  journaliser(monde, {type: "tir", couche, de: origine, vers: {...drone.geo}, detruit, drone: drone.id, pk, tireur, ...details});
  if (!detruit) return;
  drone.vivant = false;
  monde.compteurs[`detruits_${couche}`]++;
}
