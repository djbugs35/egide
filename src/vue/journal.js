// Journal de l'information (MODELE § 17) : le journal du moteur traduit en phrases — qui a vu quoi, qui a informé
// qui, quand, qui est parti, qui a tiré. Pur, testé ; le panneau Journal et l'inspecteur le lisent.
import {format_decimal, format_duree} from "./format.js";

/** Familles de lignes, pour les filtres du panneau. */
export const FAMILLES = {detection: "Détections", mission: "Missions", contact: "Contacts", tir: "Tirs", essaim: "Réactions de l'essaim", autre: "Réseau et ordres"};

const instant = (t) => `${format_duree(t)}${Number.isInteger(t) ? "" : ",5"}`;
const radar = (i) => (i >= 0 ? `R${i + 1}` : "un radar");
const nom_poste = (monde, id) => `un poste de ${monde.cibles[monde.postes[id]?.cible]?.conduite ? "CDC" : `C${(monde.postes[id]?.cible ?? 0) + 1}`}`;
const noeud = (n) => (n === "conduite" ? "le CDC" : n?.startsWith("radar:") ? `R${Number(n.slice(6)) + 1}` : n);

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
    const quoi = n === 1 ? `le drone ${g.drones[0] + 1}` : `${n} drones${g.fin > g.t ? ` (de ${instant(g.t)} à ${instant(g.fin)})` : ""}`;
    const suite = g.latence === null ? " ; non relié au CDC, l'information s'arrête là"
      : g.latence === 0 ? " ; le CDC le sait aussitôt" : ` ; le CDC le saura ${format_decimal(g.latence)} s plus tard${n === 1 ? `, à ${instant(g.t + g.latence)}` : ""}`;
    return {t: g.t, famille: "detection", texte: `${radar(g.radar)} voit ${quoi}${suite}.`, cible: {type: g.radar >= 0 ? "radar" : "drone", id: g.radar >= 0 ? g.radar : g.drones[0]}};
  });
}

const ARTICLES = {avion: "l'avion", drone_arme: "le drone armé", kamikaze: "l'intercepteur", brouilleur: "le brouilleur"};

/** Rendre « l'avion 4 », « l'intercepteur 57 »… selon la famille du vecteur `id`. */
const nom_vecteur = (monde, id) => `${ARTICLES[monde.avions[id]?.type ?? "avion"]} ${id + 1}`;

