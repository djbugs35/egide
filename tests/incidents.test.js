// Incidents de scénario : cause, portée réduite d'un radar, batterie hors service, récit au journal (MODELE § 29).
import assert from "node:assert/strict";
import test from "node:test";
import {simuler} from "../src/moteur/monde.js";
import {ScenarioInvalide} from "../src/moteur/scenario.js";
import {REGISTRE, scenario} from "./aide_scenario.js";

const PETIT = {"rouge.nombre": 200, "rouge.concentration_max": 50};
const SANS_AVIONS = {"bleu.avions.0.nombre": 0, "bleu.avions.1.nombre": 0};
const raid = (modifications) => simuler(scenario({...PETIT, ...modifications}), {registre: REGISTRE, journal: true});
const pour_tous_les_radars = (panne) => Array.from({length: 10}, (_, i) => ({t_s: 0, element: `radar:${i}`, duree_s: null, ...panne}));
const detection_moyenne = (monde) => {
  const vus = monde.drones.filter((d) => d.detection !== null);
  return vus.reduce((s, d) => s + d.detection - d.depart, 0) / vus.length;
};

test("un radar à portée réduite voit encore, mais plus tard qu'en service normal", () => {
  const normal = raid({});
  const brume = raid({"bleu.reseau.pannes": pour_tous_les_radars({cause: "meteo", portee: 0.6})});
  assert.ok(brume.drones.some((d) => d.detection !== null), "le radar dégradé reste en service");
  assert.ok(detection_moyenne(brume) > detection_moyenne(normal));
});

test("une batterie sous incident ne tire pas, et tire de nouveau une fois l'incident fini", () => {
  const batterie = {"bleu.sol.nombre": 0, "bleu.sol.munitions": 0, "bleu.sol.batteries": [{lat_deg: 47, lon_deg: 2.5, munitions: 400}], ...SANS_AVIONS};
  const tirs = (monde) => monde.evenements.filter((e) => e.type === "tir" && e.couche === "sol").map((e) => e.t);
  const libre = tirs(raid(batterie));
  assert.ok(libre.length > 0, "sans incident, la batterie tire");
  const coupee = tirs(raid({...batterie, "bleu.reseau.pannes": [{t_s: 0, element: "batterie:0", cause: "maintenance", duree_s: null}]}));
  assert.equal(coupee.length, 0);
  const debut = Math.min(...libre);
  const reprise = tirs(raid({...batterie, "bleu.reseau.pannes": [{t_s: 0, element: "batterie:0", duree_s: debut + 60}]}));
  assert.ok(reprise.length > 0 && Math.min(...reprise) >= debut + 60);
});

test("chaque incident s'inscrit au journal à son début et à sa fin, avec sa cause", () => {
  const monde = raid({"bleu.reseau.pannes": [{t_s: 0, element: "radar:2", cause: "maintenance", duree_s: 300}, {t_s: 120, element: "radar:4", cause: "meteo", portee: 0.6, duree_s: null}]});
  const recits = monde.evenements.filter((e) => e.type === "incident").map((e) => [e.element, e.cause, e.debut, e.t]);
  assert.deepEqual(recits, [["radar:2", "maintenance", true, 0.5], ["radar:4", "meteo", true, 120], ["radar:2", "maintenance", false, 300]]);
});

test("une cause inconnue, ou une portée réduite hors radar ou hors ]0, 1[, est refusée", () => {
  assert.throws(() => scenario({"bleu.reseau.pannes": [{t_s: 0, element: "radar:0", cause: "ovni", duree_s: null}]}), ScenarioInvalide);
  assert.throws(() => scenario({"bleu.reseau.pannes": [{t_s: 0, element: "conduite", portee: 0.5, duree_s: null}]}), ScenarioInvalide);
  assert.throws(() => scenario({"bleu.reseau.pannes": [{t_s: 0, element: "radar:0", portee: 1, duree_s: null}]}), ScenarioInvalide);
});
