// Rejeu d'un raid pour un moteur de jeu (jalon 15.1, MODELE § 24, docs/FORMATS.md § 6) : le raid simulé, échantillonné
// et mis en lignes JSON. Égide reste l'autorité : un client relit ces positions, il ne simule rien. Node et navigateur.
import {unite_si} from "./catalogue.js";
import {soustraire, vers_degres, vers_ecef, vers_enu} from "./geodesie.js";
import {cap_drone} from "./menace.js";
import {bilan, simuler} from "./monde.js";
import {empreinte} from "./preuve.js";
import {parametres_radar, positions_radars} from "./radars.js";
import {en_v2, ids_unites, resoudre_scenario} from "./scenario.js";
import {est_actif} from "./tir.js";

export const FORMAT_REJEU = "egide-rejeu";
export const VERSION_REJEU = 1;
export const PAS_ECHANTILLON_DEFAUT = 0.5;

// Ordre des colonnes d'un échantillon ; l'en-tête les recopie, si bien qu'un client n'a aucune position à deviner.
// Pas de latitude ni de longitude ici : mesuré sur la référence, elles portaient le fichier de 24 à 45 Mo compressés,
// alors que le repère ENU les redonne exactement (docs/FORMATS.md § 6.3).
const COLONNES_POSITION = ["e", "n", "u", "alt", "cap_deg", "etat"];
export const COLONNES = {drones: ["id", ...COLONNES_POSITION], vecteurs: ["id", ...COLONNES_POSITION, "munitions"]};
export const ETATS = {drones: ["inconnu", "detecte"], vecteurs: ["orbite", "ralliement", "poste", "retour", "engagement", "perdu"]};

// 10 cm : dix fois mieux que le critère de 1 m du client (PLAN_3D, jalon 15).
const DECIMALES_METRE = 1;
// 1e-7 degré, soit 1 cm au sol.
const DECIMALES_DEGRE = 7;
const DECIMALES_CAP = 1;
const DECIMALES_TEMPS = 3;
// Un instant du moteur est une somme de pas : l'erreur d'arrondi ne doit pas faire sauter un échantillon.
const TOLERANCE_INSTANT = 1e-9;

function arrondi(valeur, decimales) {
  const facteur = 10 ** decimales;
  return Math.round(valeur * facteur) / facteur;
}

/** Rendre la fonction qui donne le repère ENU (m) d'un point ECEF, autour de `origine`. */
export function creer_repere(origine) {
  const ecefOrigine = vers_ecef(origine);
  return (ecef) => vers_enu(origine, soustraire(ecef, ecefOrigine));
}

/** Rendre la fonction qui écrit un point géographique : {lat_deg, lon_deg, alt_m, e, n, u}. */
function creer_lieu(repere) {
  return (geo) => {
    const point = {...geo, alt: geo.alt ?? 0};
    const {e, n, u} = repere(vers_ecef(point));
    return {
      lat_deg: arrondi(vers_degres(point.lat), DECIMALES_DEGRE), lon_deg: arrondi(vers_degres(point.lon), DECIMALES_DEGRE), alt_m: arrondi(point.alt, DECIMALES_METRE),
      e: arrondi(e, DECIMALES_METRE), n: arrondi(n, DECIMALES_METRE), u: arrondi(u, DECIMALES_METRE),
    };
  };
}

/** Rendre `valeur` où chaque position géographique du moteur (rad) est remplacée par son écriture `lieu`. */
function en_lieux(valeur, lieu) {
  if (Array.isArray(valeur)) return valeur.map((v) => en_lieux(v, lieu));
  if (!valeur || typeof valeur !== "object") return valeur;
  if (Number.isFinite(valeur.lat) && Number.isFinite(valeur.lon)) return lieu(valeur);
  return Object.fromEntries(Object.entries(valeur).map(([cle, v]) => [cle, en_lieux(v, lieu)]));
}

/** Rendre un cap en radians écrit en degrés de 0 à 360, depuis le nord. */
const cap_en_degres = (cap) => arrondi(((vers_degres(cap) % 360) + 360) % 360, DECIMALES_CAP);

