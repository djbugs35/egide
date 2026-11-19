// Outils de preuve en ligne de commande (MODELE § 14). Chaque résultat porte son empreinte de reproductibilité et
// ses écarts au scénario de référence. Résultats : resultats/preuves/<outil>-<horodatage>/
//
//   node src/preuve.js dossier                                   # résultats, convergence, modèles : dossier.md
//   node src/preuve.js convergence --pas 2,1,0.5,0.25 --tirages 10
//   node src/preuve.js duel --variante rouge.tactique=direct     # A : le scénario ; B : A modifié par la variante
//   node src/preuve.js morris --facteur bleu.avions.1.nombre=0:60 --facteur rouge.etalement_s=0:600 --trajectoires 8
//   node src/preuve.js empreinte
//
// Comme pour src/campagne.js, toute autre option --chemin valeur modifie le scénario (A pour un duel).
import {mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {mener_campagne} from "./moteur/campagne.js";
import {charger_unites} from "./moteur/catalogue.js";
import {charger_tous_algos, lire_fichier, RACINE} from "./moteur/catalogue_node.js";
import {dossier_markdown} from "./moteur/dossier.js";
import {convergence, differentiel, duel, empreinte} from "./moteur/preuve.js";
import {en_v2, ids_unites, modifier_scenario} from "./moteur/scenario.js";
import {morris} from "./moteur/sensibilite.js";
import {preparer_langue} from "./langue_node.js";
import {nom_scenario} from "./catalogue_langue.js";
import {t} from "./i18n.js";

const OPTIONS = {scenario: "scenarios/reference.json", tirages: null, sortie: "resultats/preuves", pas: "1,0.5,0.25",
  variante: null, trajectoires: 6, niveaux: 4, tirages_convergence: 10};

const lire_valeur = (texte) => (texte !== "" && !Number.isNaN(Number(texte)) ? Number(texte) : texte);

/** Rendre {outil, options, modifications, facteurs} depuis la ligne de commande. */
export function lire_arguments(liste) {
  const [outil = "dossier", ...reste] = liste;
  const options = {...OPTIONS};
  const modifications = {};
  const facteurs = [];
  for (let i = 0; i < reste.length; i += 2) {
    const cle = reste[i].replace(/^--/, "");
    const texte = reste[i + 1] ?? "";
    if (cle === "facteur") facteurs.push(lire_facteur(texte));
    else if (cle in options) options[cle] = typeof OPTIONS[cle] === "number" || cle === "tirages" ? Number(texte) : texte;
    else modifications[cle] = lire_valeur(texte);
  }
  return {outil, options, modifications, facteurs};
}

/** Rendre le facteur {chemin, min, max, entier} écrit « chemin=min:max » (entier si les deux bornes le sont). */
export function lire_facteur(texte) {
  const [chemin, plage] = texte.split("=");
  const [min, max] = (plage ?? "").split(":").map(Number);
  if (!chemin || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) throw new Error(t("cli.preuve.facteur_illisible", {texte}));
  return {chemin, min, max, entier: Number.isInteger(min) && Number.isInteger(max)};
}

/** Rendre les modifications {chemin: valeur} écrites « a=1,b=direct ». */
export const lire_modifications = (texte) => Object.fromEntries((texte ?? "").split(",").filter(Boolean).map((paire) => {
  const [chemin, ...v] = paire.split("=");
  return [chemin, lire_valeur(v.join("="))];
}));

/** Rendre le texte du code du moteur (src/moteur/*.js), pour l'empreinte. */
function code_moteur() {
  const dossier = join(RACINE, "src", "moteur");
  return readdirSync(dossier).filter((f) => f.endsWith(".js")).sort().map((f) => `// ${f}\n${readFileSync(join(dossier, f), "utf-8")}`).join("\n");
}

function enregistrer(dossier, nom, fichiers) {
  const chemin = join(dossier, `${nom}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(chemin, {recursive: true});
  for (const [fichier, contenu] of Object.entries(fichiers)) {
    // Écriture atomique : un fichier interrompu ne se fait jamais passer pour un résultat.
    writeFileSync(join(chemin, `${fichier}.tmp`), contenu);
    renameSync(join(chemin, `${fichier}.tmp`), join(chemin, fichier));
  }
  return chemin;
}

async function contexte(options, modifications, extraUnites = {}) {
  const brut = modifier_scenario(en_v2(JSON.parse(readFileSync(options.scenario, "utf-8"))), modifications);
  const reference = JSON.parse(readFileSync(join(RACINE, "scenarios", "reference.json"), "utf-8"));
  const ids = [...ids_unites(brut), ...ids_unites(modifier_scenario(brut, extraUnites))];
  const fichiers = await charger_unites(ids, lire_fichier);
  const registre = await charger_tous_algos();
  const trace = await empreinte(brut, fichiers, registre, {moteur: code_moteur()});
  return {brut, fichiers, registre, trace, differentiel: differentiel(reference, brut)};
}

const VERSION = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf-8")).version;
const commun = (c, commande) => ({commande, date: new Date().toISOString(), version: VERSION, node: process.versions.node, empreinte: c.trace, differentiel: c.differentiel});

const json = (objet) => `${JSON.stringify(objet, null, 2)}\n`;
const fmt = (x) => (Number.isFinite(x) ? x.toFixed(1) : "∞");

/** Les outils : chacun rend {nom, fichiers à écrire, lignes à afficher}. */
const OUTILS = {
  async empreinte(c, o, commande) {
    return {fichiers: {"resultat.json": json(commun(c, commande))}, lignes: [c.trace.empreinte, ...Object.entries(c.trace.parties).map(([k, h]) => `  ${k.padEnd(9)} ${h}`)]};
  },
  async convergence(c, o, commande) {
    const resultat = convergence(c.brut, o.pas.split(",").map(Number), o.tirages ?? o.tirages_convergence, c.fichiers, c.registre);
    const lignes = resultat.lignes.map((l) => `${t("cli.preuve.pas")} ${String(l.pas_s).padEnd(5)} ${(l.conforme ? t("cli.preuve.conforme") : t("cli.preuve.ecart")).padEnd(8)} ${Object.entries(l.ecarts).map(([g, e]) => `${g} z ${fmt(e.z)}`).join(" | ")}`);
    return {fichiers: {"resultat.json": json({...commun(c, commande), convergence: resultat})}, lignes: [...lignes, resultat.converge ? `→ ${t("cli.preuve.converge")}` : `→ ${t("cli.preuve.non_converge")}`]};
  },
  async duel(c, o, commande) {
    const resultat = duel(c.brut, lire_modifications(o.variante), o.tirages ?? 30, c.fichiers, c.registre);
    const lignes = Object.entries(resultat.comparaison).map(([g, r]) =>
      `${g.padEnd(17)} A ${r.a.moyenne.toFixed(1).padStart(7)}  B ${r.b.moyenne.toFixed(1).padStart(7)}  B−A ${r.difference.moyenne.toFixed(1).padStart(7)} ± ${r.difference.ic95.toFixed(1).padEnd(6)} ${r.verdict === "indiscernable" ? t("cli.preuve.indiscernable") : r.verdict}`);
    return {fichiers: {"resultat.json": json({...commun(c, commande), duel: resultat})}, lignes};
  },
  async morris(c, o, commande, facteurs) {
    if (facteurs.length === 0) throw new Error(t("cli.preuve.morris_facteur"));
    const resultat = morris(c.brut, facteurs, {trajectoires: o.trajectoires, niveaux: o.niveaux, tirages: o.tirages ?? 3, graine: 1}, c.fichiers, c.registre);
    const lignes = Object.entries(resultat.effets).flatMap(([g, liste]) => [t("cli.preuve.bruit", {g, bruit: resultat.bruit[g].toFixed(1)}),
      ...liste.map((e) => `  ${e.chemin.padEnd(34)} μ* ${e.mu_etoile.toFixed(1).padStart(8)}  μ ${e.mu.toFixed(1).padStart(8)}  σ ${e.sigma.toFixed(1).padStart(8)}`)]);
    return {fichiers: {"resultat.json": json({...commun(c, commande), morris: resultat})}, lignes: [t("cli.preuve.evaluations", {n: resultat.evaluations}), ...lignes]};
  },
  async dossier(c, o, commande) {
    const tirages = o.tirages ?? 30;
    const resume = mener_campagne(c.brut, tirages, c.fichiers, c.registre);
    const conv = convergence(c.brut, o.pas.split(",").map(Number), o.tirages_convergence, c.fichiers, c.registre);
    // Nom affiché dans la langue choisie pour un scénario du dépôt (scenarios/<id>.json) ; résultat.json garde l'original.
    const id = /(?:^|[\\/])scenarios[\\/](.+)\.json$/.exec(o.scenario)?.[1];
    const donnees = {...commun(c, commande), nom: c.brut.nom, tirages, resume, convergence: conv};
    const markdown = dossier_markdown({...donnees, nom: id ? nom_scenario(id, c.brut.nom) : c.brut.nom, fichiers: c.fichiers, registre: c.registre});
    return {fichiers: {"resultat.json": json(donnees), "dossier.md": markdown}, lignes: [t("cli.preuve.empreinte", {e: c.trace.empreinte}), conv.converge ? t("cli.preuve.pas_converge") : t("cli.preuve.pas_non_converge")]};
  },
};

async function principal() {
  const argv = process.argv.slice(2);
  const {outil, options, modifications, facteurs} = lire_arguments(preparer_langue(argv));
  if (!(outil in OUTILS)) throw new Error(t("cli.preuve.outil_inconnu", {outil, liste: Object.keys(OUTILS).join(", ")}));
  const c = await contexte(options, modifications, outil === "duel" ? lire_modifications(options.variante) : {});
  const commande = `node src/preuve.js ${argv.join(" ")}`.trim();
  const {fichiers, lignes} = await OUTILS[outil](c, options, commande, facteurs);
  for (const ligne of lignes) console.log(ligne);
  console.log(`→ ${enregistrer(options.sortie, outil, fichiers)}`);
}

// Lancé en ligne de commande (et non importé par un test) : un chemin avec espaces doit encore correspondre.
if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
