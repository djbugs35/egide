// Édition du scénario par gestes (docs/FORMATS.md § 10.4) : mêmes modifications que l'éditeur du navigateur, annulation, refus.
import assert from "node:assert/strict";
import test from "node:test";
import {creer_partie} from "../src/moteur/partie.js";
import {en_v2, modifier_scenario} from "../src/moteur/scenario.js";
import {creer_atelier_scenario, description_edition, message_palette} from "../src/serveur/atelier_scenario.js";
import {creer_salle} from "../src/serveur/salle.js";
import {FICHIERS, REFERENCE, REGISTRE} from "./aide_scenario.js";

const INDEX = Object.keys(FICHIERS).filter((id) => !id.startsWith("prive/")).map((id) => ({id, nom: FICHIERS[id].nom ?? id, base: id.split("/").at(-1).startsWith("_"), pays: null, icone: null}));
const RADAR = "capteurs/radars/radar_longue_portee_notionnel";
const PETIT = {"rouge.nombre": 20, "theatre.cibles_nombre": 3};

async function salle_edition() {
  const ecrits = [];
  const diffuses = [];
  const bibliotheque = {lister: () => [{id: "a", nom: "a"}], lire: () => modifier_scenario(en_v2(REFERENCE), PETIT), ecrire: (nom, brut) => (ecrits.push([nom, brut]), `prive/scenarios/${nom}.json`)};
  let courante = null;
  const salle = creer_salle({
    brut: modifier_scenario(en_v2(REFERENCE), PETIT),
    preparer: async (voulu) => (courante = await creer_partie(voulu, FICHIERS, REGISTRE)),
    diffuser: (e) => diffuses.push(e), archiver: async () => ({}), maintenant: () => 0,
    extensions: creer_atelier_scenario({index: INDEX, fichiers: FICHIERS, bibliotheque}),
  });
  await salle.demarrer();
  const dernier = (genre) => diffuses.filter((e) => e.genre === genre).at(-1);
  return {salle, diffuses, ecrits, partie: () => courante, dernier, elements: () => dernier("elements").liste};
}

test("déposer un radar : un de plus dans le scénario, à la position visée, et la liste suit", async () => {
  const {salle, partie, elements, dernier} = await salle_edition();
  const avant = elements().filter((e) => e.type === "radar").length;
  await salle.commander({type: "editer", geste: "deposer", id: RADAR, e: 12_000, n: -8_000});
  assert.equal(dernier("erreur"), undefined);
  const radars = elements().filter((e) => e.type === "radar");
  assert.equal(radars.length, avant + 1);
  assert.ok(Math.hypot(radars.at(-1).e - 12_000, radars.at(-1).n + 8_000) < 1);
  assert.equal(partie().brut.bleu.radar.sites.at(-1).unite, RADAR);
});

test("déplacer puis annuler : le scénario redevient identique ; rétablir refait le geste", async () => {
  const {salle, partie, elements} = await salle_edition();
  const initial = structuredClone(partie().brut);
  const radar = elements().find((e) => e.type === "radar");
  await salle.commander({type: "editer", geste: "deplacer", cles: [radar.cle], de: {e: radar.e, n: radar.n}, vers: {e: radar.e + 5000, n: radar.n}});
  const bouge = elements().find((e) => e.cle === radar.cle);
  assert.ok(Math.abs(bouge.e - radar.e - 5000) < 50);
  await salle.commander({type: "annuler"});
  assert.deepEqual(partie().brut, initial);
  await salle.commander({type: "retablir"});
  assert.notDeepEqual(partie().brut, initial);
});

test("supprimer, relier, plan de vol, zone : chaque geste passe par l'édition du navigateur", async () => {
  const {salle, partie, elements, dernier} = await salle_edition();
  const radars = elements().filter((e) => e.type === "radar");
  await salle.commander({type: "editer", geste: "supprimer", cles: [radars[0].cle]});
  assert.equal(elements().filter((e) => e.type === "radar").length, radars.length - 1);
  await salle.commander({type: "editer", geste: "relier", de: "radar:0", vers: "conduite"});
  assert.equal(partie().brut.bleu.reseau.mode, "liaisons");
  assert.ok(dernier("elements").liaisons.length >= 1);
  await salle.commander({type: "editer", geste: "passage", e: 1000, n: 2000});
  assert.equal(partie().brut.rouge.tactique, "plan_de_vol");
  await salle.commander({type: "editer", geste: "zone", points: [{e: 0, n: 0}, {e: 9000, n: 0}, {e: 0, n: 9000}]});
  assert.equal(dernier("elements").zones.length, 1);
});

test("édition refusée après le début du raid : le scénario d'une partie en cours ne bouge pas", async () => {
  const {salle, partie, dernier} = await salle_edition();
  partie().avancer();
  const avant = structuredClone(partie().brut);
  await salle.commander({type: "editer", geste: "deposer", id: RADAR, e: 0, n: 0});
  assert.equal(dernier("erreur").commande, "editer");
  assert.deepEqual(partie().brut, avant);
});

test("gestes invalides : refusés, annoncés, sans entrer dans l'historique", async () => {
  const {salle, diffuses, dernier} = await salle_edition();
  const mauvais = [{geste: "inconnu"}, {geste: "toString"}, {geste: "deposer", id: "unites/inexistante", e: 0, n: 0}, {geste: "deposer", id: RADAR, e: "x", n: 0}, {geste: "supprimer", cles: []}, {geste: "zone", points: [{e: 0, n: 0}]}, {geste: "relier", de: "zzz", vers: "conduite"}];
  for (const geste of mauvais) {
    const n = diffuses.length;
    await salle.commander({type: "editer", ...geste});
    assert.equal(dernier("erreur") && diffuses.length, n + 1, JSON.stringify(geste));
  }
  await salle.commander({type: "annuler"});
  assert.match(dernier("erreur").message, /rien à reprendre/);
});

test("enregistrer : le scénario courant part à la bibliothèque, et la liste est rediffusée", async () => {
  const {salle, ecrits, partie, dernier} = await salle_edition();
  await salle.commander({type: "enregistrer_scenario", nom: "mon_plan"});
  assert.equal(ecrits[0][0], "mon_plan");
  assert.deepEqual(ecrits[0][1], partie().brut);
  assert.ok(dernier("scenarios"));
});

test("palette : familles du catalogue, portée d'aperçu pour un radar, aucune pour un avion", () => {
  const {familles} = message_palette(INDEX, FICHIERS, 100);
  const capteurs = familles.find((f) => f.id === "capteurs").elements;
  assert.ok(capteurs.find((e) => e.id === RADAR).rayon_m > 0);
  const avions = familles.find((f) => f.id === "avions").elements;
  assert.equal(avions[0].rayon_m, null);
});

test("description : les éléments sont en mètres dans le repère du rejeu", async () => {
  const p = await creer_partie(modifier_scenario(en_v2(REFERENCE), PETIT), FICHIERS, REGISTRE);
  const description = description_edition(p);
  const site = p.ouverture()[1].sites[0];
  const cible = description.liste.find((e) => e.cle === "cible:0");
  assert.ok(Math.hypot(cible.e - site.e, cible.n - site.n) < 1);
});
