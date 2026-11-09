// Catalogue d'unités : un fichier JSON par unité sous unites/ (public) ou prive/unites/ (hors git).
// Une unité hérite des clés de son parent ; chaque clé est documentée dans le bloc « _aide » d'un ancêtre.
import {convertir_objet} from "./unites.js";

export const FIDELITES = ["notionnel", "cinematique", "point_masse", "6ddl"];
// Clés dont la valeur est l'identifiant d'une autre unité, à charger avec celle qui la cite.
const REFERENCES = ["herite_de", "emport"];

export class CatalogueInvalide extends Error {}

/** Rendre le chemin (relatif à la racine du dépôt) du fichier d'une unité : « prive/… » vise le catalogue privé. */
export const chemin_unite = (id) => (id.startsWith("prive/") ? `prive/unites/${id.slice(6)}.json` : `unites/${id}.json`);

/**
 * Rendre les fichiers bruts ({id: contenu}) des unités `ids` et de toutes celles qu'elles citent (parents, emports).
 * `lire(chemin)` rend le JSON d'un fichier (fs sous Node, fetch dans le navigateur).
 */
export async function charger_unites(ids, lire) {
  const fichiers = {};
  const enAttente = [...ids];
  while (enAttente.length) {
    const id = enAttente.pop();
    if (id in fichiers) continue;
    try {
      fichiers[id] = await lire(chemin_unite(id));
    } catch (erreur) {
      throw new CatalogueInvalide(`unité introuvable : ${id} (${chemin_unite(id)}) — ${erreur.message}`);
    }
    for (const cle of REFERENCES) if (typeof fichiers[id][cle] === "string") enAttente.push(fichiers[id][cle]);
  }
  return fichiers;
}

function fusionner(id, fichiers, lignee) {
  if (lignee.includes(id)) throw new CatalogueInvalide(`héritage circulaire : ${[...lignee, id].join(" → ")}`);
  const fichier = fichiers[id];
  if (!fichier) throw new CatalogueInvalide(`unité non chargée : ${id}`);
  if (!fichier.herite_de) return {...fichier, _aide: {...fichier._aide}, _lignee: [id]};
  const parent = fusionner(fichier.herite_de, fichiers, [...lignee, id]);
  const {herite_de: _, ...propre} = fichier;
  // Les algorithmes se fusionnent rôle par rôle : une unité fille ne remplace que les rôles qu'elle cite.
  const algos = {...parent.algos, ...fichier.algos};
  return {...parent, ...propre, algos, _aide: {...parent._aide, ...fichier._aide}, _lignee: [...parent._lignee, id]};
}

function valider(id, unite) {
  const sansAide = Object.keys(unite).filter((cle) => !cle.startsWith("_") && !(cle in unite._aide));
  if (sansAide.length) throw new CatalogueInvalide(`${id} : clés sans phrase dans _aide : ${sansAide.join(", ")}`);
  if (!FIDELITES.includes(unite.fidelite)) throw new CatalogueInvalide(`${id} : fidélité inconnue « ${unite.fidelite} »`);
  if (!Array.isArray(unite.sources) || unite.sources.length === 0) throw new CatalogueInvalide(`${id} : aucune source`);
}

/** Rendre l'unité `id` fusionnée avec ses ancêtres, en unités d'affichage, validée. Lève CatalogueInvalide sinon. */
export function unite_brute(id, fichiers) {
  const unite = fusionner(id, fichiers, []);
  valider(id, unite);
  return {...unite, id};
}

/**
 * Rendre l'unité `id` en unités SI, avec `surcharges` (clés de fichier, unités d'affichage) appliquées.
 * Lève CatalogueInvalide si une surcharge vise une clé que l'unité ne connaît pas.
 */
export function unite_si(id, fichiers, surcharges = {}) {
  const brute = unite_brute(id, fichiers);
  const inconnues = Object.keys(surcharges).filter((cle) => !(cle in brute));
  if (inconnues.length) throw new CatalogueInvalide(`${id} : surcharges de clés inconnues : ${inconnues.join(", ")}`);
  // Des algorithmes en surcharge ne remplacent que les rôles qu'ils citent, comme chez une unité fille.
  const algos = surcharges.algos ? {algos: {...brute.algos, ...surcharges.algos}} : {};
  const {nom, fidelite, sources, ...valeurs} = convertir_objet({...brute, ...surcharges, ...algos});
  return {id, nom, fidelite, sources, lignee: brute._lignee, ...valeurs};
}

/** Rendre, pour chaque clé de l'unité `id`, l'identifiant de l'ancêtre (ou d'elle-même) qui lui donne sa valeur. */
export function origine_des_cles(id, fichiers) {
  const origines = {};
  for (const ancetre of unite_brute(id, fichiers)._lignee) {
    for (const cle of Object.keys(fichiers[ancetre])) if (!cle.startsWith("_") && cle !== "herite_de") origines[cle] = ancetre;
  }
  return origines;
}

/** Rendre le chemin, relatif à la racine du dépôt, de l'icône `icone` : « prive/x » vit dans prive/icones/, hors du dépôt public. */
export const chemin_icone = (icone) => (icone.startsWith("prive/") ? `prive/icones/${icone.slice("prive/".length)}.svg` : `icones/${icone}.svg`);

/** Rendre le chemin du modèle 3D privé d'une icône `prive/…` : seuls les objets privés ont un modèle détaillé (MODELE § 23). */
export const chemin_modele = (icone) => `prive/modeles/${icone.slice("prive/".length)}.glb`;
