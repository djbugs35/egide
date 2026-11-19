// Vérifie qu'Égide est prêt à tourner sur ce poste, et dit quoi faire sinon. Lancé par installer.command et installer.bat.
//
//   node outils/verifier_installation.js              # rapport lisible
//   node outils/verifier_installation.js --json       # rapport JSON sur la sortie standard, pour un outil
//   node outils/verifier_installation.js --complet    # lance aussi npm test et pytest (quelques minutes)
//
// Code de sortie 0 si tout ce qui est requis fonctionne, 1 sinon. Variable EGIDE_GODOT : chemin d'un Godot non standard.
import {spawnSync} from "node:child_process";
import {existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {createServer} from "node:net";
import {homedir, tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {gzipSync} from "node:zlib";
import {charger_tous_algos, charger_unites_scenario, lire_fichier, RACINE} from "../src/moteur/catalogue_node.js";
import {bilan, simuler} from "../src/moteur/monde.js";
import {creer_rejeu, texte_rejeu} from "../src/moteur/rejeu.js";
import {modifier_scenario, resoudre_scenario} from "../src/moteur/scenario.js";
import {preparer_langue} from "../src/langue_node.js";
import {t} from "../src/i18n.js";

// Node 22 : `node --test --test-skip-pattern` de npm test n'existe pas avant.
export const VERSIONS_MINIMALES = {node: [22, 0], python: [3, 12], godot: [4, 4]};
const FICHIERS_TIERS = ["vendor/cesium/index.js", "vendor/cesium/Workers", "vendor/cesium/Assets", "vendor/maplibre-gl/maplibre-gl.mjs", "vendor/maplibre-gl/maplibre-gl-worker.mjs", "vendor/maplibre-gl/maplibre-gl.css"];
const PORT_SITE = 8766;
const DELAI_COMMANDE_MS = 30_000;
const DELAI_GODOT_MS = 120_000;
const DELAI_TESTS_MS = 600_000;
const RAID_ESSAI = {"rouge.nombre": 30, "bleu.sol.nombre": 10, "bleu.sol.munitions": 50};
const reinstaller = () => t("cli.verif.reinstaller");

/** Rendre [majeur, mineur, correctif] de la première version trouvée dans `texte`, ou null. */
export function extraire_version(texte) {
  const trouve = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(texte ?? "");
  return trouve ? [Number(trouve[1]), Number(trouve[2]), Number(trouve[3] ?? 0)] : null;
}

/** Rendre vrai si `version` atteint `minimum` ([majeur, mineur]). */
export const version_suffisante = ([majeur, mineur], [minMajeur, minMineur]) => majeur > minMajeur || (majeur === minMajeur && mineur >= minMineur);

/** Rendre le chemin du Python de l'environnement du projet, selon la plateforme. */
export const chemin_python = (racine, plateforme = process.platform) => (plateforme === "win32" ? join(racine, ".venv", "Scripts", "python.exe") : join(racine, ".venv", "bin", "python"));

/** Rendre les commandes à essayer pour Godot, de la plus explicite à la plus générale. */
export function candidats_godot(env = process.env, plateforme = process.platform, maison = homedir()) {
  return [
    env.EGIDE_GODOT, "godot", "godot4",
    plateforme === "darwin" ? "/Applications/Godot.app/Contents/MacOS/Godot" : null,
    plateforme === "win32" ? join(env.LOCALAPPDATA ?? join(maison, "AppData", "Local"), "Microsoft", "WinGet", "Links", "godot.exe") : null,
  ].filter(Boolean);
}

/** Rendre {commande, version} du premier candidat que `sonder(commande)` reconnaît (texte de version, ou null), sinon null. */
export function trouver_godot(candidats, sonder) {
  for (const commande of candidats) {
    const version = extraire_version(sonder(commande));
    if (version) return {commande, version};
  }
  return null;
}

/** Rendre {pret, echecs, avertissements} : seul un contrôle en échec empêche Égide de tourner. */
export function resumer(resultats) {
  const compter = (statut) => resultats.filter((r) => r.statut === statut).length;
  return {pret: compter("echec") === 0, echecs: compter("echec"), avertissements: compter("avertissement")};
}

const MARQUES = {ok: "cli.verif.m_ok", echec: "cli.verif.m_echec", avertissement: "cli.verif.m_avertissement", info: "cli.verif.m_info"};
/** Rendre la marque d'un statut, centrée sur six caractères. */
const marque = (statut) => {
  const texte = t(MARQUES[statut]);
  const avant = Math.max(0, Math.floor((6 - texte.length) / 2));
  return `${" ".repeat(avant)}${texte}`.padEnd(6);
};

/** Rendre le rapport lisible : une ligne par contrôle, et le remède sous ceux qui en ont besoin. */
export function texte_rapport(resultats) {
  const lignes = resultats.flatMap((r) => [t("cli.verif.ligne", {marque: marque(r.statut), libelle: r.libelle, detail: r.detail}), ...(r.remede && r.statut !== "ok" ? [`         → ${r.remede}`] : [])]);
  const {pret, echecs, avertissements} = resumer(resultats);
  const fin = pret ? (avertissements ? t("cli.verif.pret_avertissements", {n: avertissements}) : t("cli.verif.pret")) : t("cli.verif.pas_pret", {n: echecs});
  return [...lignes, "", fin].join("\n");
}

/** Lancer une commande sans shell ; rendre {reussi, sortie (stdout et stderr)}. */
function lancer(commande, arguments_, delai = DELAI_COMMANDE_MS, cwd = RACINE) {
  // Sous Windows, npm est un script .cmd : seul un shell sait le lancer.
  const r = spawnSync(commande, arguments_, {cwd, encoding: "utf-8", timeout: delai, shell: process.platform === "win32" && commande === "npm"});
  return {reussi: r.status === 0, sortie: `${r.stdout ?? ""}${r.stderr ?? ""}`};
}

const resultat = (libelle, statut, detail, remede = null) => ({libelle, statut, detail, remede});

function controler_node() {
  const version = extraire_version(process.versions.node);
  const assez = version_suffisante(version, VERSIONS_MINIMALES.node);
  return resultat("Node.js", assez ? "ok" : "echec", process.versions.node, t("cli.verif.version_requise", {version: VERSIONS_MINIMALES.node.join("."), remede: reinstaller()}));
}

function controler_python() {
  const python = chemin_python(RACINE);
  const remede = t("cli.verif.python_refaire", {remede: reinstaller()});
  const libelle = t("cli.verif.python");
  const lu = lancer(python, ["--version"]);
  const version = extraire_version(lu.sortie);
  if (!lu.reussi || !version) return [resultat(libelle, "echec", t("cli.verif.venv_absent"), remede)];
  if (!version_suffisante(version, VERSIONS_MINIMALES.python)) return [resultat(libelle, "echec", version.join("."), remede)];
  const bibliotheques = lancer(python, ["-c", "import matplotlib, numpy, pytest, ruff"]);
  return [
    resultat(libelle, "ok", version.join(".")),
    resultat(t("cli.verif.bibliotheques_python"), bibliotheques.reussi ? "ok" : "echec", bibliotheques.reussi ? "matplotlib, numpy, pytest, ruff" : bibliotheques.sortie.trim().split("\n").at(-1), remede),
  ];
}

function controler_fichiers_tiers() {
  const manquants = FICHIERS_TIERS.filter((f) => !existsSync(join(RACINE, f)));
  return resultat(t("cli.verif.cartes"), manquants.length ? "echec" : "ok", manquants.length ? t("cli.verif.manquent", {liste: manquants.join(", ")}) : t("cli.verif.cartes_ok"), t("cli.verif.cartes_remede"));
}

async function controler_simulation() {
  try {
    const brut = modifier_scenario(await lire_fichier("scenarios/reference.json"), RAID_ESSAI);
    const [fichiers, registre] = [await charger_unites_scenario(brut), await charger_tous_algos()];
    const {duree} = bilan(simuler(resoudre_scenario(brut, fichiers), {registre, journal: false}));
    return {ligne: resultat(t("cli.verif.simulation"), "ok", t("cli.verif.simulation_ok", {duree})), brut, fichiers, registre};
  } catch (erreur) {
    return {ligne: resultat(t("cli.verif.simulation"), "echec", erreur.message, t("cli.verif.simulation_remede"))};
  }
}

function controler_catalogue_prive() {
  const dossier = join(RACINE, "prive", "unites");
  if (!existsSync(dossier)) return resultat(t("cli.verif.prive"), "info", t("cli.verif.prive_absent"));
  const nombre = readdirSync(dossier, {recursive: true}).filter((f) => String(f).endsWith(".json") && !String(f).endsWith("index.json")).length;
  const indexe = existsSync(join(dossier, "index.json"));
  return resultat(t("cli.verif.prive"), indexe ? "ok" : "avertissement", t(indexe ? "cli.verif.prive_indexe" : "cli.verif.prive_sans_index", {n: nombre}), "node outils/indexer.js");
}

const remede_godot = () => t("cli.verif.godot_remede", {remede: reinstaller()});

/** Faire relire à Godot un petit rejeu : c'est le seul essai qui prouve que le client compile et lit le format. */
async function controler_client_godot(godot, {brut, fichiers, registre}) {
  const dossier = mkdtempSync(join(tmpdir(), "egide-verif-"));
  try {
    const rejeu = join(dossier, "essai.egide-rejeu");
    writeFileSync(rejeu, gzipSync(texte_rejeu(await creer_rejeu(brut, fichiers, registre))));
    const lu = lancer(godot, ["--headless", "--path", join(RACINE, "clients", "godot"), "--script", "res://scripts/verifier.gd", "--", "--rejeu", rejeu, "--sortie", join(dossier, "dump.json")], DELAI_GODOT_MS);
    // Le code de sortie dit l'accord des bilans, quelle que soit la langue du message.
    const reussi = lu.reussi;
    return resultat(t("cli.verif.client_godot"), reussi ? "ok" : "echec", reussi ? t("cli.verif.client_godot_ok") : lu.sortie.trim().split("\n").slice(-3).join(" | "), t("cli.verif.client_godot_remede"));
  } finally {
    rmSync(dossier, {recursive: true, force: true});
  }
}

async function controler_godot(simulation) {
  const trouve = trouver_godot(candidats_godot(), (commande) => {
    const lu = lancer(commande, ["--headless", "--version"]);
    return lu.reussi ? lu.sortie.trim().split("\n").at(-1) : null;
  });
  if (!trouve) return [resultat("Godot", "echec", t("cli.verif.introuvable"), remede_godot())];
  const version = trouve.version.join(".");
  if (!version_suffisante(trouve.version, VERSIONS_MINIMALES.godot)) return [resultat("Godot", "echec", version, remede_godot())];
  const ligne = resultat("Godot", "ok", `${version} (${trouve.commande})`);
  return simulation.brut ? [ligne, await controler_client_godot(trouve.commande, simulation)] : [ligne];
}

/** Rendre vrai si le port du site est libre ; occupé, le site ne démarrerait pas, ou tourne déjà. */
const port_libre = (port) => new Promise((rendre) => {
  const serveur = createServer();
  serveur.once("error", () => rendre(false));
  serveur.listen(port, "127.0.0.1", () => serveur.close(() => rendre(true)));
});

async function controler_port() {
  const libre = await port_libre(PORT_SITE);
  return resultat(t("cli.verif.port"), libre ? "ok" : "avertissement", t(libre ? "cli.verif.port_libre" : "cli.verif.port_occupe", {port: PORT_SITE}), t("cli.verif.port_remede"));
}

function controler_tests() {
  const js = lancer("npm", ["test"], DELAI_TESTS_MS);
  const py = lancer(chemin_python(RACINE), ["-m", "pytest", "-q", "tests"], DELAI_TESTS_MS);
  const detail = (lu) => (lu.reussi ? t("cli.verif.reussis") : lu.sortie.trim().split("\n").slice(-2).join(" | "));
  return [resultat(t("cli.verif.tests_js"), js.reussi ? "ok" : "echec", detail(js)), resultat(t("cli.verif.tests_py"), py.reussi ? "ok" : "echec", detail(py))];
}

/** Rendre les résultats de tous les contrôles ; `complet` ajoute les suites de tests. */
export async function verifier({complet = false} = {}) {
  const simulation = await controler_simulation();
  return [
    controler_node(), ...controler_python(), controler_fichiers_tiers(), simulation.ligne, controler_catalogue_prive(),
    ...(await controler_godot(simulation)), await controler_port(), ...(complet ? controler_tests() : []),
  ];
}

async function principal() {
  const options = preparer_langue(process.argv.slice(2));
  const resultats = await verifier({complet: options.includes("--complet")});
  console.log(options.includes("--json") ? JSON.stringify({...resumer(resultats), resultats}, null, 2) : texte_rapport(resultats));
  process.exitCode = resumer(resultats).pret ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
