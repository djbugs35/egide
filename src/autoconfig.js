// Auto-configuration en ligne de commande (MODELE § 20) : construit et optimise un scénario pour une zone (pays de
// cartes/frontieres/pays.json, ou polygone en fichier JSON), l'écrit dans la bibliothèque scenarios/ et la réindexe.
//
//   node src/autoconfig.js --pays FRA --menaces fourmi:1000,direct:1000 --radars 30 --centres 3 --cibles 15 \
//        --postes 400 --munitions 2000 --avions 20,30,0,0,0 --tirages 3
//   node src/autoconfig.js --zone ma_zone.json --nom "Ma zone"        # ma_zone.json : [{lat_deg, lon_deg}, …]
import {readFileSync, renameSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {optimiser} from "./moteur/autoconfig.js";
import {charger_tous_algos, charger_unites_scenario, RACINE} from "./moteur/catalogue_node.js";
import {en_v2} from "./moteur/scenario.js";
import {index_scenarios} from "../outils/indexer.js";
import {preparer_langue} from "./langue_node.js";

export {anneau_principal} from "./vue/autoconfig_panneau.js";
import {anneau_principal} from "./vue/autoconfig_panneau.js";
import {t} from "./i18n.js";

function lire_arguments(liste) {
  const o = {pays: null, zone: null, nom: null, menaces: "fourmi:1000,direct:1000", radars: 30, centres: 2, cibles: 10, postes: 200,
    munitions: 1020, avions: "20,30,0,0,0", tirages: 3, scenario: "scenarios/reference.json"};
  for (let i = 0; i < liste.length; i += 2) o[liste[i].replace(/^--/, "")] = liste[i + 1];
  return o;
}

/** Rendre la zone {nom, points} demandée : un pays par code ISO ou nom, ou un fichier de points. */
function zone_demandee(o) {
  if (o.zone) return {nom: o.nom ?? o.zone, points: JSON.parse(readFileSync(o.zone, "utf-8"))};
  const {pays} = JSON.parse(readFileSync(join(RACINE, "cartes", "frontieres", "pays.json"), "utf-8"));
  const trouve = pays.find((p) => p.iso === o.pays || p.nom.toLowerCase() === String(o.pays).toLowerCase());
  if (!trouve) throw new Error(t("cli.autoconfig.pays_introuvable", {pays: o.pays}));
  const anneau = anneau_principal(trouve);
  return {nom: o.nom ?? trouve.nom, points: anneau.slice(0, -1).map(([lon, lat]) => ({lat_deg: lat, lon_deg: lon}))};
}

const slug = (texte) => texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

async function principal() {
  const o = lire_arguments(preparer_langue(process.argv.slice(2)));
  const base = en_v2(JSON.parse(readFileSync(o.scenario, "utf-8")));
  const demande = {
    zone: zone_demandee(o),
    menaces: o.menaces.split(",").map((m) => ({tactique: m.split(":")[0], nombre: Number(m.split(":")[1])})),
    moyens: {radars: Number(o.radars), centres: Number(o.centres), cibles: Number(o.cibles), postes: Number(o.postes),
      munitions_sol: Number(o.munitions), avions: o.avions.split(",").map(Number)},
  };
  const fichiers = await charger_unites_scenario(base);
  const registre = await charger_tous_algos();
  const r = optimiser(base, demande, {tirages: Number(o.tirages), fichiers, registre,
    progression: (fait, total, e) => console.log(t("cli.autoconfig.essai", {fait, total, strategie: JSON.stringify(e.strategie), frappes: e.frappes.toFixed(1)}))});
  const d = r.comparaison.difference;
  console.log(`→ ${t("cli.autoconfig.retenue", {strategie: JSON.stringify(r.strategie), meilleur: r.meilleur.toFixed(1), uniforme: r.uniforme.toFixed(1), ecart: d.moyenne.toFixed(1), ic: d.ic95.toFixed(1), verdict: r.comparaison.verdict === "indiscernable" ? t("cli.preuve.indiscernable") : r.comparaison.verdict})}`);
  const chemin = join(RACINE, "scenarios", `auto_${slug(demande.zone.nom)}.json`);
  writeFileSync(`${chemin}.tmp`, `${JSON.stringify({...r.brut, autoconfig: undefined}, null, 2)}\n`);
  renameSync(`${chemin}.tmp`, chemin);
  writeFileSync(join(RACINE, "scenarios", "index.json"), `${JSON.stringify(index_scenarios(), null, 2)}\n`);
  console.log(`→ ${t("cli.autoconfig.ecrit", {chemin})}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
