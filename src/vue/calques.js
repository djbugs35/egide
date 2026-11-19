// Calques de la situation : chaque famille d'entités s'affiche ou se masque, et ce qui est masqué ne se survole ni
// ne se sélectionne. Pur, sauf la mémoire du navigateur (protégée : elle peut manquer).

/** Les calques, par groupe, dans l'ordre du panneau ; groupes et libellés sont des clés de langues/*.json. */
export const CALQUES = [
  {id: "avions_ir", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.avions_ir"},
  {id: "avions_laser", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.avions_laser"},
  {id: "drones_defensifs", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.drones_defensifs"},
  {id: "missions", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.missions"},
  {id: "radars", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.radars"},
  {id: "reseau", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.reseau"},
  {id: "couverture", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.couverture"},
  {id: "conduite_tir", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.conduite_tir", defaut: false},
  {id: "interception", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.interception", defaut: false},
  {id: "resultante_c2", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.resultante_c2", defaut: false},
  {id: "portees_menaces", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.portees_menaces", defaut: false},
  {id: "balayage", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.balayage"},
  {id: "postes", groupe: "vue.calques.groupe_defense", libelle: "vue.calques.postes"},
  {id: "drones_detectes", groupe: "vue.calques.groupe_menace", libelle: "vue.calques.drones_detectes"},
  {id: "drones_inconnus", groupe: "vue.calques.groupe_menace", libelle: "vue.calques.drones_inconnus"},
  {id: "plots", groupe: "vue.calques.groupe_menace", libelle: "vue.calques.plots"},
  {id: "plan", groupe: "vue.calques.groupe_menace", libelle: "vue.calques.plan"},
  {id: "tirs", groupe: "vue.calques.groupe_engagements", libelle: "vue.calques.tirs"},
  {id: "messages", groupe: "vue.calques.groupe_engagements", libelle: "vue.calques.messages"},
  {id: "cibles", groupe: "vue.calques.groupe_theatre", libelle: "vue.calques.cibles"},
  {id: "zones", groupe: "vue.calques.groupe_theatre", libelle: "vue.calques.zones"},
  {id: "anneaux", groupe: "vue.calques.groupe_theatre", libelle: "vue.calques.anneaux"},
  {id: "icones", groupe: "vue.calques.groupe_affichage", libelle: "vue.calques.icones"},
];

const CLE = "egide.calques";

/** Rendre tous les calques visibles. */
export const calques_par_defaut = () => Object.fromEntries(CALQUES.map((c) => [c.id, c.defaut !== false]));

/** Rendre les calques mémorisés, complétés par défaut (un calque nouveau est visible). */
export function lire_calques(stockage = globalThis.localStorage) {
  try {
    return {...calques_par_defaut(), ...JSON.parse(stockage?.getItem(CLE) ?? "{}")};
  } catch {
    return calques_par_defaut();
  }
}

/** Mémoriser les calques ; rendre faux si le navigateur refuse. */
export function memoriser_calques(calques, stockage = globalThis.localStorage) {
  try {
    stockage.setItem(CLE, JSON.stringify(calques));
    return true;
  } catch {
    return false;
  }
}

/** Rendre vrai si l'élément éditable ou survolé `element` ({type, guidage?, objet?}) est sur un calque visible. */
export function element_visible(calques, element) {
  if (element.type === "avion") {
    // Les drones défensifs ont leur propre calque ; les avions, un calque par guidage.
    if ((element.vecteur ?? element.objet?.type ?? "avion") !== "avion") return calques.drones_defensifs;
    return calques[(element.guidage ?? element.objet?.guidage) === "ir" ? "avions_ir" : "avions_laser"];
  }
  if (element.type === "drone") return calques[element.objet.detection === null ? "drones_inconnus" : "drones_detectes"];
  const calque = {cible: "cibles", radar: "radars", passage: "plan", zone: "zones", conduite: "reseau", centre: "reseau", liaison: "reseau"}[element.type];
  return calque ? calques[calque] : true;
}