/** Rendre le rang de `etat` dans `liste` ; un état que le format ne connaît pas fait échouer l'export. */
function rang_etat(liste, etat) {
  const rang = liste.indexOf(etat);
  if (rang < 0) throw new Error(`état « ${etat} » absent du format de rejeu (ETATS, docs/FORMATS.md § 6)`);
  return rang;
}

/** Rendre les colonnes de position d'une entité, dans l'ordre de COLONNES. */
function echantillon({geo, ecef}, repere, cap, etat) {
  const {e, n, u} = repere(ecef);
  return [
    arrondi(e, DECIMALES_METRE), arrondi(n, DECIMALES_METRE), arrondi(u, DECIMALES_METRE), arrondi(geo.alt, DECIMALES_METRE), cap, etat,
  ];
}

/** Rendre l'image du monde : drones en vol, vecteurs (perdus compris) et munitions de chaque poste, dans l'ordre du statique. */
function image(monde, repere) {
  const drones = monde.drones.filter((d) => est_actif(d, monde.t))
    .map((d) => [d.id, ...echantillon(d, repere, cap_en_degres(cap_drone(d)), rang_etat(ETATS.drones, d.detection === null ? "inconnu" : "detecte"))]);
  const vecteurs = monde.avions.map((a) => [a.id, ...echantillon(a, repere, cap_en_degres(a.cap), rang_etat(ETATS.vecteurs, a.perdu ? "perdu" : a.etat)), a.munitions]);
  return {genre: "image", t: arrondi(monde.t, DECIMALES_TEMPS), drones, vecteurs, postes: monde.postes.map((p) => p.munitions)};
}

/** Rendre la description de ce qui ne bouge pas, lue à l'instant initial (munitions de départ). */
function statique(monde, lieu) {
  const {scenario} = monde;
  return {
    genre: "statique",
    drones: {unite: scenario.rouge.id, nombre: monde.drones.length},
    vecteurs: monde.avions.map((a) => ({id: a.id, unite: a.groupe.id, noeud: `avions:${scenario.avions.indexOf(a.groupe)}`, munitions: a.munitions, orbite: lieu(a.orbite)})),
    sites: monde.cibles.map((c, i) => ({id: i, noeud: `sol:${i}`, conduite: c.conduite === true, ...lieu(c.geo)})),
    radars: positions_radars(scenario).map((geo, i) => ({id: i, noeud: `radar:${i}`, unite: parametres_radar(scenario, i).id, ...lieu(geo)})),
    postes: monde.postes.map((p) => ({id: p.id, cible: p.cible, batterie: p.batterie ?? null, unite: (p.unite ?? scenario.sol).id, munitions: p.munitions, ...lieu(p.geo)})),
    centres: monde.reseau.centres.map((c) => ({noeud: c.id, nom: c.nom, ...lieu(c.geo)})),
    liaisons: {mode: scenario.reseau.mode, liste: scenario.reseau.liaisons.map((l) => ({de: l.de, vers: l.vers, moyen: l.moyen?.id ?? l.moyen}))},
    zones: en_lieux(scenario.theatre.zones, lieu),
  };
}

