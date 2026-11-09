// Éditeur de déploiement (MODELE § 21) : palette du catalogue et dépôt d'une unité sur la carte, à la manière d'un jeu
// de stratégie. Chaque dépôt devient des modifications par chemin du scénario : annulation, export et rejeu d'office.
// Pur, sans DOM, testé.
import {unite_si} from "../moteur/catalogue.js";
import {direct, inverse} from "../moteur/geodesie.js";
import {positions_radars} from "../moteur/radars.js";
import {portee_liaison} from "../moteur/reseau.js";
import {sans_prive} from "./catalogue_prive.js";
import {en_degres, modifications_ajout_centre, modifications_ajout_cible, modifications_ajout_liaison, modifications_ajout_radar, noeud_element} from "./edition.js";
import {libelle_noeud, position_noeud} from "./reseau_vue.js";

// Munitions d'une batterie déposée ; modifiables ensuite dans sa fiche.
export const MUNITIONS_BATTERIE = 40;
// Écart entre vecteurs déposés ensemble : ils forment un petit cercle autour du point visé.
const ECART_DEPOT = 1500;

/**
 * Familles de la palette, dans l'ordre d'affichage : `prefixe` des identifiants d'unités qu'elle regroupe, `cible` ce
 * sur quoi l'on dépose (la carte, ou une unité déjà placée), `aide` la phrase affichée.
 */
export const FAMILLES_PALETTE = [
  {id: "infrastructures", libelle: "Infrastructures", cible: "carte", aide: "Sites sensibles à défendre et centres C2 (CDC)."},
  {id: "capteurs", libelle: "Capteurs", prefixe: "capteurs/", cible: "carte", aide: "Radars : chacun garde son modèle, sa portée et sa hauteur d'antenne."},
  {id: "sol", libelle: "Défense sol", prefixe: "sites/", cible: "carte", aide: "Batteries sol-air, posées une à une, rattachées au site le plus proche."},
  {id: "avions", libelle: "Aviation", prefixe: "vecteurs/avions/", cible: "carte", aide: "Intercepteurs : un avion par dépôt (ou la quantité choisie), en orbite au point déposé."},
  {id: "drones_defensifs", libelle: "Drones défensifs", prefixe: "vecteurs/drones_defensifs/", cible: "carte", aide: "Essaims défensifs : armés, intercepteurs kamikazes, brouilleurs."},
  {id: "liaisons", libelle: "Communications", prefixe: "liaisons/", cible: "unite", aide: "Cliquez un moyen, puis les deux unités à relier. Glisser un moyen sur une unité l'en équipe, pour « Relier automatiquement »."},
  {id: "effecteurs", libelle: "Armements", prefixe: "effecteurs/", cible: "unite", aide: "À déposer sur un avion ou un drone défensif : son groupe change d'emport."},
  {id: "menace", libelle: "Menace", prefixe: "vecteurs/drones/", cible: "carte", aide: "Modèle de drone de l'essaim adverse (où qu'on le dépose)."},
  {id: "terrains", libelle: "Terrain", prefixe: "terrains/", cible: "carte", aide: "Relief du théâtre (où qu'on le dépose)."},
];

const SPECIAUX = [{id: "special/cible", nom: "Site sensible à défendre", icone: "site"}, {id: "special/centre", nom: "Centre C2 (CDC)", icone: "c2"}];

/**
 * Rendre la palette : pour chaque famille, ses éléments déposables {id, nom, pays, icone}, lus dans l'index du
 * catalogue (sans les classes `_`), les unités génériques d'abord puis par pays ; `pays` (code ISO) restreint aux
 * unités de ce pays et aux génériques.
 */
export function palette(index, pays = "") {
  const garde = (u) => !pays || !u.pays || u.pays === pays;
  const ordre = (a, b) => (a.pays ?? "").localeCompare(b.pays ?? "") || a.nom.localeCompare(b.nom);
  return FAMILLES_PALETTE.map((famille) => ({
    ...famille,
    elements: famille.id === "infrastructures" ? SPECIAUX
      : index.filter((u) => !u.base && sans_prive(u.id).startsWith(famille.prefixe) && garde(u)).sort(ordre).map(({id, nom, pays: p = null, icone = null}) => ({id, nom, pays: p, icone})),
  })).filter((famille) => famille.elements.length);
}

