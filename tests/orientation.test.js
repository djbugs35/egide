// Orientation des objets selon leur déplacement (docs/PLAN_JEU.md, étape 2 ; MODELE § 23).
import assert from "node:assert/strict";
import test from "node:test";
import {direct, geo_deg, vers_degres} from "../src/moteur/geodesie.js";
import {cap_drone} from "../src/moteur/menace.js";
import {simuler} from "../src/moteur/monde.js";
import {creer_camera} from "../src/vue/camera.js";
import {rotation_ecran} from "../src/vue/ecran.js";
import {REGISTRE, scenario} from "./aide_scenario.js";

const ORIGINE = geo_deg(47, 2.5);
const CAMERA = creer_camera(1000, 1000, 200_000, ORIGINE);
const proche = (a, b, tolerance = 0.02) => assert.ok(Math.abs(a - b) <= tolerance, `${a} loin de ${b}`);
const QUART = Math.PI / 2;

test("écran : au centre du scope, nord vers le haut, est vers la droite, sud retourné, ouest vers la gauche", () => {
  proche(rotation_ecran(CAMERA, ORIGINE, 0), 0);
  proche(rotation_ecran(CAMERA, ORIGINE, QUART), QUART);
  proche(Math.abs(rotation_ecran(CAMERA, ORIGINE, Math.PI)), Math.PI);
  proche(rotation_ecran(CAMERA, ORIGINE, -QUART), -QUART);
});

test("écran : loin du centre du scope, la rotation suit le méridien projeté, qui n'est plus vertical", () => {
  const est = direct(ORIGINE, QUART, 150_000);
  assert.ok(Math.abs(rotation_ecran(CAMERA, est, 0)) > 0.005);
});

test("écran : une carte tournée de 90° fait tourner la silhouette d'autant, en sens inverse", () => {
  // Carte dont le haut est l'est : un point plus au nord apparaît à gauche.
  const carte = {type: "carte", carte: {project: ([lon, lat]) => ({x: -(lat - 47) * 1e4, y: -(lon - 2.5) * 1e4})}};
  proche(rotation_ecran(carte, ORIGINE, 0), -QUART);
  proche(rotation_ecran(carte, ORIGINE, QUART), 0);
});

test("écran : la carte inclinée écrase le nord à l'écran, sans changer le sens de la silhouette", () => {
  const carte = {type: "carte", carte: {project: ([lon, lat]) => ({x: (lon - 2.5) * 1e4, y: -(lat - 47) * 3e3})}};
  proche(rotation_ecran(carte, ORIGINE, 0), 0);
  assert.ok(rotation_ecran(carte, ORIGINE, Math.PI / 4) > Math.PI / 4);
});

test("drone : le cap vise le prochain point de sa route ; sans route, il vaut zéro", () => {
  const route = [{geo: direct(ORIGINE, 1.2, 50_000)}];
  proche(cap_drone({geo: ORIGINE, route}), 1.2, 0.01);
  assert.equal(cap_drone({geo: ORIGINE, route: []}), 0);
});

test("vecteur : le cap commence au nord, puis suit ses déplacements", () => {
  const monde = simuler(scenario({"rouge.nombre": 50, "bleu.sol.nombre": 10, "bleu.sol.munitions": 50}), {registre: REGISTRE, journal: false, observer: (m) => {
    if (m.t === 0) assert.ok(m.avions.every((a) => a.cap === 0));
  }});
  assert.ok(monde.avions.some((a) => a.cap !== 0), "au moins un vecteur a bougé");
  assert.ok(monde.avions.every((a) => Number.isFinite(vers_degres(a.cap))));
});
