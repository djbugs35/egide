// Traduction du catalogue public (unités, algorithmes, scénarios, sources de carte) : langues/catalogue.<code>.json, à côté des fichiers,
// qui restent en français et sans modification — leur empreinte de reproductibilité ne dépend donc pas de la langue.
// Le français est la langue source : sans traduction, on montre le texte du fichier. Pur, testé sous Node.

const VIDE = {unites: {}, algos: {}, scenarios: {}, cartes: {}};
let dico = VIDE;

/** Installer le dictionnaire du catalogue de la langue courante ; null : langue source (français). */
export function installer_catalogue(contenu) {
  dico = contenu ? {...VIDE, ...contenu} : VIDE;
}

/** Rendre le chemin du dictionnaire du catalogue de `code`, ou null pour la langue source. */
export const chemin_catalogue = (code) => (code === "fr" ? null : `langues/catalogue.${code}.json`);

/** Rendre le nom affiché de l'unité `id` ; `repli` : son nom dans le fichier. */
export const nom_unite = (id, repli) => dico.unites[id]?.nom ?? repli ?? id;

/** Rendre les sources affichées de l'unité `id`. */
export const sources_unite = (id, repli) => dico.unites[id]?.sources ?? repli;

/**
 * Rendre la phrase d'aide de la clé `cle` de l'unité `id` : celle de l'ancêtre le plus proche qui documente la clé
 * (`_lignee` de l'unité, `fichiers` bruts), traduite s'il y a lieu ; sinon `repli`.
 */
export function aide_unite(lignee, fichiers, cle, repli) {
  for (const ancetre of [...lignee].reverse()) {
    if (fichiers[ancetre]?._aide && cle in fichiers[ancetre]._aide) return dico.unites[ancetre]?.aide?.[cle] ?? repli;
  }
  return repli;
}

/** Rendre le nom affiché de l'algorithme `id`. */
export const nom_algo = (id, repli) => dico.algos[id]?.nom ?? repli ?? id;

/** Rendre une copie traduite de la fiche `meta` de l'algorithme `id` (la fiche d'origine, empreinte comprise, ne change pas). */
export function meta_traduite(id, meta) {
  const x = dico.algos[id];
  if (!x || !meta) return meta;
  const {parametres = {}, ...textes} = x;
  return {...meta, ...textes, parametres: Object.fromEntries(Object.entries(meta.parametres ?? {}).map(([cle, p]) => [cle, parametres[cle] ? {...p, aide: parametres[cle]} : p]))};
}

/** Rendre le nom affiché du scénario `id` du dépôt. */
export const nom_scenario = (id, repli) => dico.scenarios[id]?.nom ?? repli ?? id;

const nom_carte = (id, repli) => dico.cartes[id]?.nom ?? repli ?? id;

/**
 * Traduire ce qu'on lit à `chemin` pour l'afficher : noms des index (unites/, algos/, scenarios/, cartes/index.json)
 * et textes d'une source de carte (cartes/<id>.json, qui n'entre dans aucune empreinte) ; tout autre fichier passe tel quel.
 */
export function traduire_index(chemin, contenu) {
  const nom = {"unites/index.json": nom_unite, "algos/index.json": nom_algo, "scenarios/index.json": nom_scenario, "cartes/index.json": nom_carte}[chemin];
  if (nom && Array.isArray(contenu)) return contenu.map((e) => ({...e, nom: nom(e.id, e.nom)}));
  const carte = /^cartes\/(.+)\.json$/.exec(chemin)?.[1];
  return carte && dico.cartes[carte] && contenu && typeof contenu === "object" ? {...contenu, ...dico.cartes[carte]} : contenu;
}

/** Ôter d'un nom la mention finale « (notionnel) », « (FRA, notionnel) » ou leur traduction. */
export const sans_mention = (nom) => nom.replace(/ \((?:[A-Z]{3}, )?(?:notionnel(?:le)?|notional)\)$/, "");

/** Rendre les identifiants traduits et ceux qui manquent, pour la couverture d'un dictionnaire de catalogue. */
export function couverture_catalogue(contenu, attendus) {
  const manque = (genre) => attendus[genre].filter((id) => !contenu?.[genre]?.[id]);
  const inconnus = (genre) => Object.keys(contenu?.[genre] ?? {}).filter((id) => !attendus[genre].includes(id));
  return Object.fromEntries(["unites", "algos", "scenarios", "cartes"].map((g) => [g, {manquants: manque(g), inconnus: inconnus(g)}]));
}
