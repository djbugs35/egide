// Valide des fichiers produits à la main ou par un outil externe (unités, moyens de liaison, terrains, algorithmes,
// scénarios), avec les mêmes règles que la suite de conformité. Format décrit dans docs/FORMATS.md.
//
//   node outils/valider.js unites/capteurs/radars/mon_radar.json prive/algos/allocation/mon_algo.js scenarios/x.json
//   node outils/valider.js --json prive/unites/…        # rapport JSON sur la sortie standard, pour un outil
//
// Code de sortie 0 si tout est valide, 1 sinon. Les fichiers doivent être rangés à leur place dans le dépôt :
// leur chemin donne leur identifiant (unites/<id>.json, prive/unites/<id>.json, algos/<id>.js, prive/algos/<id>.js).
import {readFileSync} from "node:fs";
import {relative, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {charger_algos, chemin_algo, ids_algos, INTERDITS, ROLES_D_UNITE} from "../src/moteur/algos.js";
import {charger_unites, chemin_icone, unite_brute, unite_si} from "../src/moteur/catalogue.js";
import {importer_module, lire_fichier, RACINE} from "../src/moteur/catalogue_node.js";
import {ids_unites, resoudre_scenario} from "../src/moteur/scenario.js";
import {PAYS} from "../src/vue/pays.js";

const TYPES_LIAISON = ["filaire", "radio", "satellite", "optique"];

/** Rendre {genre, id} d'un fichier d'après son chemin relatif au dépôt, ou {genre: "scenario"} pour un JSON de format 2. */
export function reconnaitre(chemin) {
  const rel = chemin.replace(/\\/g, "/");
  let m = /^(prive\/)?unites\/(.+)\.json$/.exec(rel);
  if (m) return {genre: "unite", id: `${m[1] ? "prive/" : ""}${m[2]}`};
  m = /^(prive\/)?algos\/(.+)\.js$/.exec(rel);
  if (m) return {genre: "algo", id: `${m[1] ? "prive/" : ""}${m[2]}`};
  if (rel.endsWith(".json")) return {genre: "scenario"};
  return {genre: "inconnu"};
}

/** Rendre la liste des défauts propres à une famille d'unités (moyens de liaison, terrains, icône, pays). */
function defauts_famille(id, valeurs) {
  const defauts = [];
  const famille = id.replace(/^prive\//, "");
  if (valeurs.icone) {
    try {
      readFileSync(resolve(RACINE, chemin_icone(valeurs.icone)));
    } catch {
      defauts.push(`icône absente : ${chemin_icone(valeurs.icone)}`);
    }
  }
  if (valeurs.pays && !(valeurs.pays in PAYS)) defauts.push(`pays inconnu « ${valeurs.pays} » (codes connus : ${Object.keys(PAYS).join(", ")})`);
  if (famille.startsWith("liaisons/") && !TYPES_LIAISON.includes(valeurs.type)) defauts.push(`liaison : type « ${valeurs.type} » inconnu (${TYPES_LIAISON.join(", ")})`);
  if (famille.startsWith("terrains/") && valeurs.lignes > 0) {
    const octets = Buffer.from(valeurs.altitudes_b64 ?? "", "base64").length;
    if (octets !== valeurs.lignes * valeurs.colonnes * 2) defauts.push(`terrain : ${octets} octets d'altitudes pour ${valeurs.lignes} × ${valeurs.colonnes} × 2 attendus`);
  }
  return defauts;
}

async function valider_unite(id) {
  const fichiers = await charger_unites([id], lire_fichier);
  const brute = unite_brute(id, fichiers);
  if (id.split("/").at(-1).startsWith("_")) return [];
  const valeurs = unite_si(id, fichiers);
  const registre = await charger_algos(Object.values(brute.algos ?? {}), importer_module);
  const defauts = [];
  for (const [role, idAlgo] of Object.entries(brute.algos ?? {})) {
    if (registre[idAlgo].meta.role !== role) defauts.push(`${idAlgo} tient le rôle ${registre[idAlgo].meta.role}, pas ${role}`);
    if (!ROLES_D_UNITE.includes(role)) continue;
    for (const parametre of Object.keys(registre[idAlgo].meta.parametres)) {
      if (!(parametre in valeurs) && parametre !== "sites" && parametre !== "sites_unites") defauts.push(`${idAlgo} lit « ${parametre} », absent de l'unité`);
    }
  }
  return [...defauts, ...defauts_famille(id, valeurs)];
}

async function valider_algorithme(id) {
  const source = readFileSync(resolve(RACINE, chemin_algo(id)), "utf-8");
  const defauts = INTERDITS.filter((motif) => motif.test(source)).map((motif) => `interdit dans un algorithme : ${motif}`);
  const registre = await charger_algos([id], importer_module);
  const dossier = id.replace(/^prive\//, "").split("/");
  const role = registre[id].meta.role;
  if (dossier[0] === "global" && dossier[1] !== role) defauts.push(`rangé sous ${dossier[1]}/ mais tient le rôle ${role} : algos/global/${role}/`);
  return defauts;
}

async function valider_scenario(chemin) {
  const brut = JSON.parse(readFileSync(chemin, "utf-8"));
  const fichiers = await charger_unites(ids_unites(brut), lire_fichier);
  const scenario = resoudre_scenario(brut, fichiers);
  await charger_algos(ids_algos(scenario), importer_module);
  return [];
}

/** Rendre {fichier, genre, id, valide, defauts} pour un fichier ; une exception de validation devient un défaut. */
export async function valider_fichier(chemin) {
  const fichier = relative(RACINE, resolve(chemin)).replace(/\\/g, "/");
  const {genre, id} = reconnaitre(fichier);
  let defauts;
  try {
    if (genre === "unite") defauts = await valider_unite(id);
    else if (genre === "algo") defauts = await valider_algorithme(id);
    else if (genre === "scenario") defauts = await valider_scenario(resolve(chemin));
    else defauts = ["fichier non reconnu : unites/…json, prive/unites/…json, algos/…js, prive/algos/…js ou scénario .json"];
  } catch (erreur) {
    defauts = [erreur.message];
  }
  return {fichier, genre, id: id ?? null, valide: defauts.length === 0, defauts};
}

async function principal(args) {
  const json = args.includes("--json");
  const chemins = args.filter((a) => a !== "--json");
  if (!chemins.length) {
    console.error("usage : node outils/valider.js [--json] fichier…  (voir docs/FORMATS.md)");
    return 2;
  }
  const rapports = [];
  for (const chemin of chemins) rapports.push(await valider_fichier(chemin));
  if (json) console.log(JSON.stringify(rapports, null, 2));
  else for (const r of rapports) console.log(r.valide ? `OK      ${r.fichier}` : `REFUSÉ  ${r.fichier}\n${r.defauts.map((d) => `        - ${d}`).join("\n")}`);
  return rapports.every((r) => r.valide) ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await principal(process.argv.slice(2));
