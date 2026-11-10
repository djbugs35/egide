// Mise en scène : dégâts, radio, sons (MODELE § 30).
import assert from "node:assert/strict";
import test from "node:test";
import {simuler} from "../src/moteur/monde.js";
import {niveau_degats, panache} from "../src/vue/ambiance.js";
import {indicatif, message_du_lot} from "../src/vue/radio.js";
import {sons_du_lot} from "../src/vue/sons.js";
import {calculer_banque, encoder_wav, FREQUENCE} from "../outils/sons/generer.js";
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

test("les bruitages d'un lot distinguent impacts, départs sol et air, interceptions, alertes ; la radio seulement si elle parle", () => {
  const lot = [{type: "tir", couche: "sol", detruit: true}, {type: "tir", couche: "air", detruit: false}, {type: "impact"}, {type: "detection"},
    {type: "incident", debut: true}, {type: "incident", debut: false}];
  assert.deepEqual(sons_du_lot(lot), {explosion: 1, interception: 1, lancement: 1, roquette: 1, radio: 0, alerte: 1});
  assert.equal(sons_du_lot([], true).radio, 1);
});

test("la banque de bruitages se recalcule à l'identique, sans valeur hors de [-1, 1], en WAV valide", () => {
  const [a, b] = [calculer_banque(), calculer_banque()];
  assert.deepEqual(Object.keys(a), ["explosion", "interception", "lancement", "roquette", "radio", "alerte"]);
  for (const sorte of Object.keys(a)) {
    assert.deepEqual(a[sorte][0].slice(0, 2000), b[sorte][0].slice(0, 2000));
    assert.ok(a[sorte].every((s) => s.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)), sorte);
  }
  const wav = encoder_wav(a.radio[0]);
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), "RIFF");
  assert.equal(new DataView(wav.buffer).getUint32(24, true), FREQUENCE);
  assert.equal(wav.length, 44 + a.radio[0].length * 2);
});
