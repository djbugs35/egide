// Caméras de la vue 3D et préparation hors ligne (MODELE § 23).
import assert from "node:assert/strict";
import test from "node:test";
import {tuile_du_point, tuiles_emprise} from "../outils/hors_ligne.js";
import {creer_monde} from "../src/moteur/monde.js";
import {positions_radars} from "../src/moteur/radars.js";
import {barycentre_essaim, consigne_camera, site_attaque} from "../src/vue/cameras3d.js";
import {REGISTRE, scenario} from "./aide_scenario.js";

const monde_lance = () => {
  const monde = creer_monde(scenario(), {registre: REGISTRE, journal: false});
  monde.t = Math.max(...monde.drones.map((d) => d.depart)) + 1;
  return monde;
};
const sans_drones = (monde) => monde.drones.forEach((d) => (d.vivant = false));

test("caméra : la caméra libre n'impose rien ; commandant et dessus sont des vues fixes", () => {
  const monde = monde_lance();
  assert.equal(consigne_camera("libre", monde, null), null);
  assert.equal(consigne_camera("commandant", monde, null).type, "fixe");
  assert.equal(consigne_camera("dessus", monde, null).inclinaison, -Math.PI / 2);
});

test("caméra : le suivi prend l'unité sélectionnée si elle vole, sinon le premier drone, sinon un avion", () => {
  const monde = monde_lance();
  assert.equal(consigne_camera("suivi", monde, "d5").geo, monde.drones[5].geo);
  assert.equal(consigne_camera("suivi", monde, "v0").geo, monde.avions[0].geo);
  assert.equal(consigne_camera("suivi", monde, "s0").geo, monde.drones[0].geo, "un site ne se suit pas");
  sans_drones(monde);
  assert.equal(consigne_camera("suivi", monde, null).geo, monde.avions[0].geo);
});

test("caméra radar : depuis le radar sélectionné, à hauteur de son mât, tournée vers l'essaim", () => {
  const monde = monde_lance();
  const consigne = consigne_camera("radar", monde, "r3");
  const radar = positions_radars(monde.scenario)[3];
  assert.equal(consigne.geo, radar);
  assert.equal(consigne.hauteur, radar.alt);
  assert.deepEqual(consigne.vers, barycentre_essaim(monde));
});

test("caméra site : depuis la cible que visent le plus de drones", () => {
  const monde = monde_lance();
  monde.drones.forEach((d) => (d.cible = 2));
  assert.equal(site_attaque(monde), 2);
  assert.equal(consigne_camera("site", monde, null).geo, monde.cibles[2].geo);
});

test("caméra site : sans drone en vol, la cible la plus frappée ; barycentre : le centre du théâtre", () => {
  const monde = monde_lance();
  sans_drones(monde);
  monde.fuites[1] = 40;
  assert.equal(site_attaque(monde), 1);
  assert.equal(barycentre_essaim(monde), monde.scenario.theatre.origine);
});

test("hors ligne : tuile d'un point connu, et emprise qui contient le centre à chaque zoom", () => {
  assert.deepEqual(tuile_du_point(0, 0, 1), {x: 1, y: 1});
  assert.deepEqual(tuile_du_point(47, 2.5, 10), {x: 519, y: 360});
  const tuiles = tuiles_emprise(47, 2.5, 100, 8, 9);
  for (const z of [8, 9]) {
    const centre = tuile_du_point(47, 2.5, z);
    assert.ok(tuiles.some((t) => t.z === z && t.x === centre.x && t.y === centre.y));
  }
  assert.ok(tuiles.filter((t) => t.z === 9).length > tuiles.filter((t) => t.z === 8).length);
});
