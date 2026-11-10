// Brouillard de guerre de la vue du CDC (MODELE § 31) : un drone connu s'affiche en piste, au dernier plot de sa
// dernière mise à jour, écarté d'une erreur fixe, dans un cercle d'incertitude. Pur, testé ; la simulation n'en sait rien.
import {direct} from "../moteur/geodesie.js";

export const PERIODE_PISTE = 10;
export const ERREUR_MAX = 300;

/** Rendre un nombre de [0, 1[ fixé par deux entiers : la même piste reprend la même erreur à chaque image. */
function fixe(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * Rendre la piste d'un drone connu de la conduite à l'instant `t` (s) : {geo, rayon (m), t_plot (s)}, ou null sans plot.
 *
 * @param {object} drone drone du monde (`connu` : instant où la conduite l'a appris).
 * @param {{lat, lon, t}[]} plots plots du drone, du plus ancien au plus récent (traces.js).
 * @param {number} vitesse vitesse de l'essaim (m/s).
 */
export function piste(drone, plots, t, vitesse) {
  if (drone.connu === null || !plots?.length) return null;
  const rang = Math.max(0, Math.floor((t - drone.connu) / PERIODE_PISTE));
  const miseAJour = drone.connu + rang * PERIODE_PISTE;
  const plot = [...plots].reverse().find((p) => p.t <= miseAJour) ?? plots[0];
  const ecart = direct({lat: plot.lat, lon: plot.lon, alt: 0}, 2 * Math.PI * fixe(drone.id, rang), ERREUR_MAX * fixe(rang, drone.id));
  return {geo: {lat: ecart.lat, lon: ecart.lon, alt: drone.geo?.alt ?? 0}, rayon: ERREUR_MAX + vitesse * Math.max(0, t - plot.t), t_plot: plot.t};
}
