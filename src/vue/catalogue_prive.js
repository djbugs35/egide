// Catalogue privé (prive/unites/, hors git) dans l'interface : l'index prive/unites/index.json, régénéré par
import {t} from "../i18n.js";
// `node outils/indexer.js`, s'ajoute au catalogue public ou le remplace, selon le mode choisi dans la page Catalogue.
// Le choix vit dans le navigateur (localStorage) ; sans index privé, l'interface reste sur le catalogue public.

export const MODES_PRIVE = ["public", "fusion", "remplacement"];
const CLE_MODE = "egide.catalogue_prive";

/** Rendre l'identifiant sans son préfixe « prive/ » : ce qui range une unité dans une famille de la palette. */
export const sans_prive = (id) => id.replace(/^prive\//, "");

/** Rendre le dossier d'une unité, préfixe privé ôté (« vecteurs/avions » pour prive/vecteurs/avions/mon_avion). */
const dossier = (id) => sans_prive(id).split("/").slice(0, -1).join("/");

/**
 * Rendre l'index que voit l'interface : `public` seul, public puis privé (`fusion`), ou privé à la place du public
 * (`remplacement`) dans chaque dossier où le privé a au moins une unité ; les dossiers qu'il ne couvre pas (terrains,
 * roquettes…) et les classes de base `_` publiques, parentes des unités privées, restent.
 */
export function index_selon_mode(publique, privee, mode) {
  if (mode === "fusion") return [...publique, ...privee];
  if (mode !== "remplacement") return publique;
  const couverts = new Set(privee.filter((u) => !u.base).map((u) => dossier(u.id)));
  return [...publique.filter((u) => u.base || !couverts.has(dossier(u.id))), ...privee];
}

/** Rendre le mode retenu dans ce navigateur, « public » si rien n'est retenu ou si le stockage est indisponible. */
export function lire_mode() {
  try {
    const mode = localStorage.getItem(CLE_MODE);
    return MODES_PRIVE.includes(mode) ? mode : "public";
  } catch {
    return "public";
  }
}

/** Retenir le mode dans ce navigateur ; rendre faux si le stockage est indisponible (navigation privée…). */
export function ecrire_mode(mode) {
  try {
    localStorage.setItem(CLE_MODE, mode);
    return true;
  } catch {
    return false;
  }
}

/**
 * Rendre {index, privees, erreur} : l'index du catalogue vu par l'interface selon `mode`, le nombre d'unités
 * privées importées, et la raison pour laquelle l'index privé n'a pu être lu (null sinon). `lire_json(chemin)` lève
 * si le fichier manque.
 */
export async function charger_index(lire_json, mode = lire_mode()) {
  const publique = await lire_json("unites/index.json");
  if (mode === "public") return {index: publique, privees: 0, erreur: null};
  try {
    const privee = await lire_json("prive/unites/index.json");
    return {index: index_selon_mode(publique, privee, mode), privees: privee.filter((u) => !u.base).length, erreur: null};
  } catch (erreur) {
    return {index: publique, privees: 0, erreur: t("vue.catalogue.index_prive_illisible", {erreur: erreur.message})};
  }
}
