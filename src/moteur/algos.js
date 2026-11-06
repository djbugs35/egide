// Registre d'algorithmes : un module ES par algorithme sous algos/ (public) ou prive/algos/ (hors git), rangé par
// rôle. Chaque module exporte `meta` (sa fiche) et les fonctions de son rôle (MODELE § 10).

/** Fonctions exigées par rôle. Les huit premiers rôles sont branchés sur le moteur ; les autres sont des bibliothèques. */
export const ROLES = {
  comportement: ["planifier_drone"],
  reaction: ["reagir", "esquive"],
  mouvement: ["avancer"],
  detection: ["preparer", "detecte"],
  pistage: ["pister"],
  allocation: ["allouer"],
  tir: ["planifier_tir"],
  tir_sol: ["cadence"],
  guidage: ["acceleration"],
  filtrage: ["initialiser", "mettre_a_jour"],
  performance_radar: ["probabilite_detection"],
};
export const ROLES_BRANCHES = ["comportement", "reaction", "mouvement", "detection", "pistage", "allocation", "tir", "tir_sol"];
// Rôles dont l'algorithme est porté par une unité, et donc tenu de trouver ses paramètres dans l'unité.
export const ROLES_D_UNITE = ["mouvement", "detection", "tir", "tir_sol"];
// Ce qu'un algorithme n'a pas le droit d'écrire : il reçoit tout en argument et ne dépend que de ses entrées.
export const INTERDITS = [/^\s*import\s/m, /\brequire\(/, /Math\.random/, /Date\.now|new Date\b/, /\bfetch\(/, /\bperformance\./];
const FIDELITES = ["notionnel", "cinematique", "point_masse", "6ddl"];
const CHAMPS_TEXTE = ["nom", "description", "domaine_validite"];
const CHAMPS_LISTE = ["equations", "hypotheses", "references"];

export class AlgoInvalide extends Error {}

/** Rendre le chemin (relatif à la racine du dépôt) du module d'un algorithme : « prive/… » vise le catalogue privé. */
export const chemin_algo = (id) => (id.startsWith("prive/") ? `prive/algos/${id.slice(6)}.js` : `algos/${id}.js`);

/** Vérifier la fiche et les exports d'un module d'algorithme. Lève AlgoInvalide en nommant le défaut. */
export function valider_algo(id, module) {
  const {meta} = module;
  if (!meta) throw new AlgoInvalide(`${id} : pas d'export « meta »`);
  if (!(meta.role in ROLES)) throw new AlgoInvalide(`${id} : rôle inconnu « ${meta.role} » (${Object.keys(ROLES).join(", ")})`);
  if (!FIDELITES.includes(meta.fidelite)) throw new AlgoInvalide(`${id} : fidélité inconnue « ${meta.fidelite} »`);
  for (const champ of CHAMPS_TEXTE) if (typeof meta[champ] !== "string" || !meta[champ]) throw new AlgoInvalide(`${id} : meta.${champ} manquant`);
  for (const champ of CHAMPS_LISTE) if (!Array.isArray(meta[champ])) throw new AlgoInvalide(`${id} : meta.${champ} doit être une liste`);
  if (meta.references.length === 0) throw new AlgoInvalide(`${id} : au moins une référence`);
  if (typeof meta.parametres !== "object") throw new AlgoInvalide(`${id} : meta.parametres manquant`);
  for (const fonction of ROLES[meta.role]) {
    if (typeof module[fonction] !== "function") throw new AlgoInvalide(`${id} : le rôle ${meta.role} exige la fonction ${fonction}()`);
  }
}

/** Rendre {id: module} des algorithmes `ids`, validés. `importer(chemin)` charge un module (import dynamique). */
export async function charger_algos(ids, importer) {
  const registre = {};
  for (const id of new Set(ids)) {
    let module;
    try {
      module = await importer(chemin_algo(id));
    } catch (erreur) {
      throw new AlgoInvalide(`algorithme introuvable : ${id} (${chemin_algo(id)}) — ${erreur.message}`);
    }
    valider_algo(id, module);
    registre[id] = module;
  }
  return registre;
}

/** Rendre le module `id` du registre, en vérifiant qu'il tient le rôle attendu. */
export function algo(registre, id, role) {
  const module = registre[id];
  if (!module) throw new AlgoInvalide(`algorithme non chargé : ${id}`);
  if (module.meta.role !== role) throw new AlgoInvalide(`${id} tient le rôle ${module.meta.role}, pas ${role}`);
  return module;
}

/** Rendre les identifiants des algorithmes qu'un scénario résolu fait tourner. */
export function ids_algos(scenario) {
  // Un brouilleur n'a pas d'algorithme de tir : on écarte les rôles vides.
  return [...new Set([
    scenario.rouge.comportement,
    scenario.rouge.reaction,
    scenario.rouge.algos.mouvement,
    ...scenario.avions.flatMap((groupe) => [groupe.algos.mouvement, groupe.arme.algos.tir]),
    scenario.sol.algos.tir_sol,
    ...(scenario.sol.batteries ?? []).map((b) => b.unite.algos.tir_sol),
    ...scenario.reseau.centres.map((c) => c.allocation),
    scenario.radar.algos.detection,
    scenario.conduite.pistage,
    scenario.conduite.allocation,
  ].filter(Boolean))];
}
