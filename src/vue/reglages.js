// Curseurs du scénario : un par réglage, groupés par couche. Un réglage agit sur un ou plusieurs chemins du scénario
// (« Vitesse de mise à poste » règle les deux groupes d'avions) ; son aide vient du scénario ou du fichier d'unité.
// Libellés et sections sont des clés de langues/*.json, traduites à l'affichage.
import {libelle_unite} from "../moteur/unites.js";
import {format_decimal} from "./format.js";
import {t} from "../i18n.js";

const DEUX_GROUPES = (fin) => [`bleu.avions.0.${fin}`, `bleu.avions.1.${fin}`];

export const REGLAGES = [
  {section: "vue.reglages.section_menace", id: "drones", chemins: ["rouge.nombre"], libelle: "vue.reglages.drones", min: 50, max: 2000, pas: 50},
  {section: "vue.reglages.section_menace", id: "vitesse_drones", chemins: ["rouge.surcharges.vitesse_kmh"], libelle: "vue.reglages.vitesse_drones", min: 150, max: 1200, pas: 10},
  {section: "vue.reglages.section_menace", id: "altitude_drones", chemins: ["rouge.surcharges.altitude_croisiere_m"], libelle: "vue.reglages.altitude_drones", min: 20, max: 1000, pas: 10},
  {section: "vue.reglages.section_menace", id: "concentration", chemins: ["rouge.concentration_max"], libelle: "vue.reglages.concentration", min: 20, max: 1000, pas: 10},
  {section: "vue.reglages.section_menace", id: "cibles", chemins: ["theatre.cibles_nombre"], libelle: "vue.reglages.cibles", min: 1, max: 20, pas: 1},
  {section: "vue.reglages.section_menace", id: "eclatement", chemins: ["rouge.fourmi_eclatement_rayon_km"], libelle: "vue.reglages.eclatement", min: 0, max: 150, pas: 5},
  {section: "vue.reglages.section_menace", id: "couloir", chemins: ["rouge.fourmi_largeur_couloir_km"], libelle: "vue.reglages.couloir", min: 1, max: 30, pas: 1},
  {section: "vue.reglages.section_menace", id: "etalement", chemins: ["rouge.etalement_s"], libelle: "vue.reglages.etalement", min: 0, max: 600, pas: 10},
  {section: "vue.reglages.section_avions", id: "avions_ir", chemins: ["bleu.avions.0.nombre"], libelle: "vue.reglages.avions_ir", min: 0, max: 150, pas: 1},
  {section: "vue.reglages.section_avions", id: "avions_laser", chemins: ["bleu.avions.1.nombre"], libelle: "vue.reglages.avions_laser", min: 0, max: 150, pas: 1},
  {section: "vue.reglages.section_avions", id: "altitude_avions", chemins: DEUX_GROUPES("altitude_m"), libelle: "vue.reglages.altitude_avions", min: 100, max: 6000, pas: 100},
  {section: "vue.reglages.section_avions", id: "vitesse_mise_a_poste", chemins: DEUX_GROUPES("surcharges.vitesse_mise_a_poste_kmh"), libelle: "vue.reglages.vitesse_mise_a_poste", min: 300, max: 800, pas: 10},
  {section: "vue.reglages.section_avions", id: "vitesse_engagement", chemins: DEUX_GROUPES("surcharges.vitesse_engagement_kmh"), libelle: "vue.reglages.vitesse_engagement", min: 200, max: 600, pas: 10},
  {section: "vue.reglages.section_avions", id: "emport", chemins: DEUX_GROUPES("surcharges.emport_nombre"), libelle: "vue.reglages.emport", min: 2, max: 24, pas: 1},
  {section: "vue.reglages.section_avions", id: "portee_air", chemins: DEUX_GROUPES("surcharges_emport.portee_km"), libelle: "vue.reglages.portee_air", min: 2, max: 15, pas: 0.5},
  {section: "vue.reglages.section_avions", id: "pk_air", chemins: DEUX_GROUPES("surcharges_emport.pk"), libelle: "vue.reglages.pk_air", min: 0.1, max: 1, pas: 0.05},
  {section: "vue.reglages.section_avions", id: "designation", chemins: ["bleu.avions.1.surcharges_emport.duree_designation_s"], libelle: "vue.reglages.designation", min: 2, max: 20, pas: 1},
  {section: "vue.reglages.section_avions", id: "cadence_ir", chemins: ["bleu.avions.0.surcharges_emport.cadence_s"], libelle: "vue.reglages.cadence_ir", min: 1, max: 10, pas: 0.5},
  {section: "vue.reglages.section_drones_defensifs", id: "drones_armes", chemins: ["bleu.avions.2.nombre"], libelle: "vue.reglages.drones_armes", min: 0, max: 300, pas: 5},
  {section: "vue.reglages.section_drones_defensifs", id: "intercepteurs", chemins: ["bleu.avions.3.nombre"], libelle: "vue.reglages.intercepteurs", min: 0, max: 600, pas: 10},
  {section: "vue.reglages.section_drones_defensifs", id: "brouilleurs", chemins: ["bleu.avions.4.nombre"], libelle: "vue.reglages.brouilleurs", min: 0, max: 100, pas: 1},
  {section: "vue.reglages.section_drones_defensifs", id: "vitesse_drones_def", chemins: ["bleu.avions.2.surcharges.vitesse_mise_a_poste_kmh", "bleu.avions.4.surcharges.vitesse_mise_a_poste_kmh"], libelle: "vue.reglages.vitesse_drones_def", min: 80, max: 400, pas: 10},
  {section: "vue.reglages.section_sol", id: "postes", chemins: ["bleu.sol.nombre"], libelle: "vue.reglages.postes", min: 0, max: 600, pas: 10},
  {section: "vue.reglages.section_sol", id: "munitions_sol", chemins: ["bleu.sol.munitions"], libelle: "vue.reglages.munitions_sol", min: 0, max: 5000, pas: 50},
  {section: "vue.reglages.section_sol", id: "portee_sol", chemins: ["bleu.sol.surcharges.portee_km"], libelle: "vue.reglages.portee_sol", min: 2, max: 20, pas: 0.5},
  {section: "vue.reglages.section_sol", id: "pk_sol", chemins: ["bleu.sol.surcharges.pk"], libelle: "vue.reglages.pk_sol", min: 0.1, max: 1, pas: 0.05},
  {section: "vue.reglages.section_sol", id: "engagements", chemins: ["bleu.sol.surcharges.engagements_par_passage"], libelle: "vue.reglages.engagements", min: 1, max: 20, pas: 1},
  {section: "vue.reglages.section_theatre", id: "latitude", chemins: ["theatre.origine_lat_deg"], libelle: "vue.reglages.latitude", min: -80, max: 80, pas: 0.5},
  {section: "vue.reglages.section_theatre", id: "longitude", chemins: ["theatre.origine_lon_deg"], libelle: "vue.reglages.longitude", min: -180, max: 180, pas: 0.5},
  {section: "vue.reglages.section_theatre", id: "zone", chemins: ["theatre.zone_rayon_km"], libelle: "vue.reglages.zone", min: 50, max: 300, pas: 10},
  {section: "vue.reglages.section_theatre", id: "antennes", chemins: ["bleu.radar.surcharges.hauteur_antenne_m"], libelle: "vue.reglages.antennes", min: 5, max: 100, pas: 5},
  {section: "vue.reglages.section_theatre", id: "reaction", chemins: ["bleu.conduite.delai_reaction_s"], libelle: "vue.reglages.reaction", min: 0, max: 300, pas: 10},
  {section: "vue.reglages.section_theatre", id: "replanification", chemins: ["bleu.conduite.pas_decision_s"], libelle: "vue.reglages.replanification", min: 1, max: 30, pas: 1},
];

