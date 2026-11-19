// Langues (jalon 27) : couverture des dictionnaires, et dictionnaires du client Godot.
//
//   node outils/langues.js            # couverture : clés de chaque langue, manquantes, et identiques à l'anglais
//   node outils/langues.js --godot    # écrit clients/godot/langues/<code>.json (clés godot.*), à refaire après
//                                     # toute modification d'une clé godot.* de langues/<code>.json
import {mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {RACINE} from "../src/moteur/catalogue_node.js";
import {LANGUE_PAR_DEFAUT, LANGUES, t} from "../src/i18n.js";
import {preparer_langue} from "../src/langue_node.js";

const PREFIXE_GODOT = "godot.";
const lire = (code) => JSON.parse(readFileSync(join(RACINE, "langues", `${code}.json`), "utf-8"));

/** Rendre le dictionnaire du client Godot pour `code` : ses clés godot.*, triées, sans le préfixe retiré. */
export const dictionnaire_godot = (code) => Object.fromEntries(Object.entries(lire(code)).filter(([cle]) => cle.startsWith(PREFIXE_GODOT)).sort(([a], [b]) => a.localeCompare(b)));

/** Rendre le texte JSON du dictionnaire Godot de `code`, tel qu'il est écrit dans clients/godot/langues/. */
export const texte_godot = (code) => `${JSON.stringify(dictionnaire_godot(code), null, 2)}\n`;

/** Rendre, pour chaque langue, {langue, cles, manquantes, identiques} au regard de l'anglais. */
export function couverture() {
  const reference = lire(LANGUE_PAR_DEFAUT);
  return Object.keys(LANGUES).map((code) => {
    const dico = lire(code);
    const manquantes = Object.keys(reference).filter((cle) => !(cle in dico));
    const identiques = code === LANGUE_PAR_DEFAUT ? [] : Object.keys(reference).filter((cle) => JSON.stringify(dico[cle]) === JSON.stringify(reference[cle]));
    return {langue: code, cles: Object.keys(dico).length, manquantes, identiques};
  });
}

function principal(argv) {
  if (argv.includes("--godot")) {
    const dossier = join(RACINE, "clients", "godot", "langues");
    mkdirSync(dossier, {recursive: true});
    for (const code of Object.keys(LANGUES)) {
      const chemin = join(dossier, `${code}.json`);
      writeFileSync(`${chemin}.tmp`, texte_godot(code));
      renameSync(`${chemin}.tmp`, chemin);
    }
    console.log(t("cli.langues.godot", {n: Object.keys(dictionnaire_godot(LANGUE_PAR_DEFAUT)).length, dossier: "clients/godot/langues/"}));
    return 0;
  }
  const rapports = couverture();
  for (const r of rapports) console.log(t("cli.langues.couverture", {langue: r.langue, cles: r.cles, manquantes: r.manquantes.length, identiques: r.identiques.length}));
  return rapports.every((r) => !r.manquantes.length) ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = principal(preparer_langue(process.argv.slice(2)));
