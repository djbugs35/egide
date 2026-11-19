// Incidents de scénario (MODELE § 29) : leur récit à l'écran et leur tirage au hasard, à graine. Pur, testé sous Node.
import {creer_hasard} from "../moteur/hasard.js";
import {t} from "../i18n.js";
import {nom_unite} from "../catalogue_langue.js";

export const LIBELLES_CAUSES = {panne: "vue.incident.panne", maintenance: "vue.incident.maintenance", meteo: "vue.incident.meteo", coupure: "vue.incident.coupure"};
// Décalage de graine : le tirage des incidents ne doit pas rejouer celui du raid, qui part de la même graine.
const SEL_INCIDENTS = 0x51ced;
const PAS_ARRONDI = 10;

const minutes = (s) => t("vue.commun.minutes", {n: Math.floor(s / 60)});

/** Rendre le nom affiché d'un élément du réseau ou d'une batterie. */
export function nom_element(monde, element) {
  const [genre, rang] = element.split(":");
  const k = Number(rang);
  if (element === "conduite") return t("vue.journal.le_cdc");
  if (genre === "radar") return `R${k + 1}`;
  if (genre === "liaison") return t("vue.incident.liaison", {n: k + 1});
  if (genre === "centre") return monde.scenario.reseau.centres[k]?.nom ?? t("vue.incident.centre", {n: k + 1});
  if (genre === "batterie") return monde.scenario.sol.batteries?.[k]?.unite?.nom ? t("vue.incident.batterie_nom", {n: k + 1, nom: nom_unite(monde.scenario.sol.batteries[k].unite.id, monde.scenario.sol.batteries[k].unite.nom)}) : t("vue.incident.batterie", {n: k + 1});
  return element;
}

/** Rendre la phrase d'un évènement `incident` du journal : début ou fin, cause, effet et durée. */
export function recit_incident(monde, e) {
  const qui = nom_element(monde, e.element);
  const cause = LIBELLES_CAUSES[e.cause] ? t(LIBELLES_CAUSES[e.cause]) : e.cause;
  const Qui = `${qui[0].toUpperCase()}${qui.slice(1)}`;
  if (!e.debut) return t(e.portee === null ? "vue.incident.fin_service" : "vue.incident.fin_portee", {qui: Qui, cause});
  const effet = e.portee === null ? t("vue.infobulle.hors_service") : t("vue.incident.portee_reduite", {p: Math.round(100 * e.portee)});
  const duree = e.fin === null ? t("vue.incident.nouvel_ordre") : t("vue.incident.jusqu_a", {t: minutes(e.fin)});
  return t("vue.incident.debut", {qui: Qui, cause, effet, duree});
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
