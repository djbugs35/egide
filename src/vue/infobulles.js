// Textes d'infobulle des entités du scope : ce qu'elles sont, ce qu'elles font, avec leurs unités.
import {couvertures, surface_union} from "../moteur/couvertures.js";
import {format_duree} from "./format.js";
import {enveloppes_inspectees} from "./couvertures_vue.js";

const ETATS = {orbite: "en orbite", ralliement: "en route vers son point de mise à poste", engagement: "au contact",
  poste: "à poste, en attente", retour: "retour vers son orbite"};

/** Nom affiché de chaque famille de vecteur défensif. */
export const NOMS_VECTEURS = {avion: "Avion", drone_arme: "Drone armé", kamikaze: "Intercepteur", brouilleur: "Brouilleur"};

const km = (metres) => `${Math.round(metres / 100) / 10} km`;
const km2 = (m2) => `${Math.round(m2 / 1e6).toLocaleString("fr-FR")} km²`;

/** Rendre les lignes de portée d'un objet : conduite de tir et interception (MODELE § 25). */
function portees_texte(monde, inspection) {
  const [objet] = enveloppes_inspectees(couvertures(monde), inspection).objets;
  return objet ? `\nconduite de tir ${km(objet.conduite)}, interception ${km(objet.interception)}` : "";
}

// Mesurer une union balaie toute la grille : la mémoire évite de le refaire à chaque image du survol.
const surfaces = new WeakMap();
const PERIODE_SURFACE_S = 10;

/** Rendre les lignes de résultante du centre `c` : objets reliés et surface couverte par enveloppe (MODELE § 25.4). */
function resultante_texte(monde, c) {
  if (!surfaces.has(monde.reseau)) surfaces.set(monde.reseau, new Map());
  const memoire = surfaces.get(monde.reseau);
  const cle = `${c}|${Math.floor(monde.t / PERIODE_SURFACE_S)}`;
  if (!memoire.has(cle)) {
    const {objets, c2} = couvertures(monde);
    const membres = c2[c].membres.map((rang) => objets[rang]);
    const surface = (genre) => km2(surface_union(membres, genre, monde.scenario.theatre.origine));
    memoire.set(cle, `\n${membres.length} objets reliés\ndétection ${surface("detection")}\nconduite ${surface("conduite")}\ninterception ${surface("interception")}`);
  }
  return memoire.get(cle);
}

/** Rendre le texte décrivant l'entité survolée (`survol` rendu par trouver_sous_curseur). */
export function decrire(survol, monde) {
  if (survol.type === "avion" && survol.objet.type && survol.objet.type !== "avion") {
    const avion = survol.objet;
    const etat = avion.munitions === 0 ? "à court de munitions" : ETATS[avion.etat];
    const charge = avion.type === "brouilleur" ? `brouille dans un rayon de ${Math.round(avion.groupe.arme.portee / 100) / 10} km` : `${avion.munitions} charge${avion.munitions > 1 ? "s" : ""} restante${avion.munitions > 1 ? "s" : ""}`;
    return `${NOMS_VECTEURS[avion.type]} ${avion.id + 1}\n${etat}\n${charge}${portees_texte(monde, {type: "avion", id: avion.id})}`;
  }
  if (survol.type === "avion") {
    const avion = survol.objet;
    const guidage = avion.guidage === "ir" ? "guidage IR" : "guidage laser";
    const etat = avion.munitions === 0 ? "à court de roquettes" : ETATS[avion.etat];
    return `Avion ${avion.id + 1}, ${guidage}\n${etat}\n${avion.munitions} roquettes restantes${portees_texte(monde, {type: "avion", id: avion.id})}`;
  }
  if (survol.type === "cible") {
    const postes = monde.postes.filter((p) => p.cible === survol.indice);
    const munitions = postes.reduce((somme, p) => somme + p.munitions, 0);
    return `Cible C${survol.indice + 1}\n${postes.length} postes sol, ${munitions} munitions\n${monde.fuites[survol.indice]} drones arrivés${portees_texte(monde, {type: "cible", id: survol.indice})}`;
  }
  if (survol.type === "conduite" || survol.type === "centre") {
    const {reseau} = monde;
    const c = survol.type === "conduite" ? 0 : survol.indice + 1;
    const etat = reseau.centres[c].hs ? "hors service" : reseau.mode === "complet" ? "réseau complet : tout le monde est relié, sans délai"
      : `${reseau.latences_centres[c].filter(Number.isFinite).length} radars le renseignent`;
    return `${c === 0 ? "Centre de détection et de contrôle (CDC)" : reseau.centres[c].nom}\n${etat}${resultante_texte(monde, c)}`;
  }
  if (survol.type === "radar") {
    const {radar} = monde.scenario;
    const site = monde.couverture.sites?.[survol.indice];
    const disposition = radar.disposition === "sites" ? "placé" : "de la couverture frontière (le déplacer le place)";
    const portee = site ? `\nportée contre l'essaim : ${Math.round(site.portee / 1000)} km` : "";
    return `Radar R${survol.indice + 1}, ${disposition}\nantenne à ${radar.hauteur_antenne} m${portee}`;
  }
  const drone = survol.objet;
  const vu = drone.detection === null ? "pas encore détecté" : `détecté depuis ${format_duree(monde.t - drone.detection)}`;
  return `Drone ${drone.id + 1}, vise C${drone.cible + 1}\n${vu}`;
}
