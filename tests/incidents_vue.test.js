// Récit et tirage des incidents de scénario (MODELE § 29).
import assert from "node:assert/strict";
import test from "node:test";
import {modifier_scenario} from "../src/moteur/scenario.js";
import {generer_incidents, recit_incident} from "../src/vue/incidents.js";
import {REFERENCE, scenario} from "./aide_scenario.js";

const monde = {scenario: {reseau: {centres: []}, sol: {batteries: []}}};

test("le tirage des incidents se rejoue à l'identique pour une graine, et change avec elle", () => {
  const tirer = (graine) => generer_incidents(REFERENCE, 10, 1200, graine);
  assert.deepEqual(tirer(42), tirer(42));
  assert.notDeepEqual(tirer(42), tirer(43));
});

test("les incidents tirés s'ajoutent aux pannes existantes et forment un scénario valide", () => {
  const existante = {t_s: 60, element: "radar:0", duree_s: null};
  const brut = modifier_scenario(REFERENCE, {"bleu.reseau.pannes": [existante]});
  const mods = generer_incidents(brut, 10, 1200, 7, 4);
  const pannes = mods["bleu.reseau.pannes"];
  assert.equal(pannes.length, 5);
  assert.deepEqual(pannes[0], existante);
  assert.equal(new Set(pannes.slice(1).map((p) => p.element)).size, 4, "un élément ne reçoit qu'un incident du tirage");
  assert.ok(pannes.slice(1).every((p) => p.t_s >= 120 && p.t_s <= 840 && p.duree_s >= 10));
  assert.doesNotThrow(() => scenario(mods));
});

test("le récit d'un incident dit l'élément, la cause, l'effet et l'échéance, puis la fin", () => {
  const debut = {element: "radar:2", cause: "meteo", portee: 0.5, fin: 900, debut: true};
  assert.equal(recit_incident(monde, debut), "R3 : météo, portée réduite à 50 % jusqu'à 15 min.");
  assert.equal(recit_incident(monde, {...debut, debut: false}), "R3 : fin de météo, de nouveau à pleine portée.");
  assert.equal(recit_incident(monde, {element: "liaison:0", cause: "coupure", portee: null, fin: null, debut: true}), "La liaison 1 : coupure de transmission, hors service jusqu'à nouvel ordre.");
});
