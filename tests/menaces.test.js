// Menaces multiples, SER et trajectoire balistique (MODELE § 27).
import assert from "node:assert/strict";
import test from "node:test";
import {geo_deg, vers_ecef} from "../src/moteur/geodesie.js";
import {horizon_radar} from "../src/moteur/geometrie.js";
import {couvertures} from "../src/moteur/couvertures.js";
import {creer_monde, simuler} from "../src/moteur/monde.js";
import {portee_contre_menace} from "../src/moteur/radars.js";
import {avancer} from "../algos/global/mouvement/balistique.js";
import {OUTILS} from "../src/moteur/outils.js";
import {REGISTRE, scenario} from "./aide_scenario.js";

const RADAR = {hauteur_antenne: 12, portee_max: 450_000, ser_reference_m2: 5};
const MISSILE = {unite: "vecteurs/drones/drone_reaction_notionnel", nombre: 1, cible: 0, depart_lat_deg: 47.0, depart_lon_deg: 0.5, altitude_m: 0, vitesse_kmh: 7200, ser_m2: 0.5, trajectoire: "balistique", apogee_km: 100};
const CHASSEURS = {unite: "vecteurs/avions/turbopropulseur_ir_notionnel", nombre: 3, cible: 1, depart_lat_deg: 49.0, depart_lon_deg: 2.0, altitude_m: 8000, vitesse_kmh: 900, ser_m2: 5, instant_s: 30};
const PETIT = {"rouge.nombre": 20, "bleu.sol.nombre": 0, "bleu.sol.munitions": 0};
const proche = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, `${a} loin de ${b}`);

test("SER : la portée instrumentée suit la racine quatrième de la SER", () => {
  proche(portee_contre_menace(RADAR, 20_000, 5), 450_000, 1e-6);
  proche(portee_contre_menace(RADAR, 20_000, 5 / 16), 225_000, 1e-6);
});

test("SER : sans SER de référence ou sans SER de la menace, la portée du catalogue s'applique", () => {
  assert.equal(portee_contre_menace({...RADAR, ser_reference_m2: null}, 20_000, 0.1), 450_000);
  assert.equal(portee_contre_menace(RADAR, 20_000, null), 450_000);
});

test("SER : l'horizon borne toujours la portée d'une menace basse", () => {
  proche(portee_contre_menace(RADAR, 100, 5), horizon_radar(12, 100), 1e-6);
});

test("arc balistique : apogée au milieu, sol aux deux bouts, arrivée signalée", () => {
  const depart = geo_deg(47, 0.5, 0);
  const but = geo_deg(48, 2, 0);
  const {distance: longueur, azimut_depart: cap} = OUTILS.inverse(depart, but);
  const mobile = {geo: depart, trajectoire: {depart, longueur, cap, apogee: 100_000}};
  const route = [{geo: but, ecef: vers_ecef(but)}];
  const milieu = avancer(mobile, route, longueur / 2, OUTILS);
  proche(milieu.geo.alt, 100_000, 1);
  assert.equal(milieu.atteints, 0);
  const fin = avancer(mobile, route, longueur * 2, OUTILS);
  proche(fin.geo.alt, 0, 1e-6);
  assert.equal(fin.atteints, 1);
});

test("groupes : ajoutés après l'essaim, ils ne changent pas le tirage de l'essaim", () => {
  const seul = creer_monde(scenario(PETIT), {registre: REGISTRE});
  const avec = creer_monde(scenario({...PETIT, "rouge.groupes": [MISSILE, CHASSEURS]}), {registre: REGISTRE});
  assert.equal(avec.drones.length, 24);
  assert.deepEqual(avec.drones.slice(0, 20).map((d) => d.geo), seul.drones.map((d) => d.geo));
  assert.deepEqual(avec.drones.slice(20).map((d) => [d.id, d.groupe, d.cible]), [[20, 0, 0], [21, 1, 1], [22, 1, 1], [23, 1, 1]]);
});

test("groupes : une cible inexistante est refusée à la résolution", () => {
  assert.throws(() => scenario({"rouge.groupes": [{...MISSILE, cible: 99}]}), /cible 99 inexistante/);
});

test("arc balistique : un chasseur au départ ne l'engage pas, il arrive au but", () => {
  const monde = simuler(scenario({...PETIT, "rouge.nombre": 1, "rouge.groupes": [MISSILE]}), {registre: REGISTRE, journal: false});
  assert.equal(monde.drones.at(-1).arrive, true);
});

const defense = (anti_balistique) => ({
  ...PETIT, "rouge.nombre": 1, "theatre.cibles_nombre": 1, "theatre.cibles_placees": [{lat_deg: 47, lon_deg: 2.5}], "bleu.avions.0.nombre": 0, "bleu.avions.1.nombre": 0,
  "rouge.groupes": [MISSILE],
  "bleu.sol.batteries": [{lat_deg: 47, lon_deg: 2.5, munitions: 50, surcharges: {pk: 1, anti_balistique}}],
});

test("arc balistique : un poste ordinaire ne tire pas, un poste anti-balistique l'abat", () => {
  assert.equal(simuler(scenario(defense(false)), {registre: REGISTRE, journal: false}).drones.at(-1).arrive, true);
  const abattu = simuler(scenario(defense(true)), {registre: REGISTRE, journal: false}).drones.at(-1);
  assert.equal(abattu.arrive, false);
  assert.equal(abattu.vivant, false);
});

test("couvertures : une portée par classe de menace, et la portée instrumentée", () => {
  const monde = creer_monde(scenario({...PETIT, "rouge.groupes": [CHASSEURS]}), {registre: REGISTRE});
  const {objets, classes} = couvertures(monde);
  assert.deepEqual(classes.map((c) => c.genre), ["menace_0", "menace_1"]);
  const radar = objets.find((o) => o.genre === "radar");
  assert.ok(radar.menace_1 > radar.menace_0, "un chasseur en altitude se voit de plus loin qu'un drone bas");
  assert.ok(radar.instrumentee >= radar.menace_1);
});
