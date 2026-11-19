// Textes d'infobulle des entités du scope : ce qu'elles sont, ce qu'elles font, avec leurs unités.
import {couvertures, surface_union} from "../moteur/couvertures.js";
import {format_duree, format_entier} from "./format.js";
import {t} from "../i18n.js";
import {enveloppes_inspectees} from "./couvertures_vue.js";

// États et familles : clés de langues/*.json, traduites à l'affichage.
const ETATS = {orbite: "vue.infobulle.orbite", ralliement: "vue.infobulle.ralliement", engagement: "vue.infobulle.engagement",
  poste: "vue.infobulle.poste", retour: "vue.infobulle.retour"};

/** Nom affiché de chaque famille de vecteur défensif. */
export const NOMS_VECTEURS = {avion: "vue.vecteur.avion", drone_arme: "vue.vecteur.drone_arme", kamikaze: "vue.vecteur.kamikaze", brouilleur: "vue.vecteur.brouilleur"};

const km = (metres) => `${Math.round(metres / 100) / 10} km`;
const km2 = (m2) => `${format_entier(Math.round(m2 / 1e6))} km²`;

/** Rendre les lignes de portée d'un objet : conduite de tir et interception (MODELE § 25). */
function portees_texte(monde, inspection) {
  const [objet] = enveloppes_inspectees(couvertures(monde), inspection).objets;
  return objet ? `\n${t("vue.infobulle.portees", {conduite: km(objet.conduite), interception: km(objet.interception)})}` : "";
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
    memoire.set(cle, `\n${t("vue.infobulle.resultante", {n: membres.length, detection: surface("detection"), conduite: surface("conduite"), interception: surface("interception")})}`);
  }
  return memoire.get(cle);
}

/** Rendre le texte décrivant l'entité survolée (`survol` rendu par trouver_sous_curseur). */
export function decrire(survol, monde) {
  if (survol.type === "avion" && survol.objet.type && survol.objet.type !== "avion") {
    const avion = survol.objet;
    const etat = avion.munitions === 0 ? t("vue.infobulle.sans_munitions") : t(ETATS[avion.etat]);
    const charge = avion.type === "brouilleur" ? t("vue.infobulle.brouille", {km: Math.round(avion.groupe.arme.portee / 100) / 10}) : t("vue.infobulle.charges", {n: avion.munitions});
    return `${t(NOMS_VECTEURS[avion.type])} ${avion.id + 1}\n${etat}\n${charge}${portees_texte(monde, {type: "avion", id: avion.id})}`;
  }
  if (survol.type === "avion") {
    const avion = survol.objet;
    const guidage = avion.guidage === "ir" ? t("vue.infobulle.guidage_ir") : t("vue.infobulle.guidage_laser");
    const etat = avion.munitions === 0 ? t("vue.infobulle.sans_roquettes") : t(ETATS[avion.etat]);
    return `${t("vue.infobulle.avion", {n: avion.id + 1, guidage})}\n${etat}\n${t("vue.infobulle.roquettes", {n: avion.munitions})}${portees_texte(monde, {type: "avion", id: avion.id})}`;
  }
  if (survol.type === "cible") {
    const postes = monde.postes.filter((p) => p.cible === survol.indice);
    const munitions = postes.reduce((somme, p) => somme + p.munitions, 0);
    return `${t("vue.infobulle.cible", {n: survol.indice + 1})}\n${t("vue.infobulle.postes", {n: postes.length, munitions})}\n${t("vue.infobulle.arrives", {n: monde.fuites[survol.indice]})}${portees_texte(monde, {type: "cible", id: survol.indice})}`;
  }
  if (survol.type === "conduite" || survol.type === "centre") {
    const {reseau} = monde;
    const c = survol.type === "conduite" ? 0 : survol.indice + 1;
    const etat = reseau.centres[c].hs ? t("vue.infobulle.hors_service") : reseau.mode === "complet" ? t("vue.infobulle.reseau_complet")
      : t("vue.infobulle.radars_renseignent", {n: reseau.latences_centres[c].filter(Number.isFinite).length});
    return `${c === 0 ? t("vue.infobulle.cdc") : reseau.centres[c].nom}\n${etat}${resultante_texte(monde, c)}`;
  }
  if (survol.type === "radar") {
    const {radar} = monde.scenario;
    const site = monde.couverture.sites?.[survol.indice];
    const disposition = radar.disposition === "sites" ? t("vue.infobulle.radar_place") : t("vue.infobulle.radar_frontiere");
    const portee = site ? `\n${t("vue.infobulle.portee_essaim", {km: Math.round(site.portee / 1000)})}` : "";
    return `${t("vue.infobulle.radar", {n: survol.indice + 1, disposition})}\n${t("vue.infobulle.antenne", {m: radar.hauteur_antenne})}${portee}`;
  }
  const drone = survol.objet;
  const vu = drone.detection === null ? t("vue.infobulle.non_detecte") : t("vue.infobulle.detecte_depuis", {duree: format_duree(monde.t - drone.detection)});
  return `${t("vue.infobulle.drone", {n: drone.id + 1, cible: drone.cible + 1})}\n${vu}`;
}
