// Compare à la simulation les positions relues par un client de rejeu (critère du jalon 15, docs/PLAN_3D.md) :
//   node outils/verifier_client.js --client dump.json [--scenario scenarios/reference.json]
// `dump.json` : écrit par clients/godot/scripts/verifier.gd, ou tout client qui suit docs/FORMATS.md § 8.
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {charger_tous_algos, charger_unites_scenario} from "../src/moteur/catalogue_node.js";
import {bilan, simuler} from "../src/moteur/monde.js";
import {empreinte} from "../src/moteur/preuve.js";
import {creer_repere} from "../src/moteur/rejeu.js";
import {en_v2, resoudre_scenario} from "../src/moteur/scenario.js";

const TOLERANCE_POSITION_M = 1;
const TOLERANCE_DUREE_S = 1e-3;

/** Rendre l'écart (m) entre un point client [id, x, y, z] et le moteur, le client étant en (e, u, −n). */
function ecart_point([, x, y, z], entite, repere) {
  const {e, n, u} = repere(entite.ecef);
  return Math.hypot(x - e, y - u, z + n);
}

/**
 * Rendre {ecart_max (m), points, manquants} : `images_client` [{t, drones, vecteurs}] contre `etats` (Map de t vers
 * {drones, avions} du moteur). `manquants` compte les entités citées par le client que le moteur n'a pas.
 */
export function comparer_images(images_client, etats, repere) {
  let [ecart_max, points, manquants] = [0, 0, 0];
  for (const image of images_client) {
    const etat = etats.get(image.t);
    if (!etat) {
      manquants += image.drones.length + image.vecteurs.length;
      continue;
    }
    for (const [liste, entites] of [[image.drones, etat.drones], [image.vecteurs, etat.avions]]) {
      for (const point of liste) {
        const entite = entites.get(point[0]);
        if (!entite) {
          manquants++;
          continue;
        }
        ecart_max = Math.max(ecart_max, ecart_point(point, entite, repere));
        points++;
      }
    }
  }
  return {ecart_max, points, manquants};
}

/** Rendre les clés du bilan du moteur que `bilan_client` recopie mal : [{cle, client, moteur}]. */
export function ecarts_bilan(bilan_client, bilan_moteur) {
  return Object.entries(bilan_client)
    .filter(([cle, valeur]) => cle !== "genre" && Math.abs(valeur - bilan_moteur[cle]) > TOLERANCE_DUREE_S)
    .map(([cle, client]) => ({cle, client, moteur: bilan_moteur[cle]}));
}

async function principal() {
  const argv = process.argv.slice(2);
  const option = (nom, defaut) => (argv.includes(`--${nom}`) ? argv[argv.indexOf(`--${nom}`) + 1] : defaut);
  const client = JSON.parse(readFileSync(option("client"), "utf-8"));
  const brut = en_v2(JSON.parse(readFileSync(option("scenario", "scenarios/reference.json"), "utf-8")));
  const [fichiers, registre] = [await charger_unites_scenario(brut), await charger_tous_algos()];
  if ((await empreinte(brut, fichiers, registre)).empreinte !== client.empreinte) throw new Error("ce dump ne vient pas de ce scénario : empreintes différentes");
  const scenario = resoudre_scenario(brut, fichiers);
  const voulus = new Set(client.images.map((i) => i.t));
  const etats = new Map();
  const observer = (monde) => {
    if (!voulus.has(monde.t)) return;
    const copie = (liste) => new Map(liste.map((x) => [x.id, {ecef: {...x.ecef}}]));
    etats.set(monde.t, {drones: copie(monde.drones), avions: copie(monde.avions)});
  };
  const monde = simuler(scenario, {registre, journal: false, observer});
  const repere = creer_repere({...scenario.theatre.origine, alt: scenario.theatre.origine.alt ?? 0});
  const resultat = comparer_images(client.images, etats, repere);
  const bilans = [...ecarts_bilan(client.bilan_recalcule, bilan(monde)), ...ecarts_bilan(client.bilan_fichier, bilan(monde))];
  console.log(`${resultat.points} positions, écart maximal ${resultat.ecart_max.toFixed(3)} m, ${resultat.manquants} entités sans correspondance ; bilan : ${bilans.length ? JSON.stringify(bilans) : "identique"}`);
  if (resultat.ecart_max > TOLERANCE_POSITION_M || resultat.manquants || bilans.length || !resultat.points) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
