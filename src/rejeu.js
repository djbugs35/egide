// Fichier de rejeu d'un raid sous Node (jalon 15.1, docs/FORMATS.md § 6), à relire dans un moteur de jeu :
//
//   node src/rejeu.js                                        # scénario de référence, image toutes les 0,5 s
//   node src/rejeu.js --scenario scenarios/autre.json --echantillon 1 --simulation.graine 7
//
// Toute valeur du scénario se surcharge par son chemin, comme pour une campagne. Écrit resultats/rejeux/*.egide-rejeu
// (JSON lignes compressé en gzip).
import {mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {gzipSync} from "node:zlib";
import {lire_arguments} from "./arguments.js";
import {charger_tous_algos, charger_unites_scenario} from "./moteur/catalogue_node.js";
import {creer_rejeu, PAS_ECHANTILLON_DEFAUT, texte_rejeu} from "./moteur/rejeu.js";
import {en_v2, modifier_scenario} from "./moteur/scenario.js";

function enregistrer(dossier, nom, octets) {
  mkdirSync(dossier, {recursive: true});
  const chemin = join(dossier, nom);
  // Écriture atomique : un fichier interrompu ne se fait jamais passer pour un rejeu.
  writeFileSync(`${chemin}.tmp`, octets);
  renameSync(`${chemin}.tmp`, chemin);
  return chemin;
}

async function principal() {
  const {options, modifications} = lire_arguments(process.argv.slice(2), {scenario: "scenarios/reference.json", echantillon: PAS_ECHANTILLON_DEFAUT, sortie: "resultats/rejeux"});
  const brut = modifier_scenario(en_v2(JSON.parse(readFileSync(options.scenario, "utf-8"))), modifications);
  const fichiers = await charger_unites_scenario(brut);
  const enregistrements = await creer_rejeu(brut, fichiers, await charger_tous_algos(), {pas_echantillon: options.echantillon});
  const [entete, , , ...reste] = enregistrements;
  const octets = gzipSync(texte_rejeu(enregistrements));
  const chemin = enregistrer(options.sortie, `rejeu-${entete.empreinte.slice(0, 12)}-g${entete.graine}.egide-rejeu`, octets);
  const fin = reste.at(-1);
  console.log(`${entete.images} images, ${entete.duree_s} s simulées, ${(octets.length / 1e6).toFixed(1)} Mo ; fuites ${fin.fuites}, détruits air ${fin.detruits_air}, sol ${fin.detruits_sol}`);
  console.log(`→ ${chemin}`);
}

// Lancé en ligne de commande (et non importé par un test) : un chemin avec espaces doit encore correspondre.
if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
