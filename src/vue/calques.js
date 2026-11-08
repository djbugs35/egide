// Calques de la situation : chaque famille d'entités s'affiche ou se masque, et ce qui est masqué ne se survole ni
// ne se sélectionne. Pur, sauf la mémoire du navigateur (protégée : elle peut manquer).

/** Les calques, par groupe, dans l'ordre du panneau. */
export const CALQUES = [
  {id: "avions_ir", groupe: "Défense", libelle: "Avions IR"},
  {id: "avions_laser", groupe: "Défense", libelle: "Avions laser"},
  {id: "drones_defensifs", groupe: "Défense", libelle: "Drones défensifs"},
  {id: "missions", groupe: "Défense", libelle: "Mises à poste et ordres"},
  {id: "radars", groupe: "Défense", libelle: "Radars"},
  {id: "reseau", groupe: "Défense", libelle: "Réseau et centre de conduite"},
  {id: "couverture", groupe: "Défense", libelle: "Couverture radar"},
  {id: "conduite_tir", groupe: "Défense", libelle: "Conduite de tir (jaune)", defaut: false},
  {id: "interception", groupe: "Défense", libelle: "Interception (vert)", defaut: false},
  {id: "resultante_c2", groupe: "Défense", libelle: "Couverture des C2 (violet)", defaut: false},
  {id: "balayage", groupe: "Défense", libelle: "Faisceau radar"},
  {id: "postes", groupe: "Défense", libelle: "Bulles des postes sol"},
  {id: "drones_detectes", groupe: "Menace", libelle: "Drones détectés"},
  {id: "drones_inconnus", groupe: "Menace", libelle: "Drones non détectés"},
  {id: "plots", groupe: "Menace", libelle: "Plots radar"},
  {id: "plan", groupe: "Menace", libelle: "Plan de vol"},
  {id: "tirs", groupe: "Engagements", libelle: "Tirs et destructions"},
  {id: "messages", groupe: "Engagements", libelle: "Circulation de l'information"},
  {id: "cibles", groupe: "Théâtre", libelle: "Cibles"},
  {id: "zones", groupe: "Théâtre", libelle: "Zones"},
  {id: "anneaux", groupe: "Théâtre", libelle: "Anneaux de distance"},
  {id: "icones", groupe: "Affichage", libelle: "Icônes de jeu (sinon symboles APP-6)"},
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
