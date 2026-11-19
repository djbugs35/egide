// Journal de l'information (MODELE § 17) : le journal du moteur traduit en phrases — qui a vu quoi, qui a informé
// qui, quand, qui est parti, qui a tiré. Pur, testé ; le panneau Journal et l'inspecteur le lisent.
import {format_decimal, format_duree} from "./format.js";
import {recit_incident} from "./incidents.js";
import {t} from "../i18n.js";

/** Familles de lignes, pour les filtres du panneau. */
export const FAMILLES = {detection: "vue.journal.f_detection", mission: "vue.journal.f_mission", contact: "vue.journal.f_contact", tir: "vue.journal.f_tir", essaim: "vue.journal.f_essaim", autre: "vue.journal.f_autre"};

// Le séparateur décimal suit la langue : « 3:30,5 » en français, « 3:30.5 » en anglais.
const instant = (s) => `${format_duree(s)}${Number.isInteger(s) ? "" : format_decimal(0.5).slice(1)}`;
const majuscule = (texte) => `${texte[0].toUpperCase()}${texte.slice(1)}`;
const radar = (i) => (i >= 0 ? `R${i + 1}` : t("vue.journal.un_radar"));
const nom_poste = (monde, id) => t("vue.journal.un_poste", {site: monde.cibles[monde.postes[id]?.cible]?.conduite ? t("vue.commun.cdc") : `C${(monde.postes[id]?.cible ?? 0) + 1}`});
const noeud = (n) => (n === "conduite" ? t("vue.journal.le_cdc") : n?.startsWith("radar:") ? `R${Number(n.slice(6)) + 1}` : n);

// Les détections sont regroupées par radar sur 10 s : un essaim se lit en quelques lignes, pas en mille.
const FENETRE_DETECTIONS = 10;

/** Rendre les détections groupées par radar et par fenêtre de 10 s : une ligne « R3 voit 12 drones (3:30 à 3:39) ». */
function lignes_detections(evenements) {
  const groupes = new Map();
  for (const e of evenements.filter((x) => x.type === "detection")) {
    const latence = e.connu === null ? null : e.connu - e.t;
    const cle = `${Math.floor(e.t / FENETRE_DETECTIONS)}|${e.radar}|${latence}`;
    const g = groupes.get(cle) ?? {t: e.t, fin: e.t, radar: e.radar, drones: [], latence};
    g.drones.push(e.drone);
    g.fin = e.t;
    groupes.set(cle, g);
  }
  return [...groupes.values()].map((g) => {
    const n = g.drones.length;
    const quoi = n === 1 ? t("vue.journal.le_drone", {n: g.drones[0] + 1})
      : g.fin > g.t ? t("vue.journal.drones_de_a", {n, de: instant(g.t), a: instant(g.fin)}) : t("vue.journal.drones", {n});
    const suite = g.latence === null ? t("vue.journal.non_relie")
      : g.latence === 0 ? t("vue.journal.aussitot") : n === 1 ? t("vue.journal.saura_a", {s: format_decimal(g.latence), a: instant(g.t + g.latence)})
        : t("vue.journal.saura", {s: format_decimal(g.latence)});
    return {t: g.t, famille: "detection", texte: t("vue.journal.voit", {radar: radar(g.radar), quoi, suite}), cible: {type: g.radar >= 0 ? "radar" : "drone", id: g.radar >= 0 ? g.radar : g.drones[0]}};
  });
}

const ARTICLES = {avion: "vue.journal.v_avion", drone_arme: "vue.journal.v_drone_arme", kamikaze: "vue.journal.v_kamikaze", brouilleur: "vue.journal.v_brouilleur"};

/** Rendre « l'avion 4 », « l'intercepteur 57 »… selon la famille du vecteur `id`. */
const nom_vecteur = (monde, id) => t(ARTICLES[monde.avions[id]?.type ?? "avion"], {n: id + 1});

function ligne(monde, e) {
  const avion = nom_vecteur(monde, e.avion);
  switch (e.type) {
    case "mission": {
      const piste = e.effectif ? t("vue.journal.piste_de", {n: e.effectif}) : t("vue.journal.une_piste");
      const recu = e.arrivee > e.t ? t("vue.journal.recevra", {par: noeud(e.depuis), a: instant(e.arrivee)}) : "";
      const centre = !e.centre ? majuscule(t("vue.journal.le_cdc")) : `${monde.reseau.centres[e.centre]?.nom ?? t("vue.journal.autre_centre")}`;
      return {famille: "mission", texte: t("vue.journal.envoie", {centre, avion, piste, recu}), cible: {type: "avion", id: e.avion}};
    }
    case "reception": return {famille: "mission", texte: majuscule(t(e.ordre ? "vue.journal.recoit_ordre" : "vue.journal.recoit_mission", {avion})), cible: {type: "avion", id: e.avion}};
    case "contact": return {famille: "contact", texte: majuscule(t("vue.journal.accroche", {avion, drone: e.drone + 1})), cible: {type: "avion", id: e.avion}};
    case "brouillage": return {famille: "tir", texte: t("vue.journal.neutralise", {n: e.tireur + 1, drone: e.drone + 1}), cible: {type: "drone", id: e.drone}};
    case "tir": {
      const poste = `${majuscule(nom_poste(monde, e.tireur))}${e.designe === false ? t("vue.journal.seul") : e.designe ? t("vue.journal.designe") : ""}`;
      const qui = e.couche === "air" ? majuscule(nom_vecteur(monde, e.tireur)) : poste;
      const cle = e.couche === "air" && monde.avions[e.tireur]?.type === "kamikaze" ? "vue.journal.percute" : "vue.journal.tire";
      const esquive = e.esquive ? t("vue.journal.esquive") : "";
      return {famille: "tir", texte: t(cle, {qui, drone: e.drone + 1, pk: format_decimal(e.pk), esquive, issue: t(e.detruit ? "vue.journal.detruit" : "vue.journal.manque")}), cible: {type: "drone", id: e.drone}};
    }
    case "impact": return {famille: "tir", texte: t("vue.journal.frappe", {cible: monde.cibles[e.cible]?.conduite ? t("vue.journal.le_cdc") : `C${e.cible + 1}`}), cible: {type: "cible", id: e.cible}};
    case "ordre": return {famille: "autre", texte: e.avions.length ? t("vue.journal.ordre", {n: e.avions.length, avions: e.avions.map((a) => a + 1).join(", ")}) : t("vue.journal.ordre_aucun"), cible: e.avions.length ? {type: "avion", id: e.avions[0]} : null};
    case "panne": return {famille: "autre", texte: t("vue.journal.cdc_detruit"), cible: {type: "conduite", id: 0}};
    case "incident": return {famille: "autre", texte: recit_incident(monde, e), cible: e.element.startsWith("radar:") ? {type: "radar", id: Number(e.element.slice(6))} : null};
    case "reseau": return {famille: "autre", texte: e.hs.length ? t("vue.journal.hors_service", {liste: e.hs.map((h) => (h.startsWith("liaison:") ? t("vue.journal.liaison", {n: Number(h.slice(8)) + 1}) : noeud(h))).join(", ")}) : t("vue.journal.en_service"), cible: null};
    default: return null;
  }
}

