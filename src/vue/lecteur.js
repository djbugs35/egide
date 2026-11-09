// Lecture d'un raid : temps réel accéléré, pause, déplacement dans le temps par rejeu déterministe depuis t = 0.
import {avancer_monde, creer_monde, est_termine, simuler} from "../moteur/monde.js";

// À ×1, 20 s simulées par seconde : un raid de 20 min se regarde en 1 min ; ×16 le montre en 4 s.
export const SECONDES_SIMULEES_PAR_SECONDE = 20;
export const MULTIPLICATEURS = [0.25, 0.5, 1, 2, 4, 8, 16];

/**
 * Rendre un lecteur pour `scenario` et le `registre` de ses algorithmes, au début du raid, à l'arrêt.
 * Sa durée totale est connue d'avance (rejeu), sauf si `differe` : l'éditeur la laisse infinie, car simuler tout le raid
 * à chaque geste coûtait 1,5 s sur le scénario de référence, bien plus sur un théâtre national.
 */
export function creer_lecteur(scenario, registre, {differe = false} = {}) {
  return {
    scenario,
    registre,
    monde: creer_monde(scenario, {registre}),
    duree: differe ? Infinity : simuler(scenario, {registre, journal: false}).t,
    enLecture: false,
    multiplicateur: 1,
    reserve: 0,
  };
}

/**
 * Faire avancer le raid de l'équivalent de `dtReel` s de temps réel ; `apresPas(monde)` suit chaque pas.
 * Rend vrai si le raid vient de se terminer.
 */
export function avancer_temps_reel(lecteur, dtReel, apresPas) {
  if (!lecteur.enLecture) return false;
  const pas = lecteur.scenario.simulation.pas;
  // Plafond : un onglet resté en arrière-plan ne doit pas rattraper des minutes d'un coup.
  lecteur.reserve += Math.min(dtReel, 0.25) * SECONDES_SIMULEES_PAR_SECONDE * lecteur.multiplicateur;
  while (lecteur.reserve >= pas && !est_termine(lecteur.monde)) {
    avancer_monde(lecteur.monde);
    apresPas(lecteur.monde);
    lecteur.reserve -= pas;
  }
  if (!est_termine(lecteur.monde)) return false;
  lecteur.enLecture = false;
  return true;
}

/** Placer le raid à l'instant `t` (s) en le rejouant depuis le début : même graine, même déroulement. */
export function aller_a(lecteur, t, apresPas) {
  if (t < lecteur.monde.t) lecteur.monde = creer_monde(lecteur.scenario, {registre: lecteur.registre});
  while (lecteur.monde.t < t && !est_termine(lecteur.monde)) {
    avancer_monde(lecteur.monde);
    apresPas(lecteur.monde);
  }
  lecteur.reserve = 0;
}
