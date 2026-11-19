// Valide des fichiers produits à la main ou par un outil externe (unités, moyens de liaison, terrains, algorithmes,
// scénarios), avec les mêmes règles que la suite de conformité. Format décrit dans docs/FORMATS.md.
//
//   node outils/valider.js unites/capteurs/radars/mon_radar.json prive/algos/allocation/mon_algo.js scenarios/x.json
//   node outils/valider.js --json prive/unites/…        # rapport JSON sur la sortie standard, pour un outil
//   node outils/valider.js --langues                     # couverture des traductions du catalogue (langues/catalogue.<code>.json)
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
import {LANGUES} from "../src/i18n.js";
import {preparer_langue} from "../src/langue_node.js";
import {chemin_catalogue, couverture_catalogue} from "../src/catalogue_langue.js";
import {t} from "../src/i18n.js";

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
      defauts.push(t("cli.valider.icone", {chemin: chemin_icone(valeurs.icone)}));
    }
  }
  if (valeurs.pays && !(valeurs.pays in PAYS)) defauts.push(t("cli.valider.pays", {pays: valeurs.pays, codes: Object.keys(PAYS).join(", ")}));
  if (famille.startsWith("liaisons/") && !TYPES_LIAISON.includes(valeurs.type)) defauts.push(t("cli.valider.type_liaison", {type: valeurs.type, types: TYPES_LIAISON.join(", ")}));
  if (famille.startsWith("terrains/") && valeurs.lignes > 0) {
    const octets = Buffer.from(valeurs.altitudes_b64 ?? "", "base64").length;
    if (octets !== valeurs.lignes * valeurs.colonnes * 2) defauts.push(t("cli.valider.terrain", {octets, lignes: valeurs.lignes, colonnes: valeurs.colonnes}));
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
    if (registre[idAlgo].meta.role !== role) defauts.push(t("cli.valider.role", {algo: idAlgo, tenu: registre[idAlgo].meta.role, role}));
    if (!ROLES_D_UNITE.includes(role)) continue;
    for (const parametre of Object.keys(registre[idAlgo].meta.parametres)) {
      if (!(parametre in valeurs) && parametre !== "sites" && parametre !== "sites_unites") defauts.push(t("cli.valider.lit", {algo: idAlgo, parametre}));
    }
  }
  return [...defauts, ...defauts_famille(id, valeurs)];
}

async function valider_algorithme(id) {
  const source = readFileSync(resolve(RACINE, chemin_algo(id)), "utf-8");
  const defauts = INTERDITS.filter((motif) => motif.test(source)).map((motif) => t("cli.valider.interdit", {motif}));
  const registre = await charger_algos([id], importer_module);
  const dossier = id.replace(/^prive\//, "").split("/");
  const role = registre[id].meta.role;
  if (dossier[0] === "global" && dossier[1] !== role) defauts.push(t("cli.valider.range", {dossier: dossier[1], role}));
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
    else defauts = [t("cli.valider.non_reconnu")];
  } catch (erreur) {
    defauts = [erreur.message];
  }
  return {fichier, genre, id: id ?? null, valide: defauts.length === 0, defauts};
}

const lire_racine = (chemin) => JSON.parse(readFileSync(resolve(RACINE, chemin), "utf-8"));
const longueur = (x) => (Array.isArray(x) ? x.length : null);

/**
 * Rendre, pour chaque langue qui a un dictionnaire de catalogue, {langue, fichier, manquants, defauts} : entrées
 * absentes (le texte français s'affiche alors) et entrées fautives (identifiant inconnu, clés d'aide, nombre de sources,
 * d'équations, d'hypothèses ou de références, paramètres différents de ceux du fichier traduit).
 */
