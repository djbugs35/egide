// Incidents de scénario (MODELE § 29) : leur récit à l'écran et leur tirage au hasard, à graine. Pur, testé sous Node.
import {creer_hasard} from "../moteur/hasard.js";

export const LIBELLES_CAUSES = {panne: "panne technique", maintenance: "maintenance programmée", meteo: "météo", coupure: "coupure de transmission"};
// Décalage de graine : le tirage des incidents ne doit pas rejouer celui du raid, qui part de la même graine.
const SEL_INCIDENTS = 0x51ced;
const PAS_ARRONDI = 10;

const minutes = (s) => `${Math.floor(s / 60)} min`;

/** Rendre le nom affiché d'un élément du réseau ou d'une batterie. */
export function nom_element(monde, element) {
  const [genre, rang] = element.split(":");
  const k = Number(rang);
  if (element === "conduite") return "le CDC";
  if (genre === "radar") return `R${k + 1}`;
  if (genre === "liaison") return `la liaison ${k + 1}`;
  if (genre === "centre") return monde.scenario.reseau.centres[k]?.nom ?? `le centre ${k + 1}`;
  if (genre === "batterie") return monde.scenario.sol.batteries?.[k]?.unite?.nom ? `la batterie ${k + 1} (${monde.scenario.sol.batteries[k].unite.nom})` : `la batterie ${k + 1}`;
  return element;
}

/** Rendre la phrase d'un évènement `incident` du journal : début ou fin, cause, effet et durée. */
export function recit_incident(monde, e) {
  const qui = nom_element(monde, e.element);
  const cause = LIBELLES_CAUSES[e.cause] ?? e.cause;
  const Qui = `${qui[0].toUpperCase()}${qui.slice(1)}`;
  if (!e.debut) return `${Qui} : fin de ${cause}, de nouveau ${e.portee === null ? "en service" : "à pleine portée"}.`;
  const effet = e.portee === null ? "hors service" : `portée réduite à ${Math.round(100 * e.portee)} %`;
  const duree = e.fin === null ? "jusqu'à nouvel ordre" : `jusqu'à ${minutes(e.fin)}`;
  return `${Qui} : ${cause}, ${effet} ${duree}.`;
}

const arrondi = (s) => Math.round(s / PAS_ARRONDI) * PAS_ARRONDI;

/** Rendre un incident tiré au hasard pour `element`, entre 10 % et 70 % du raid, durant 10 % à 30 % du raid. */
function tirer_incident(hasard, element, duree) {
  const t_s = arrondi(hasard.uniforme(0.1, 0.7) * duree);
  const duree_s = Math.max(PAS_ARRONDI, arrondi(hasard.uniforme(0.1, 0.3) * duree));
  if (element.startsWith("radar:")) {
    // Le plus souvent, le ciel gêne un radar plutôt qu'il ne l'arrête.
    if (hasard.succes(0.6)) return {t_s, element, cause: "meteo", portee: Math.round(hasard.uniforme(0.4, 0.8) * 100) / 100, duree_s};
    return {t_s, element, cause: hasard.succes(0.5) ? "maintenance" : "panne", duree_s};
  }
  if (element.startsWith("liaison:")) return {t_s, element, cause: "coupure", duree_s};
  return {t_s, element, cause: hasard.succes(0.5) ? "maintenance" : "panne", duree_s};
}

/**
 * Rendre les modifications qui ajoutent `nombre` incidents tirés à `graine` aux pannes du scénario brut `brut`.
 *
 * @param {object} brut scénario v2 brut.
 * @param {number} radars nombre de radars du scénario.
 * @param {number} duree durée du raid (s), qui borne les instants tirés.
 */
export function generer_incidents(brut, radars, duree, graine, nombre = 5) {
  const {reseau = {}} = brut.bleu;
  const elements = [
    ...Array.from({length: radars}, (_, i) => `radar:${i}`),
    ...(reseau.liaisons ?? []).map((_, k) => `liaison:${k}`),
    ...(brut.bleu.sol.batteries ?? []).map((_, j) => `batterie:${j}`),
    ...(reseau.centres ?? []).map((_, k) => `centre:${k}`),
  ];
  const hasard = creer_hasard(graine ^ SEL_INCIDENTS);
  const tires = Array.from({length: Math.min(nombre, elements.length)}, () => {
    const element = elements.splice(hasard.entier(elements.length), 1)[0];
    return tirer_incident(hasard, element, duree);
  });
  return {"bleu.reseau.pannes": [...(reseau.pannes ?? []), ...tires]};
}
