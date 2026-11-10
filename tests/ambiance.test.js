// Mise en scène : dégâts, radio, sons (MODELE § 30).
import assert from "node:assert/strict";
import test from "node:test";
import {simuler} from "../src/moteur/monde.js";
import {niveau_degats, panache} from "../src/vue/ambiance.js";
import {indicatif, message_du_lot} from "../src/vue/radio.js";
import {sons_du_lot} from "../src/vue/sons.js";
import {REGISTRE, scenario} from "./aide_scenario.js";

test("le niveau de dégâts suit les frappes rapportées à la concentration maximale, seuils compris", () => {
  assert.deepEqual([0, 1, 19, 20, 59, 60, 300].map((n) => niveau_degats(n, 100)), [0, 1, 1, 2, 2, 3, 3]);
});

test("une cible intacte ne fume pas ; plus elle est touchée, plus le panache est dense et haut", () => {
  assert.deepEqual(panache(0, 1, 500), []);
  const [leger, fort] = [panache(1, 1, 500), panache(3, 1, 500)];
  assert.ok(fort.length > leger.length);
  assert.ok(Math.max(...fort.map((b) => b.haut)) > Math.max(...leger.map((b) => b.haut)));
  assert.deepEqual(panache(2, 4, 1234), panache(2, 4, 1234));
  assert.ok(fort.every((b) => b.opacite >= 0 && b.opacite <= 1));
});

test("la radio dit le plus important du lot, et nomme chaque avion par son groupe et son rang", () => {
  const monde = simuler(scenario({"rouge.nombre": 100, "rouge.concentration_max": 50}), {registre: REGISTRE, journal: true});
  const second = monde.avions.find((a) => a.groupe === monde.avions[0].groupe && a.id > monde.avions[0].id);
  assert.match(indicatif(monde, monde.avions[0].id), /^Faucon 1$/);
  assert.match(indicatif(monde, second.id), /^Faucon 2$/);
  const lot = [{type: "detection", radar: 2}, {type: "contact", avion: 0, drone: 3}, {type: "impact", cible: 4}];
  assert.equal(message_du_lot(monde, lot), "Égide, à tous : impact sur C5.");
  assert.equal(message_du_lot(monde, lot.slice(0, 2)), "Faucon 1 : contact, j'engage.");
  assert.equal(message_du_lot(monde, [{type: "reseau", hs: []}]), null);
});

test("les sons d'un lot comptent impacts, tirs et destructions, et la radio seulement si elle parle", () => {
  const lot = [{type: "tir", detruit: true}, {type: "tir", detruit: false}, {type: "impact"}, {type: "detection"}];
  assert.deepEqual(sons_du_lot(lot), {impact: 1, eclat: 1, tir: 2, radio: 0});
  assert.equal(sons_du_lot([], true).radio, 1);
});