const sans_accents = (texte) => texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Rendre les familles à montrer : avec `texte`, ce qui le contient dans toutes les familles, sinon toute la famille `famille`. */
export function filtrer_palette(familles, {texte = "", famille = null} = {}) {
  const cherche = sans_accents(texte.trim());
  if (!cherche) return familles.filter((f) => f.id === famille);
  return familles.map((f) => ({...f, elements: f.elements.filter((e) => sans_accents(`${e.nom} ${e.pays ?? ""}`).includes(cherche))})).filter((f) => f.elements.length);
}

/** Rendre la famille de la palette d'un identifiant déposé, public ou privé. */
export const famille_de = (id) => FAMILLES_PALETTE.find((f) => (f.id === "infrastructures" ? id.startsWith("special/") : sans_prive(id).startsWith(f.prefixe)));

/**
 * Rendre les modifications qui déposent `id` en `geo` ({} si le dépôt n'a pas de sens, par exemple un moyen de
 * communication lâché hors de toute unité). `quantite` : vecteurs déposés d'un coup ; `sous` : élément éditable visé.
 */
export function modifications_depot(monde, brut, id, geo, {quantite = 1, sous = null} = {}) {
  const famille = famille_de(id)?.id;
  if (id === "special/cible") return modifications_ajout_cible(monde, geo);
  if (id === "special/centre") return modifications_ajout_centre(brut, geo);
  if (famille === "capteurs") return modifications_ajout_radar(monde, geo, brut, id === brut.bleu.radar.unite ? {} : {unite: id});
  if (famille === "sol") return {"bleu.sol.batteries": [...(brut.bleu.sol.batteries ?? []), {...en_degres(geo), munitions: MUNITIONS_BATTERIE, unite: id}]};
  if (famille === "avions" || famille === "drones_defensifs") return depot_vecteurs(monde, brut, id, geo, Math.max(1, Math.round(quantite)));
  if (famille === "liaisons") return equiper(monde, brut, sous, id);
  if (famille === "effecteurs") return armer(monde, brut, sous, id);
  if (famille === "menace") return {"rouge.unite": id, "rouge.surcharges": {}};
  if (famille === "terrains") return {"theatre.terrain": id};
  return {};
}

/** Déposer `quantite` vecteurs `id` en `geo` : dans le groupe de cette unité (créé s'il n'existe pas), orbites des autres figées. */
function depot_vecteurs(monde, brut, id, geo, quantite) {
  const g = brut.bleu.avions.findIndex((groupe) => groupe.unite === id);
  const groupe = monde.scenario.avions[g];
  const existants = g < 0 ? [] : monde.avions.filter((avion) => avion.groupe === groupe).map((avion) => en_degres(avion.orbite));
  const nouveaux = Array.from({length: quantite}, (_, k) => en_degres(k === 0 ? geo : direct(geo, (2 * Math.PI * k) / (quantite - 1 || 1), ECART_DEPOT)));
  const orbites = [...existants, ...nouveaux];
  if (g >= 0) return {[`bleu.avions.${g}.nombre`]: orbites.length, [`bleu.avions.${g}.orbites_placees`]: orbites};
  const altitude = famille_de(id)?.id === "drones_defensifs" ? 300 : 1000;
  return {[`bleu.avions.${brut.bleu.avions.length}`]: {unite: id, nombre: orbites.length, altitude_m: altitude, surcharges: {}, surcharges_emport: {}, orbites_placees: orbites}};
}

