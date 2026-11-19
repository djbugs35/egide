// Régénère unites/index.json, algos/index.json et cartes/index.json, lus par l'interface (palette, explorateur) qui ne peut pas lister
// un dossier. `node outils/indexer.js` ; tests/conformite.test.js échoue si un index est périmé.
import {schemas} from "./schemas.js";
import {preparer_langue} from "../src/langue_node.js";
import {readdirSync, readFileSync, renameSync, writeFileSync, mkdirSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {charger_algos} from "../src/moteur/algos.js";
import {chemin_unite, unite_brute} from "../src/moteur/catalogue.js";
import {RACINE, ids_algos_disque, ids_unites_disque, importer_module} from "../src/moteur/catalogue_node.js";
import {t} from "../src/i18n.js";

/** Rendre les entrées d'index des unités `ids` ; la famille se lit sans le préfixe « prive/ ». */
function entrees_index(ids) {
  // Tout le disque : une unité privée hérite volontiers d'une unité publique.
  const fichiers = Object.fromEntries(ids_unites_disque().map((id) => [id, JSON.parse(readFileSync(join(RACINE, chemin_unite(id)), "utf-8"))]));
  return ids.map((id) => {
    const unite = unite_brute(id, fichiers);
    return {id, nom: unite.nom, famille: id.replace(/^prive\//, "").split("/")[0], fidelite: unite.fidelite, base: id.split("/").at(-1).startsWith("_"), pays: unite.pays ?? null, icone: unite.icone ?? null};
  });
}

/** Rendre le contenu de l'index des unités publiques : identifiant, nom, famille, fidélité, unité instanciable. */
export const index_unites = () => entrees_index(ids_unites_disque().filter((id) => !id.startsWith("prive/")));

/** Rendre l'index des unités privées (prive/unites/, hors git), même format ; vide sans catalogue privé. */
export const index_unites_prive = () => entrees_index(ids_unites_disque().filter((id) => id.startsWith("prive/")));

/** Rendre le contenu de l'index des algorithmes publics : identifiant, nom, rôle, fidélité. */
export async function index_algos() {
  const ids = ids_algos_disque().filter((id) => !id.startsWith("prive/"));
  const registre = await charger_algos(ids, importer_module);
  return ids.map((id) => ({id, nom: registre[id].meta.nom, role: registre[id].meta.role, fidelite: registre[id].meta.fidelite}));
}

/** Rendre le contenu de l'index des sources de carte : identifiant (« fonds/osm »), nom, type, attribution. */
export function index_cartes() {
  const dossier = join(RACINE, "cartes");
  return readdirSync(dossier, {recursive: true})
    // Les frontières (cartes/frontieres/) sont des données d'auto-configuration, pas une source de carte.
    .filter((f) => f.endsWith(".json") && !f.startsWith("_") && f !== "index.json" && !f.startsWith("frontieres"))
    .map((f) => f.replace(/\\/g, "/").replace(/\.json$/, ""))
    .sort()
    .map((id) => {
      const source = JSON.parse(readFileSync(join(dossier, `${id}.json`), "utf-8"));
      return {id, nom: source.nom, type: source.type, attribution: source.attribution};
    });
}

/** Rendre l'index de la bibliothèque de scénarios (scenarios/*.json) : identifiant, nom, zone éventuelle. */
export function index_scenarios() {
  const dossier = join(RACINE, "scenarios");
  return readdirSync(dossier).filter((f) => f.endsWith(".json") && f !== "index.json").sort().map((f) => {
    const s = JSON.parse(readFileSync(join(dossier, f), "utf-8"));
    return {id: f.replace(/\.json$/, ""), nom: s.nom};
  });
}

function ecrire(chemin, contenu) {
  // Écriture atomique : un index à moitié écrit ne remplace jamais le précédent.
  writeFileSync(`${chemin}.tmp`, `${JSON.stringify(contenu, null, 2)}\n`);
  renameSync(`${chemin}.tmp`, chemin);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  preparer_langue(process.argv.slice(2));
  ecrire(join(RACINE, "unites", "index.json"), index_unites());
  ecrire(join(RACINE, "algos", "index.json"), await index_algos());
  ecrire(join(RACINE, "cartes", "index.json"), index_cartes());
  ecrire(join(RACINE, "scenarios", "index.json"), index_scenarios());
  mkdirSync(join(RACINE, "schemas"), {recursive: true});
  for (const [nom, schema] of Object.entries(schemas())) ecrire(join(RACINE, "schemas", nom), schema);
  const prive = index_unites_prive();
  // Hors git comme le reste de prive/ : la page Catalogue le lit pour importer le catalogue privé.
  if (prive.length) ecrire(join(RACINE, "prive", "unites", "index.json"), prive);
  console.log(t("cli.indexer.fait", {prive: prive.length ? `, prive/unites/index.json (${prive.length})` : ""}));
}