/** Rendre l'unité d'affichage d'un réglage, lue dans le suffixe de son premier chemin. */
export const unite_reglage = (reglage) => libelle_unite(reglage.chemins[0]);

const afficher = (reglage, valeur) => `${format_decimal(valeur)}${unite_reglage(reglage) ? ` ${unite_reglage(reglage)}` : ""}`;

function creer_curseur(reglage, surChangement) {
  const etiquette = document.createElement("label");
  etiquette.className = "reglage";
  etiquette.innerHTML = `<span class="libelle">${t(reglage.libelle)}</span><output></output>`;
  const curseur = document.createElement("input");
  Object.assign(curseur, {type: "range", min: reglage.min, max: reglage.max, step: reglage.pas, name: reglage.id});
  const sortie = etiquette.querySelector("output");
  curseur.addEventListener("input", () => {
    const valeur = Number(curseur.value);
    sortie.textContent = afficher(reglage, valeur);
    surChangement(Object.fromEntries(reglage.chemins.map((chemin) => [chemin, valeur])));
  });
  etiquette.append(curseur);
  return {etiquette, curseur, sortie};
}

/**
 * Construire les curseurs dans `conteneur` ; `surChangement(modifications)` reçoit chaque geste ({chemin: valeur}).
 * Rend `afficher_valeurs(contexte)` qui replace les curseurs, `contexte` : {valeur(chemin), aide(chemin)}.
 */
export function construire_reglages(conteneur, surChangement) {
  const curseurs = [];
  for (const section of new Set(REGLAGES.map((r) => r.section))) {
    const groupe = document.createElement("details");
    groupe.open = section !== "vue.reglages.section_theatre";
    groupe.innerHTML = `<summary>${t(section)}</summary>`;
    for (const reglage of REGLAGES.filter((r) => r.section === section)) {
      const curseur = creer_curseur(reglage, surChangement);
      curseurs.push({reglage, ...curseur});
      groupe.append(curseur.etiquette);
    }
    conteneur.append(groupe);
  }
  return (contexte) => {
    for (const {reglage, curseur, sortie, etiquette} of curseurs) {
      const valeur = contexte.valeur(reglage.chemins[0]);
      curseur.value = valeur;
      sortie.textContent = afficher(reglage, valeur);
      etiquette.title = contexte.aide(reglage.chemins[0]);
    }
  };
}