export async function couverture_langues() {
  const unites = Object.fromEntries(lire_racine("unites/index.json").map((u) => [u.id, lire_racine(`unites/${u.id}.json`)]));
  const indexAlgos = lire_racine("algos/index.json");
  const metas = Object.fromEntries(await Promise.all(indexAlgos.map(async (a) => [a.id, (await importer_module(chemin_algo(a.id))).meta])));
  const attendus = {
    unites: Object.keys(unites).filter((id) => "nom" in unites[id] || "sources" in unites[id] || "_aide" in unites[id]),
    algos: Object.keys(metas),
    scenarios: lire_racine("scenarios/index.json").map((s) => s.id),
    cartes: lire_racine("cartes/index.json").map((c) => c.id),
  };
  const rapports = [];
  for (const code of Object.keys(LANGUES)) {
    const fichier = chemin_catalogue(code);
    if (!fichier) continue;
    const contenu = lire_racine(fichier);
    const couverture = couverture_catalogue(contenu, attendus);
    const defauts = Object.entries(couverture).flatMap(([genre, c]) => c.inconnus.map((id) => t("cli.valider.inexistant", {genre, id})));
    for (const [id, x] of Object.entries(contenu.unites ?? {})) {
      const brut = unites[id];
      if (!brut) continue;
      if ("nom" in x !== "nom" in brut) defauts.push(t("cli.valider.nom_traduit", {id}));
      if (longueur(x.sources) !== longueur(brut.sources)) defauts.push(t("cli.valider.sources", {id, n: longueur(x.sources), attendu: longueur(brut.sources)}));
      const cles = (o) => Object.keys(o ?? {}).sort().join(", ");
      if (cles(x.aide) !== cles(brut._aide)) defauts.push(t("cli.valider.aides", {id, cles: cles(x.aide), attendu: cles(brut._aide)}));
    }
    for (const [id, x] of Object.entries(contenu.algos ?? {})) {
      const meta = metas[id];
      if (!meta) continue;
      for (const champ of ["equations", "hypotheses", "references"]) {
        if (champ in x && longueur(x[champ]) !== longueur(meta[champ])) defauts.push(t("cli.valider.champ", {id, n: longueur(x[champ]), champ, attendu: longueur(meta[champ])}));
      }
      const inconnus = Object.keys(x.parametres ?? {}).filter((cle) => !(cle in meta.parametres));
      if (inconnus.length) defauts.push(t("cli.valider.parametres", {id, liste: inconnus.join(", ")}));
    }
    const manquants = Object.entries(couverture).flatMap(([genre, c]) => c.manquants.map((id) => `${genre} ${id}`));
    rapports.push({langue: code, fichier, manquants, defauts});
  }
  return rapports;
}

async function principal(args) {
  const json = args.includes("--json");
  if (args.includes("--langues")) {
    const rapports = await couverture_langues();
    if (json) console.log(JSON.stringify(rapports, null, 2));
    else for (const r of rapports) console.log(`${(r.defauts.length ? t("cli.valider.refuse") : t("cli.valider.ok")).padEnd(7)} ${t("cli.valider.couverture", {fichier: r.fichier, manquants: r.manquants.length, defauts: r.defauts.length})}${[...r.manquants.map((m) => `\n        ${t("cli.valider.manque", {entree: m})}`), ...r.defauts.map((d) => `\n        - ${d}`)].join("")}`);
    return rapports.every((r) => !r.defauts.length) ? 0 : 1;
  }
  const chemins = args.filter((a) => a !== "--json");
  if (!chemins.length) {
    console.error(t("cli.valider.usage"));
    return 2;
  }
  const rapports = [];
  for (const chemin of chemins) rapports.push(await valider_fichier(chemin));
  if (json) console.log(JSON.stringify(rapports, null, 2));
  else for (const r of rapports) console.log(r.valide ? `${t("cli.valider.ok").padEnd(7)} ${r.fichier}` : `${t("cli.valider.refuse").padEnd(7)} ${r.fichier}\n${r.defauts.map((d) => `        - ${d}`).join("\n")}`);
  return rapports.every((r) => r.valide) ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await principal(preparer_langue(process.argv.slice(2)));