const nom_cible = (monde, k) => (monde.cibles[k]?.conduite ? t("vue.journal.le_cdc") : `C${k + 1}`);

/**
 * Rendre les réactions de l'essaim (MODELE § 22) groupées par fenêtre de 10 s et par décision : « 23 drones quittent
 * C3 pour C5 », « 40 drones contournent le site défendu près de C2 ».
 */
function lignes_reactions(monde, evenements) {
  const groupes = new Map();
  for (const e of evenements.filter((x) => x.type === "reaction")) {
    const quoi = e.nature === "reaffectation" ? `r|${e.de}|${e.vers}` : `d|${Math.round(e.foyer.geo.lat * 1e3)}|${Math.round(e.foyer.geo.lon * 1e3)}`;
    const cle = `${Math.floor(e.t / FENETRE_DETECTIONS)}|${quoi}`;
    const g = groupes.get(cle) ?? {t: e.t, e, drones: []};
    g.drones.push(e.drone);
    groupes.set(cle, g);
  }
  return [...groupes.values()].map(({t, e, drones}) => {
    const n = drones.length;
    const qui = n === 1 ? majuscule(t("vue.journal.le_drone", {n: drones[0] + 1})) : t("vue.journal.drones", {n});
    const texte = e.nature === "reaffectation"
      ? t("vue.journal.quitte", {n, qui, de: nom_cible(monde, e.de), vers: nom_cible(monde, e.vers)})
      : t("vue.journal.contourne", {n, qui, pertes: e.foyer.pertes});
    return {t, famille: "essaim", texte, cible: {type: "drone", id: drones[0]}};
  });
}

/** Rendre les lignes du journal jusqu'à l'instant du monde, dans l'ordre du temps : {t, famille, texte, cible}. */
export function lignes_journal(monde) {
  const evenements = monde.evenements ?? [];
  const autres = evenements.filter((e) => e.type !== "detection" && e.type !== "reaction").map((e) => {
    const l = ligne(monde, e);
    return l && {t: e.t, ...l};
  }).filter(Boolean);
  return [...lignes_detections(evenements), ...lignes_reactions(monde, evenements), ...autres].sort((a, b) => a.t - b.t);
}

/** Rendre la chaîne de l'information d'un drone : vu, connu du CDC, accroché, tiré, avec les instants. */
export function chaine_drone(monde, id) {
  const drone = monde.drones[id];
  const etapes = [];
  if (drone.detection === null) return [{texte: t("vue.journal.pas_vu")}];
  etapes.push({t: drone.detection, texte: t("vue.journal.vu_par", {radar: radar(drone.radar ?? -1)})});
  if (drone.connu === null) etapes.push({texte: t("vue.journal.jamais_connu")});
  else if (drone.connu > monde.t) etapes.push({t: drone.connu, texte: t("vue.journal.en_route")});
  else etapes.push({t: drone.connu, texte: drone.connu === drone.detection ? t("vue.journal.connu_aussitot") : t("vue.journal.connu_apres", {s: format_decimal(drone.connu - drone.detection)})});
  if (drone.connu !== null && drone.connu <= monde.t) {
    const delai = monde.scenario.conduite.delai_reaction;
    etapes.push({t: drone.connu + delai, texte: t("vue.journal.peut_agir", {s: format_decimal(delai)})});
  }
  for (const e of (monde.evenements ?? []).filter((x) => x.drone === id && (x.type === "contact" || x.type === "tir"))) {
    etapes.push(e.type === "contact"
      ? {t: e.t, texte: t("vue.journal.accroche_par", {n: e.avion + 1})}
      : {t: e.t, texte: t("vue.journal.tir_de", {tireur: e.couche === "air" ? t("vue.journal.tir_avion", {n: e.tireur + 1}) : t("vue.journal.tir_poste", {poste: nom_poste(monde, e.tireur)}), issue: t(e.detruit ? "vue.journal.detruit" : "vue.journal.manque")})});
  }
  return etapes.sort((a, b) => (a.t ?? 0) - (b.t ?? 0)).map((e) => ({...e, instant: e.t === undefined ? "" : instant(e.t)}));
}
