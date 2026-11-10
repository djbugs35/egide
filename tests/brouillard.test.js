// Brouillard de guerre de la vue du CDC (MODELE § 31).
import assert from "node:assert/strict";
import test from "node:test";
import {distance_horizontale} from "../src/moteur/geodesie.js";
import {simuler} from "../src/moteur/monde.js";
import {PERIODE_PISTE, piste} from "../src/vue/brouillard.js";
import {creer_traces, echantillonner} from "../src/vue/traces.js";
import {REGISTRE, scenario} from "./aide_scenario.js";

const plots = [{lat: 0.82, lon: 0.04, t: 100}, {lat: 0.8201, lon: 0.0401, t: 104}, {lat: 0.8202, lon: 0.0402, t: 108}, {lat: 0.8203, lon: 0.0403, t: 112}];

test("un drone que la conduite ne connaît pas, ou sans plot, n'a pas de piste", () => {
  assert.equal(piste({id: 1, connu: null}, plots, 110, 200), null);
  assert.equal(piste({id: 1, connu: 100}, [], 110, 200), null);
});

test("la piste reste figée entre deux mises à jour et bouge à la suivante", () => {
  const drone = {id: 7, connu: 100};
  const debut = piste(drone, plots, 100, 200);
  assert.deepEqual(piste(drone, plots, 100 + PERIODE_PISTE - 0.5, 200).geo, debut.geo);
  assert.notDeepEqual(piste(drone, plots, 100 + PERIODE_PISTE, 200).geo, debut.geo);
  assert.ok(piste(drone, plots, 109, 200).rayon > debut.rayon, "l'incertitude grossit avec l'âge du plot");
});

test("tout au long d'un raid, chaque drone connu de l'essaim reste dans le cercle d'incertitude de sa piste", () => {
  const traces = creer_traces();
  let ecart_max = 0;
  simuler(scenario({"rouge.nombre": 60, "rouge.concentration_max": 20}), {registre: REGISTRE, journal: false, observer: (monde) => {
    echantillonner(traces, monde);
    for (const drone of monde.drones) {
      if (!drone.vivant || drone.arrive || drone.connu === null || drone.connu > monde.t) continue;
      const suivie = piste(drone, traces.plots.get(drone.id), monde.t, monde.scenario.rouge.vitesse);
      if (suivie) ecart_max = Math.max(ecart_max, distance_horizontale(drone.geo, suivie.geo) - suivie.rayon);
    }
  }});
  assert.ok(ecart_max <= 1, `un drone sort de son cercle de ${ecart_max.toFixed(0)} m`);
});