/** Équiper le nœud de l'élément `sous` du moyen de communication `moyen` (MODELE § 21.4). */
function equiper(monde, brut, sous, moyen) {
  const noeud = sous && noeud_element(monde, sous);
  if (!noeud) return {};
  const equipements = brut.bleu.reseau.equipements ?? [];
  const actuel = equipements.find((e) => e.noeud === noeud);
  if (actuel?.moyens.includes(moyen)) return {};
  const autres = equipements.filter((e) => e !== actuel);
  return {"bleu.reseau.equipements": [...autres, {noeud, moyens: [...(actuel?.moyens ?? []), moyen]}]};
}

/** Changer l'emport du groupe de l'avion `sous` pour l'effecteur `arme` ; les surcharges de l'ancienne arme tombent. */
function armer(monde, brut, sous, arme) {
  if (sous?.type !== "avion") return {};
  const g = monde.scenario.avions.indexOf(monde.avions[sous.indice].groupe);
  return {[`bleu.avions.${g}.surcharges`]: {...brut.bleu.avions[g].surcharges, emport: arme}, [`bleu.avions.${g}.surcharges_emport`]: {}};
}

/** Rendre les moyens dont le nœud est équipé, ou null s'il n'en déclare aucun (il accepte alors tout moyen). */
export const equipement = (brut, noeud) => (brut.bleu.reseau.equipements ?? []).find((e) => e.noeud === noeud)?.moyens ?? null;

/**
 * Rendre le moyen d'une liaison tirée de `de` à `vers` (MODELE § 21.4) : `prefere` (choix de la barre) s'il est commun
 * aux deux équipements, sinon le plus rapide des moyens communs ; null s'ils n'en partagent aucun. Un nœud sans
 * équipement déclaré accepte tout moyen.
 */
export function choisir_moyen(brut, fichiers, de, vers, prefere) {
  const [a, b] = [equipement(brut, de), equipement(brut, vers)];
  if (!a && !b) return prefere;
  const communs = !a ? b : !b ? a : a.filter((m) => b.includes(m));
  if (communs.includes(prefere)) return prefere;
  return [...communs].sort((x, y) => unite_si(x, fichiers).latence - unite_si(y, fichiers).latence)[0] ?? null;
}

/** Rendre `{"bleu.reseau.equipements": …}` où les nœuds `noeuds` qui déclarent des moyens gagnent `moyen`, ou {} si rien ne change. */
function modifications_equipement_liaison(brut, noeuds, moyen) {
  const equipements = brut.bleu.reseau.equipements ?? [];
  const concerne = (e) => noeuds.includes(e.noeud) && !e.moyens.includes(moyen);
  if (!equipements.some(concerne)) return {};
  return {"bleu.reseau.equipements": equipements.map((e) => (concerne(e) ? {...e, moyens: [...e.moyens, moyen]} : e))};
}

/** Rendre le texte du refus d'une liaison entre deux nœuds au sol trop éloignés pour `unite`, ou null si elle porte. */
function refus_portee(monde, de, vers, unite) {
  // Un groupe de vecteurs bouge : sa portée se juge avion par avion à la simulation (MODELE § 15.2), pas ici.
  if (de.startsWith("avions:") || vers.startsWith("avions:")) return null;
  const [a, b] = [position_noeud(monde, de), position_noeud(monde, vers)];
  if (!a || !b) return null;
  const distance = inverse(a, b).distance;
  const portee = portee_liaison(unite, unite.hauteur_antenne, unite.hauteur_antenne);
  if (distance <= portee) return null;
  return `${unite.nom} porte ${Math.round(portee / 1000)} km ; ${libelle_noeud(monde, de)} et ${libelle_noeud(monde, vers)} sont à ${Math.round(distance / 1000)} km. Choisissez un moyen de plus longue portée, ou passez par un relais.`;
}

/**
 * Rendre {modifications, resume} de la liaison que l'utilisateur tire de `de` à `vers` par `moyen`, ou {refus} avec
 * la raison à lui montrer (MODELE § 21.4). Le moyen choisi est respecté : les nœuds qui déclarent un équipement en
 * sont complétés. Le relief n'est pas regardé ici : la simulation marque la liaison masquée.
 */
