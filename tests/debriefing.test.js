// Débriefing de fin de raid (MODELE § 28).
import assert from "node:assert/strict";
import test from "node:test";
import {simuler} from "../src/moteur/monde.js";
import {cause_frappe, debriefer, note_defense} from "../src/vue/debriefing.js";
import {REGISTRE, scenario} from "./aide_scenario.js";

const PETIT = {"rouge.nombre": 200, "rouge.concentration_max": 50};
const SANS_DEFENSE = {"bleu.avions.0.nombre": 0, "bleu.avions.1.nombre": 0, "bleu.sol.nombre": 0};
const raid = (modifications) => simuler(scenario({...PETIT, ...modifications}), {registre: REGISTRE, journal: true});

test("la note suit le barème du taux d'interception, seuils compris", () => {
  assert.deepEqual([1, 0.95, 0.9, 0.85, 0.7, 0.69, 0.5, 0.2].map(note_defense), ["A", "A", "B", "B", "C", "D", "D", "E"]);
});

test("une frappe reçoit la première cause qui s'applique", () => {
  assert.equal(cause_frappe({detection: null, connu: null}, 3), "non_detectee");
  assert.equal(cause_frappe({detection: 10, connu: null}, 3), "inconnue");
  assert.equal(cause_frappe({detection: 10, connu: 12}, 0), "jamais_engagee");
  assert.equal(cause_frappe({detection: 10, connu: 12}, 2), "manquee");
});

test("les comptes du débriefing se recoupent : menaces, frappes par cible et par cause, tirs par tireur", () => {
  const monde = raid({});
  const d = debriefer(monde);
  assert.equal(d.interceptees + d.frappes, d.menaces);
  assert.equal(d.cibles.reduce((s, c) => s + c.frappes, 0), d.frappes);
  assert.equal(Object.values(d.causes).reduce((s, n) => s + n, 0), d.frappes);
  // Un tir dont la cible est déjà tombée entre-temps est compté mais pas journalisé : le journal en voit au plus autant.
  const journalises = d.tireurs.reduce((s, t) => s + t.tirs, 0);
  assert.ok(journalises > 0 && journalises <= monde.compteurs.tirs_air + monde.compteurs.tirs_sol);
  assert.equal(d.chronologie.reduce((s, c) => s + c.frappes, 0), d.frappes);
  assert.ok(d.points_faibles.length <= 5);
});

test("sans défense, rien n'est intercepté, la note est E et aucune frappe n'est dite manquée", () => {
  const d = debriefer(raid(SANS_DEFENSE));
  assert.equal(d.interceptees, 0);
  assert.equal(d.note, "E");
  assert.equal(d.causes.manquee, 0);
  assert.equal(d.tireurs.length, 0);
});

test("radars en panne dès le départ : toutes les frappes sont non détectées et chaque radar est signalé muet", () => {
  const pannes = Array.from({length: 10}, (_, i) => ({t_s: 0, element: `radar:${i}`, duree_s: null}));
  const d = debriefer(raid({...SANS_DEFENSE, "bleu.reseau.pannes": pannes}));
  assert.equal(d.causes.non_detectee, d.frappes);
  assert.ok(d.radars.every((r) => r.detections === 0));
  assert.match(d.points_faibles.join(" "), /100 % des frappes : non détectée/);
});
