// Partie en direct (MODELE § 26) : le pas à pas et les ordres du joueur ne s'écartent jamais de la simulation.
import assert from "node:assert/strict";
import test from "node:test";
import {geo_deg, vers_ecef} from "../src/moteur/geodesie.js";
import {bilan, simuler} from "../src/moteur/monde.js";
import {creer_partie, OrdreInvalide, point_au_sol} from "../src/moteur/partie.js";
import {creer_repere} from "../src/moteur/rejeu.js";
import {en_v2, modifier_scenario, resoudre_scenario} from "../src/moteur/scenario.js";
import {FICHIERS, REFERENCE, REGISTRE} from "./aide_scenario.js";

// Un raid court : ces tests jouent la partie entière plusieurs fois.
const PETIT = {"rouge.nombre": 40, "theatre.cibles_nombre": 3};
const brut = (modifications = {}) => modifier_scenario(en_v2(REFERENCE), {...PETIT, ...modifications});
const partie = (modifications) => creer_partie(brut(modifications), FICHIERS, REGISTRE);

function jouer(p, a_chaque_pas = () => {}) {
  const lignes = [];
  while (!p.termine()) {
    a_chaque_pas(p);
    p.avancer();
    lignes.push(...p.releve());
  }
  return lignes;
}

const simule = (scenario_brut) => bilan(simuler(resoudre_scenario(scenario_brut, FICHIERS), {registre: REGISTRE, journal: false}));

test("partie sans ordre : même bilan que la simulation du scénario", async () => {
  const p = await partie();
  jouer(p);
  assert.deepEqual(p.bilan(), simule(brut()));
});

test("partie avec ordres : le scénario joué, relu par la simulation, redonne le même bilan", async () => {
  const p = await partie();
  // Tous les vecteurs envoyés loin de l'essaim : le raid change forcément.
  const tous = Array.from({length: 50}, (_, id) => id);
  const ordres = new Map([[2, {avions: tous, e: -300_000, n: 200_000}], [40, {avions: [2], e: -30_000, n: 5_000}]]);
  let rang = 0;
  jouer(p, (q) => {
    if (ordres.has(rang)) q.ordonner(ordres.get(rang));
    rang++;
  });
  assert.equal(p.scenario_joue().bleu.ordres.length, 2);
  assert.deepEqual(p.bilan(), simule(p.scenario_joue()));
  assert.notDeepEqual(p.bilan(), simule(brut()), "ces ordres devraient changer le raid : sinon le test ne prouve rien");
});

test("ordre : inséré avant ceux que le scénario prévoit plus tard", async () => {
  const lointain = {t_s: 60, avions: [3], lat_deg: 47, lon_deg: 2.5};
  const p = await partie({"bleu.ordres": [lointain]});
  let rang = 0;
  jouer(p, (q) => {
    if (rang++ === 4) q.ordonner({avions: [0], e: 1000, n: 1000});
  });
  assert.deepEqual(p.bilan(), simule(p.scenario_joue()));
});

test("relevé : les évènements d'un pas précèdent son image, et le bilan n'est donné qu'une fois, en dernier", async () => {
  const p = await partie();
  const lignes = jouer(p);
  p.avancer();
  assert.deepEqual(p.releve(), []);
  assert.equal(lignes.filter((l) => l.genre === "bilan").length, 1);
  assert.equal(lignes.at(-1).genre, "bilan");
  let derniere = 0;
  for (const ligne of lignes) {
    if (ligne.genre === "evenement") assert.ok(ligne.t > derniere - 1e-9, "évènement antérieur à une image déjà envoyée");
    if (ligne.genre === "image") derniere = ligne.t;
  }
});

test("ouverture : en-tête du rejeu, statique, couvertures et image, sans durée connue d'avance", async () => {
  const p = await partie();
  const genres = p.ouverture().map((l) => l.genre);
  assert.deepEqual(genres, ["entete", "statique", "couvertures", "image"]);
  assert.equal(p.ouverture()[0].duree_s, null);
});

test("ordre refusé : vecteur inexistant, liste vide ou point invalide, sans rien enregistrer", async () => {
  const p = await partie();
  for (const mauvais of [{avions: [9999], e: 0, n: 0}, {avions: [], e: 0, n: 0}, {avions: ["0"], e: 0, n: 0}, {avions: [0], e: "x", n: 0}, {avions: [0], e: 0, n: null}]) {
    assert.throws(() => p.ordonner(mauvais), OrdreInvalide);
  }
  assert.equal(p.scenario_joue().bleu.ordres?.length ?? 0, 0);
});

test("point au sol : retrouve les coordonnées du repère du rejeu, à 1 cm près, même à 500 km", () => {
  const origine = geo_deg(47, 2.5, 0);
  const repere = creer_repere(origine);
  for (const [e, n] of [[0, 0], [10_000, -5_000], [400_000, 300_000]]) {
    const point = point_au_sol(origine, e, n);
    assert.equal(point.alt, 0);
    const local = repere(vers_ecef(point));
    assert.ok(Math.hypot(local.e - e, local.n - n) < 0.01, `(${e}, ${n}) : ${local.e}, ${local.n}`);
  }
});
