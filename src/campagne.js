// Campagne Monte-Carlo sous Node : rejoue un scénario sur N graines et résume chaque grandeur avec son IC à 95 %.
//
//   node src/campagne.js                                            # scénario de référence, 50 tirages
//   node src/campagne.js --tirages 200 --rouge.tactique direct --bleu.avions.1.nombre 10
//   node src/campagne.js --balayer bleu.avions.1.nombre=0,10,30,60   # une campagne par valeur
//   node src/campagne.js --scenario scenarios/autre.json             # un scénario v1 est migré à la lecture
//
// Toute valeur du scénario se surcharge par son chemin (unités d'affichage), y compris celles d'une unité :
// --rouge.surcharges.vitesse_kmh 600. Résultats : resultats/campagnes/*.json, avec leur empreinte de reproductibilité
// et leurs écarts au scénario de référence (MODELE § 14.1).
import {mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {GRANDEURS, mener_campagne} from "./moteur/campagne.js";
import {lire_arguments} from "./arguments.js";
import {charger_tous_algos, charger_unites_scenario, RACINE} from "./moteur/catalogue_node.js";
import {differentiel, empreinte} from "./moteur/preuve.js";
import {en_v2, modifier_scenario} from "./moteur/scenario.js";

function afficher(libelle, resume) {
  const cellules = GRANDEURS.map((g) => `${g} ${resume[g].moyenne.toFixed(1)} ± ${resume[g].ic95.toFixed(1)}`);
  console.log(`${libelle.padEnd(28)} ${cellules.join(" | ")}`);
}

function enregistrer(dossier, contenu) {
  mkdirSync(dossier, {recursive: true});
  const chemin = join(dossier, `campagne-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  // Écriture atomique : un fichier interrompu ne se fait jamais passer pour un résultat.
  writeFileSync(`${chemin}.tmp`, JSON.stringify(contenu, null, 2));
  renameSync(`${chemin}.tmp`, chemin);
  return chemin;
}

async function principal() {
  const {options, modifications} = lire_arguments(process.argv.slice(2), {scenario: "scenarios/reference.json", tirages: 50, sortie: "resultats/campagnes", balayer: null});
  const brut = modifier_scenario(en_v2(JSON.parse(readFileSync(options.scenario, "utf-8"))), modifications);
  const fichiers = await charger_unites_scenario(brut);
  const registre = await charger_tous_algos();
  const [cheminBalaye, liste] = options.balayer ? options.balayer.split("=") : [null, null];
  const valeurs = cheminBalaye ? liste.split(",").map(Number) : [null];
  const resultats = valeurs.map((valeur) => {
    const variante = cheminBalaye ? modifier_scenario(brut, {[cheminBalaye]: valeur}) : brut;
    const resume = mener_campagne(variante, options.tirages, fichiers, registre);
    afficher(cheminBalaye ? `${cheminBalaye} = ${valeur}` : "scénario", resume);
    return {valeur, resume};
  });
  const reference = JSON.parse(readFileSync(join(RACINE, "scenarios", "reference.json"), "utf-8"));
  const trace = await empreinte(brut, fichiers, registre);
  const chemin = enregistrer(options.sortie, {
    empreinte: trace, differentiel: differentiel(reference, brut), scenario: brut, tirages: options.tirages, chemin_balaye: cheminBalaye, resultats,
  });
  console.log(`→ ${chemin}`);
}

// Lancé en ligne de commande (et non importé par un test) : un chemin avec espaces doit encore correspondre.
if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