function ligne(monde, e) {
  const avion = nom_vecteur(monde, e.avion);
  switch (e.type) {
    case "mission": {
      const piste = e.effectif ? `une piste de ${e.effectif} drone${e.effectif > 1 ? "s" : ""}` : "une piste";
      const recu = e.arrivee > e.t ? `, par ${noeud(e.depuis)} ; il la recevra à ${instant(e.arrivee)}` : "";
      const centre = !e.centre ? "Le CDC" : `${monde.reseau.centres[e.centre]?.nom ?? "Un autre centre"}`;
      return {famille: "mission", texte: `${centre} envoie ${avion} intercepter ${piste}${recu}.`, cible: {type: "avion", id: e.avion}};
    }
    case "reception": return {famille: "mission", texte: `${avion[0].toUpperCase()}${avion.slice(1)} reçoit ${e.ordre ? "l'ordre" : "sa mission"} et part.`, cible: {type: "avion", id: e.avion}};
    case "contact": return {famille: "contact", texte: `${avion[0].toUpperCase()}${avion.slice(1)} accroche le drone ${e.drone + 1} avec son propre capteur et le poursuit.`, cible: {type: "avion", id: e.avion}};
    case "brouillage": return {famille: "tir", texte: `Le brouilleur ${e.tireur + 1} neutralise le drone ${e.drone + 1}.`, cible: {type: "drone", id: e.drone}};
    case "tir": {
      const poste = `${nom_poste(monde, e.tireur)[0].toUpperCase()}${nom_poste(monde, e.tireur).slice(1)}${e.designe === false ? ", seul après acquisition," : e.designe ? ", désigné par un centre," : ""}`;
      const tireur = nom_vecteur(monde, e.tireur);
      const qui = e.couche === "air" ? `${tireur[0].toUpperCase()}${tireur.slice(1)}` : poste;
      const verbe = e.couche === "air" && monde.avions[e.tireur]?.type === "kamikaze" ? "percute" : "tire sur";
      const esquive = e.esquive ? `, réduit par son esquive` : "";
      return {famille: "tir", texte: `${qui} ${verbe} le drone ${e.drone + 1} (Pk ${format_decimal(e.pk)}${esquive}) : ${e.detruit ? "détruit" : "manqué"}.`, cible: {type: "drone", id: e.drone}};
    }
    case "impact": return {famille: "tir", texte: `Un drone frappe ${monde.cibles[e.cible]?.conduite ? "le CDC" : `C${e.cible + 1}`}.`, cible: {type: "cible", id: e.cible}};
    case "ordre": return {famille: "autre", texte: `Ordre de l'éditeur, parti du CDC : avion${e.avions.length > 1 ? "s" : ""} ${e.avions.map((a) => a + 1).join(", ") || "aucun joignable"}.`, cible: e.avions.length ? {type: "avion", id: e.avions[0]} : null};
    case "panne": return {famille: "autre", texte: "Le CDC est détruit par l'essaim : plus rien n'est connu, plus personne n'est affecté.", cible: {type: "conduite", id: 0}};
    case "reseau": return {famille: "autre", texte: e.hs.length ? `Hors service : ${e.hs.map((h) => (h.startsWith("liaison:") ? `liaison ${Number(h.slice(8)) + 1}` : noeud(h))).join(", ")}.` : "Tout le réseau est de nouveau en service.", cible: null};
    default: return null;
  }
}

const nom_cible = (monde, k) => (monde.cibles[k]?.conduite ? "le CDC" : `C${k + 1}`);

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
    const qui = drones.length === 1 ? `Le drone ${drones[0] + 1}` : `${drones.length} drones`;
    const pluriel = drones.length > 1 ? "nt" : "";
    const texte = e.nature === "reaffectation"
      ? `${qui} quitte${pluriel} ${nom_cible(monde, e.de)}, où l'essaim perd ses drones, pour ${nom_cible(monde, e.vers)}, déjà frappée.`
      : `${qui} contourne${pluriel} un site défendu (${e.foyer.pertes} pertes connues).`;
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
  if (drone.detection === null) return [{texte: "Pas encore vu par un radar."}];
  etapes.push({t: drone.detection, texte: `Vu par ${radar(drone.radar ?? -1)}.`});
  if (drone.connu === null) etapes.push({texte: "Jamais connu du CDC : le radar qui le voit n'y est pas relié, ou le CDC est hors service."});
  else if (drone.connu > monde.t) etapes.push({t: drone.connu, texte: "L'information est en route vers le CDC."});
  else etapes.push({t: drone.connu, texte: drone.connu === drone.detection ? "Connu du CDC aussitôt." : `Connu du CDC, ${format_decimal(drone.connu - drone.detection)} s après.`});
  if (drone.connu !== null && drone.connu <= monde.t) {
    const delai = monde.scenario.conduite.delai_reaction;
    etapes.push({t: drone.connu + delai, texte: `Le CDC peut agir dessus après son délai de réaction (${format_decimal(delai)} s).`});
  }
  for (const e of (monde.evenements ?? []).filter((x) => x.drone === id && (x.type === "contact" || x.type === "tir"))) {
    etapes.push(e.type === "contact"
      ? {t: e.t, texte: `Accroché par l'avion ${e.avion + 1}, avec son propre capteur.`}
      : {t: e.t, texte: `${e.couche === "air" ? `Tir de l'avion ${e.tireur + 1}` : `Tir d'${nom_poste(monde, e.tireur)}`} : ${e.detruit ? "détruit" : "manqué"}.`});
  }
  return etapes.sort((a, b) => (a.t ?? 0) - (b.t ?? 0)).map((e) => ({...e, instant: e.t === undefined ? "" : instant(e.t)}));
}