export function preparer_liaison(monde, brut, fichiers, de, vers, moyen) {
  if (de === vers) return {refus: "C'est la même unité : cliquez l'autre extrémité de la liaison."};
  // Fichier du moyen encore en chargement : la portée reste vérifiée par la simulation, qui marquera « hors portée ».
  const unite = moyen in fichiers ? unite_si(moyen, fichiers) : null;
  const refus = unite && refus_portee(monde, de, vers, unite);
  if (refus) return {refus};
  const liens = `${libelle_noeud(monde, de)} ↔ ${libelle_noeud(monde, vers)}`;
  return {
    modifications: {...modifications_ajout_liaison(monde, brut, de, vers, moyen), ...modifications_equipement_liaison(brut, [de, vers], moyen)},
    resume: unite ? `${liens} : ${unite.nom}` : liens,
  };
}

/** Rendre les nœuds du réseau qui existent : centres, radars, postes de chaque cible défendue, groupes de vecteurs non vides. */
export function noeuds_reseau(monde) {
  const defendues = monde.cibles.map((_, i) => i).filter((i) => monde.postes.some((p) => p.cible === i));
  return [
    "conduite", ...monde.scenario.reseau.centres.map((_, k) => `centre:${k}`),
    ...positions_radars(monde.scenario).map((_, i) => `radar:${i}`),
    ...defendues.map((i) => `sol:${i}`),
    ...monde.scenario.avions.map((g, i) => (g.nombre > 0 ? `avions:${i}` : null)).filter(Boolean),
  ];
}

/** Rendre la hauteur d'une extrémité pour la portée d'un moyen : altitude du groupe pour des vecteurs, mât du moyen au sol. */
export const hauteur_noeud = (monde, noeud, moyen) => (noeud.startsWith("avions:") ? monde.scenario.avions[Number(noeud.slice(7))].altitude : moyen.hauteur_antenne);

/** Rendre le moyen le plus rapide que partagent deux nœuds équipés et que leur distance permet, ou null. */
function meilleur_moyen(monde, brut, fichiers, de, vers) {
  const [a, b] = [equipement(brut, de), equipement(brut, vers)];
  const [pa, pb] = [position_noeud(monde, de), position_noeud(monde, vers)];
  if (!a || !b || !pa || !pb) return null;
  const distance = inverse(pa, pb).distance;
  return a.filter((m) => b.includes(m)).map((id) => unite_si(id, fichiers))
    .filter((m) => distance <= portee_liaison(m, hauteur_noeud(monde, de, m), hauteur_noeud(monde, vers, m)))
    .sort((x, y) => x.latence - y.latence)[0]?.id ?? null;
}

/**
 * Rendre {modifications, liaisons, isoles} du réseau automatique (MODELE § 21.4) : chaque unité équipée est reliée à
 * chaque centre (CDC principal et autres) avec qui elle partage un moyen à portée, le plus rapide ; les centres entre
 * eux de même. Les unités sans équipement déclaré restent hors réseau. Le relief est vérifié à la simulation.
 */
export function modifications_reseau_auto(monde, brut, fichiers) {
  const noeuds = noeuds_reseau(monde).filter((n) => equipement(brut, n));
  const centres = noeuds.filter((n) => n === "conduite" || n.startsWith("centre:"));
  const liaisons = [];
  noeuds.forEach((de, i) => {
    for (const vers of centres) {
      if (vers === de || (centres.includes(de) && centres.indexOf(vers) < i)) continue;
      const moyen = meilleur_moyen(monde, brut, fichiers, de, vers);
      if (moyen) liaisons.push({de, vers, moyen});
    }
  });
  const relies = new Set(liaisons.flatMap((l) => [l.de, l.vers]));
  const isoles = noeuds_reseau(monde).filter((n) => !relies.has(n));
  return {modifications: {"bleu.reseau.mode": "liaisons", "bleu.reseau.liaisons": liaisons}, liaisons: liaisons.length, isoles};
}
