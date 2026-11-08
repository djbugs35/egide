// Aides au déploiement (MODELE § 21.6) : règle, aimantation, aperçus avant pose, regroupement.
import assert from "node:assert/strict";
import test from "node:test";
import {direct, geo_deg, inverse} from "../src/moteur/geodesie.js";
import {horizon_radar} from "../src/moteur/geometrie.js";
import {aimanter, aimanter_grille, apercu_depot, apercu_liaison, mesure, points_geodesique, regrouper, texte_distance, texte_mesure} from "../src/vue/aides_edition.js";
import {FICHIERS} from "./aide_scenario.js";

const ORIGINE = geo_deg(47, 2.5);
const proche = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, `${a} loin de ${b}`);

test("règle : distance et cap géodésiques, vers le nord puis vers l'est", () => {
  const nord = mesure(ORIGINE, direct(ORIGINE, 0, 10_000));
  proche(nord.distance, 10_000, 0.01);
  proche(nord.cap_deg < 180 ? nord.cap_deg : nord.cap_deg - 360, 0, 1e-6);
  proche(mesure(ORIGINE, direct(ORIGINE, Math.PI / 2, 50_000)).cap_deg, 90, 1e-6);
  assert.equal(mesure(ORIGINE, ORIGINE).distance, 0);
});

test("règle : le texte donne l'unité adaptée et un cap sur trois chiffres", () => {
  assert.equal(texte_distance(850), "850 m");
  assert.equal(texte_distance(1234), "1,2 km");
  assert.equal(texte_distance(123_400), "123 km");
  assert.equal(texte_mesure({distance: 123_400, cap_deg: 45.2}), "123 km · cap 045°");
  assert.equal(texte_mesure({distance: 1000, cap_deg: 359.8}), "1,0 km · cap 000°");
});

test("règle : le tracé part de A, finit en B et reste sur la géodésique", () => {
  const b = direct(ORIGINE, 1, 200_000);
  const points = points_geodesique(ORIGINE, b, 10);
  assert.equal(points.length, 11);
  proche(inverse(points[10], b).distance, 0, 0.01);
  proche(inverse(ORIGINE, points[5]).distance, 100_000, 0.01);
});

test("aimantation grille : deux points d'une même maille donnent le même point, multiple du pas", () => {
  const point = (x, y) => direct(ORIGINE, Math.atan2(x, y), Math.hypot(x, y));
  const a = aimanter_grille(ORIGINE, point(10_400, 19_700), 5000);
  const b = aimanter_grille(ORIGINE, point(9_600, 20_300), 5000);
  proche(inverse(a, b).distance, 0, 0.01);
  proche(inverse(ORIGINE, a).distance, Math.hypot(10_000, 20_000), 0.01);
});

test("aimantation unités : la pose vient sur l'unité à moins de 12 px, sinon reste où on vise", () => {
  const unite = {geo: direct(ORIGINE, 0, 1000), cle: "radar:0"};
  const versEcran = () => ({x: 100, y: 100});
  const reglage = {type: "unites", elements: [unite], versEcran};
  assert.equal(aimanter(ORIGINE, {x: 105, y: 100}, reglage), unite.geo);
  assert.equal(aimanter(ORIGINE, {x: 150, y: 100}, reglage), ORIGINE);
  assert.equal(aimanter(ORIGINE, {x: 105, y: 100}, {type: "aucune"}), ORIGINE);
});

test("aperçu : portée d'un radar bornée par l'horizon, bulle d'une batterie, rien pour un avion ni une unité non chargée", () => {
  const radar = apercu_depot("capteurs/radars/radar_longue_portee_notionnel", FICHIERS, 100);
  proche(radar.rayon, Math.min(horizon_radar(40, 100), 400_000), 1e-6);
  assert.equal(apercu_depot("sites/postes/batterie_moyenne_portee_notionnelle", FICHIERS, 100).rayon, 25_000);
  assert.equal(apercu_depot("vecteurs/avions/turbopropulseur_ir_notionnel", FICHIERS, 100), null);
  assert.equal(apercu_depot("capteurs/radars/inconnu", FICHIERS, 100), null);
});

test("aperçu liaison : horizon radioélectrique depuis le mât ou l'altitude du groupe, rien pour le satellite", () => {
  const monde = {scenario: {avions: [{altitude: 1000}]}};
  const radio = "liaisons/radio_vhf_uhf_notionnelle";
  proche(apercu_liaison(monde, "radar:0", radio, FICHIERS), Math.min(400_000, horizon_radar(15, 15)), 1e-6);
  proche(apercu_liaison(monde, "avions:0", radio, FICHIERS), Math.min(400_000, horizon_radar(1000, 15)), 1e-6);
  assert.equal(apercu_liaison(monde, "radar:0", "liaisons/satellite_notionnelle", FICHIERS), null);
});

test("regroupement : les points proches forment un groupe compté à leur position moyenne ; un isolé n'en forme pas", () => {
  const groupes = regrouper([{x: 0, y: 0}, {x: 10, y: 0}, {x: 200, y: 200}, {x: 5, y: 6}], 14);
  assert.deepEqual(groupes, [{x: 5, y: 2, nombre: 3}]);
});