/** Rendre la fiche de chaque unité en jeu ; `dimensions` reste null tant que l'unité n'en déclare pas. */
function catalogue(brut, fichiers) {
  return ids_unites(brut).sort().map((id) => {
    const unite = unite_si(id, fichiers);
    return {id, famille: id.replace(/^prive\//, "").split("/").slice(0, -1).join("/"), nom: unite.nom, pays: unite.pays ?? null, icone: unite.icone ?? null, dimensions: unite.dimensions ?? null};
  });
}

/** Rendre l'en-tête du rejeu ; `trace` : empreinte de reproductibilité (voir preuve.js). */
function entete(brut, fichiers, scenario, trace, {pas, duree, images}) {
  const {origine} = scenario.theatre;
  return {
    genre: "entete", format: FORMAT_REJEU, version: VERSION_REJEU, nom: scenario.nom ?? null, empreinte: trace.empreinte, graine: scenario.simulation.graine,
    origine: {lat_deg: vers_degres(origine.lat), lon_deg: vers_degres(origine.lon), alt_m: origine.alt ?? 0},
    repere: "ENU en mètres, plan tangent à l'origine : e vers l'est, n vers le nord, u vers le haut de l'origine",
    duree_s: duree, pas_simulation_s: scenario.simulation.pas, pas_echantillon_s: pas, images, colonnes: COLONNES, etats: ETATS, catalogue: catalogue(brut, fichiers),
  };
}

/**
 * Rendre les enregistrements du rejeu du scénario `brut`, dans l'ordre du fichier : en-tête, statique, puis images et
 * évènements mêlés par instant croissant, enfin le bilan. `pas_echantillon` (s) est borné par le pas de simulation.
 */
export async function creer_rejeu(brut, fichiers, registre, {pas_echantillon = PAS_ECHANTILLON_DEFAUT} = {}) {
  const v2 = en_v2(brut);
  const scenario = resoudre_scenario(v2, fichiers);
  const pas = Math.max(pas_echantillon, scenario.simulation.pas);
  const trace = await empreinte(v2, fichiers, registre);
  const repere = creer_repere({...scenario.theatre.origine, alt: scenario.theatre.origine.alt ?? 0});
  const lieu = creer_lieu(repere);
  const chronologie = [];
  let [fixes, derniere, journalises, rang] = [null, null, 0, 0];

  // Les évènements d'un pas précèdent l'image de sa fin : les instants du fichier ne décroissent jamais.
  const vider_journal = (monde) => {
    for (; journalises < monde.evenements.length; journalises++) chronologie.push({genre: "evenement", ...en_lieux(monde.evenements[journalises], lieu)});
  };
  const prendre_image = (monde) => {
    vider_journal(monde);
    chronologie.push(image(monde, repere));
    derniere = monde.t;
  };
  const observer = (monde) => {
    fixes ??= statique(monde, lieu);
    if (monde.t + TOLERANCE_INSTANT < rang * pas) return;
    rang = Math.floor(monde.t / pas + TOLERANCE_INSTANT) + 1;
    prendre_image(monde);
  };

  const monde = simuler(scenario, {registre, journal: true, observer});
  if (derniere !== monde.t) prendre_image(monde);
  vider_journal(monde);
  const images = chronologie.filter((e) => e.genre === "image").length;
  return [entete(v2, fichiers, scenario, trace, {pas, duree: monde.t, images}), fixes, ...chronologie, {genre: "bilan", ...bilan(monde)}];
}

/** Rendre le texte du fichier : un enregistrement JSON par ligne. */
export const texte_rejeu = (enregistrements) => `${enregistrements.map((e) => JSON.stringify(e)).join("\n")}\n`;

/** Rendre {entete, statique, images, evenements, bilan} du texte d'un rejeu ; lève une erreur si ce n'en est pas un. */
export function lire_rejeu(texte) {
  const [tete, fixes, ...suite] = texte.trim().split("\n").map((ligne) => JSON.parse(ligne));
  if (tete?.format !== FORMAT_REJEU) throw new Error(`pas un fichier de rejeu : format « ${tete?.format} »`);
  if (tete.version !== VERSION_REJEU) throw new Error(`version de rejeu ${tete.version} non prise en charge (attendue : ${VERSION_REJEU})`);
  return {entete: tete, statique: fixes, images: suite.filter((e) => e.genre === "image"), evenements: suite.filter((e) => e.genre === "evenement"), bilan: suite.find((e) => e.genre === "bilan")};
}

/**
 * Rendre le bilan recalculé à partir des seules images et évènements du rejeu : ce que voit un client. Les tirs ne s'y
 * retrouvent pas : le journal note leur résolution, et un tir en vol sur un drone déjà détruit n'en a pas.
 */
export function bilan_du_rejeu({statique: fixes, images, evenements}) {
  const fuites = fixes.sites.map(() => 0);
  const detruits = {air: 0, sol: 0};
  for (const e of evenements) {
    if (e.type === "impact") fuites[e.cible]++;
    if (e.type === "tir" && e.detruit) detruits[e.couche]++;
  }
  const fin = images.at(-1);
  return {
    fuites: fuites.reduce((a, b) => a + b, 0), fuites_max_cible: Math.max(...fuites), detruits_air: detruits.air, detruits_sol: detruits.sol,
    munitions_air_restantes: fin.vecteurs.reduce((somme, v) => somme + v.at(-1), 0), munitions_sol_restantes: fin.postes.reduce((a, b) => a + b, 0), duree: fin.t,
  };
}
