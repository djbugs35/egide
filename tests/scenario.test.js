import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CatalogueInvalide, unite_brute, unite_si} from "../src/moteur/catalogue.js";
import {lire_chemin, migrer_v1, modifier_scenario, resoudre_scenario, ScenarioInvalide} from "../src/moteur/scenario.js";
import {AIDE} from "../src/moteur/scenario_aide.js";
import {FICHIERS, REFERENCE, scenario} from "./aide_scenario.js";

const V1 = JSON.parse(readFileSync(new URL("./scenario_v1.json", import.meta.url)));

test("catalogue : une unité hérite des clés et des phrases d'aide de ses ancêtres", () => {
  const avion = unite_brute("vecteurs/avions/turbopropulseur_ir_notionnel", FICHIERS);
  assert.deepEqual(avion._lignee, ["_unite", "vecteurs/avions/_avion", "vecteurs/avions/turbopropulseur_ir_notionnel"]);
  assert.equal(avion.vitesse_mise_a_poste_kmh, 500);
  assert.ok("emport_nombre" in avion._aide && "nom" in avion._aide);
});
test("catalogue : conversion en SI d'après le suffixe des clés", () => {
  const arme = unite_si("effecteurs/roquettes/roquette_guidee_ir_notionnelle", FICHIERS);
  assert.equal(arme.portee, 8_000);
  assert.equal(arme.vitesse, 700);
  assert.equal(arme.guidage, "ir");
});
test("catalogue : une clé non documentée est refusée", () => {
  const fichiers = {...FICHIERS, "x/y": {herite_de: "_unite", nom: "X", sources: ["s"], vitesse_kmh: 3}};
  assert.throws(() => unite_brute("x/y", fichiers), /vitesse_kmh/);
});
test("catalogue : un héritage circulaire est refusé", () => {
  const fichiers = {...FICHIERS, a: {herite_de: "b"}, b: {herite_de: "a"}};
  assert.throws(() => unite_brute("a", fichiers), CatalogueInvalide);
});
test("catalogue : une surcharge d'une clé inconnue est refusée", () => {
  assert.throws(() => unite_si("sites/postes/poste_sol_air_notionnel", FICHIERS, {portee_mile: 3}), /portee_mile/);
});

test("chemins : lecture et modification sans toucher l'original", () => {
  const modifie = modifier_scenario(REFERENCE, {"bleu.avions.1.nombre": 7, "rouge.surcharges.vitesse_kmh": 600});
  assert.equal(lire_chemin(modifie, "bleu.avions.1.nombre"), 7);
  assert.equal(lire_chemin(modifie, "rouge.surcharges.vitesse_kmh"), 600);
  assert.equal(lire_chemin(REFERENCE, "bleu.avions.1.nombre"), 30);
});
test("résolution : surcharges appliquées, unités SI, flotte hétérogène", () => {
  const s = scenario({"rouge.surcharges.vitesse_kmh": 720});
  assert.ok(Math.abs(s.rouge.vitesse - 200) < 1e-9);
  assert.deepEqual(s.avions.slice(0, 2).map((g) => [g.arme.guidage, g.nombre]), [["ir", 20], ["laser", 30]]);
  assert.deepEqual(s.avions.slice(2).map((g) => [g.type_vecteur, g.nombre]), [["drone_arme", 0], ["kamikaze", 0], ["brouilleur", 0]]);
  assert.equal(s.avions[0].altitude, 1000);
});
test("résolution : tactique inconnue refusée", () => {
  assert.throws(() => scenario({"rouge.tactique": "zigzag"}), ScenarioInvalide);
});
test("résolution : clé de scénario sans phrase d'aide refusée", () => {
  assert.throws(() => resoudre_scenario(modifier_scenario(REFERENCE, {"bleu.conduite.inconnue": 1}), FICHIERS), /inconnue/);
});

test("migration : le scénario v1 de la v0.1 se résout comme le scénario de référence v2", () => {
  const sansNom = ({nom: _, ...reste}) => JSON.stringify(reste, (k, v) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v));
  assert.equal(sansNom(resoudre_scenario(V1, FICHIERS)), sansNom(scenario()));
});
test("migration : le document migré porte les mêmes phrases d'aide que le scénario de référence", () => {
  const migre = migrer_v1(V1);
  for (const [chemin, aide] of [["", AIDE.racine], ["theatre", AIDE.theatre], ["rouge", AIDE.rouge], ["bleu", AIDE.bleu],
    ["bleu.sol", AIDE.sol], ["bleu.radar", AIDE.radar], ["bleu.conduite", AIDE.conduite], ["simulation", AIDE.simulation]]) {
    const noeud = chemin ? lire_chemin(REFERENCE, chemin) : REFERENCE;
    assert.deepEqual(noeud._aide, aide, chemin || "racine");
    assert.deepEqual((chemin ? lire_chemin(migre, chemin) : migre)._aide, aide);
  }
});

test("résolution d'un déploiement (MODELE § 21) : identique à la variante partagée avec le jumeau Python", () => {
  const {modifications, resolu} = JSON.parse(readFileSync(new URL("./resolution_reference.json", import.meta.url))).variante_deploiement;
  assert.deepEqual(JSON.parse(JSON.stringify(resoudre_scenario(modifier_scenario(REFERENCE, modifications), FICHIERS))), resolu);
});

test("résolution de l'essaim réactif (MODELE § 22) : identique à la variante partagée avec le jumeau Python", () => {
  const {modifications, resolu} = JSON.parse(readFileSync(new URL("./resolution_reference.json", import.meta.url))).variante_reaction;
  assert.deepEqual(JSON.parse(JSON.stringify(resoudre_scenario(modifier_scenario(REFERENCE, modifications), FICHIERS))), resolu);
});

test("scénario d'avant le jalon 16 : sans clés de réaction, il se résout inerte et peut basculer en réactif", () => {
  const ancien = structuredClone(REFERENCE);
  for (const cle of Object.keys(ancien.rouge)) if (cle.startsWith("reaction")) delete ancien.rouge[cle];
  for (const cle of Object.keys(ancien.rouge._aide)) if (cle.startsWith("reaction")) delete ancien.rouge._aide[cle];
  assert.equal(resoudre_scenario(ancien, FICHIERS).rouge.reaction, null);
  const reactif = resoudre_scenario(modifier_scenario(ancien, {"rouge.reaction": "adaptatif"}), FICHIERS).rouge;
  assert.equal(reactif.reaction, "global/reaction/essaim_adaptatif");
  assert.equal(reactif.reaction_rayon_danger, 10_000);
});

test("résolution : identique à tests/resolution_reference.json, partagé avec le jumeau Python", () => {
  const attendu = JSON.parse(readFileSync(new URL("./resolution_reference.json", import.meta.url))).resolu;
  const arrondi = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v)));
  assert.deepEqual(arrondi(scenario()), arrondi(attendu));
});
