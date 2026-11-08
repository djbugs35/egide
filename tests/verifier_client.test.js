// Comparaison d'un client de rejeu à la simulation (jalon 15.3, docs/FORMATS.md § 8).
import assert from "node:assert/strict";
import test from "node:test";
import {comparer_images, ecarts_bilan} from "../outils/verifier_client.js";

// Repère de convention : l'ECEF de l'essai porte directement e, n et u.
const repere = ({x, y, z}) => ({e: x, n: y, u: z});
const etats = new Map([[0.5, {drones: new Map([[3, {ecef: {x: 100, y: 200, z: 50}}]]), avions: new Map([[1, {ecef: {x: -10, y: 20, z: 1000}}]])}]]);
const image = (decalage = 0) => [{t: 0.5, drones: [[3, 100 + decalage, 50, -200]], vecteurs: [[1, -10, 1000, -20]]}];

test("client : des positions en (e, u, −n) exactes donnent un écart nul", () => {
  assert.deepEqual(comparer_images(image(), etats, repere), {ecart_max: 0, points: 2, manquants: 0});
});

test("client : l'écart maximal mesure le point le plus éloigné", () => {
  assert.equal(comparer_images(image(3), etats, repere).ecart_max, 3);
});

test("client : un nord non inversé se voit comme un écart", () => {
  assert.ok(comparer_images([{t: 0.5, drones: [[3, 100, 50, 200]], vecteurs: []}], etats, repere).ecart_max > 1);
});

test("client : un instant ou une entité inconnus du moteur comptent comme manquants", () => {
  assert.equal(comparer_images([{t: 9, drones: [[3, 0, 0, 0]], vecteurs: []}], etats, repere).manquants, 1);
  assert.equal(comparer_images([{t: 0.5, drones: [[99, 0, 0, 0]], vecteurs: []}], etats, repere).manquants, 1);
});

test("client : le bilan signale la clé fausse et ignore le genre de la ligne", () => {
  assert.deepEqual(ecarts_bilan({genre: "bilan", fuites: 10, duree: 5}, {fuites: 11, duree: 5}), [{cle: "fuites", client: 10, moteur: 11}]);
});
