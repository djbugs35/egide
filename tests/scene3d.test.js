// Contenu de la vue 3D (MODELE § 23) : mêmes positions que le moteur, mêmes calques que la 2D, relief décodé.
import assert from "node:assert/strict";
import test from "node:test";
import {vers_degres} from "../src/moteur/geodesie.js";
import {creer_monde} from "../src/moteur/monde.js";
import {calques_par_defaut} from "../src/vue/calques.js";
import {entite_depuis_id, entites_scene, fenetre_tuile, grille_hauteurs, hauteur_terrarium, id_depuis_inspection} from "../src/vue/scene3d.js";
import {REGISTRE, scenario} from "./aide_scenario.js";

const monde_lance = () => {
  const monde = creer_monde(scenario(), {registre: REGISTRE, journal: false});
  monde.t = Math.max(...monde.drones.map((d) => d.depart)) + 1;
  return monde;
};

test("scène 3D : un drone est au point et à l'altitude du moteur", () => {
  const monde = monde_lance();
  const {drones} = entites_scene(monde, calques_par_defaut());
  const source = monde.drones[Number(drones[0].id.slice(1))];
  assert.equal(drones.length, monde.drones.length);
  assert.equal(drones[0].lat_deg, vers_degres(source.geo.lat));
  assert.equal(drones[0].lon_deg, vers_degres(source.geo.lon));
  assert.equal(drones[0].alt, source.geo.alt);
});

test("scène 3D : avions à leur altitude, unités au sol posées, radars sur leur mât", () => {
  const monde = monde_lance();
  const {unites} = entites_scene(monde, calques_par_defaut());
  assert.equal(unites.find((u) => u.id === "v0").alt, monde.avions[0].geo.alt);
  assert.equal(unites.find((u) => u.id === "v0").sol, false);
  const radar = unites.find((u) => u.id === "r0");
  assert.ok(radar.sol && radar.alt > 0, "un radar est posé au sol, en haut de son mât");
  assert.equal(unites.find((u) => u.id === "s0").alt, 0);
});

test("scène 3D : un calque masqué en 2D l'est aussi en 3D, et la vue du CDC restreint les drones", () => {
  const monde = monde_lance();
  const calques = {...calques_par_defaut(), radars: false, drones_inconnus: false, drones_detectes: false};
  const scene = entites_scene(monde, calques);
  assert.equal(scene.drones.length, 0);
  assert.ok(!scene.unites.some((u) => u.id.startsWith("r")));
  assert.equal(entites_scene(monde, calques_par_defaut(), () => false).drones.length, 0);
});

test("relief : décodage terrarium, altitude 0 et altitude connue", () => {
  assert.equal(hauteur_terrarium(128, 0, 0), 0);
  assert.equal(hauteur_terrarium(131, 232, 128), 1000.5);
});

test("relief : au-delà du zoom maximal, on lit une portion de la dernière tuile existante", () => {
  assert.deepEqual(fenetre_tuile(5, 9, 3, 15), {z: 3, x: 5, y: 9, echelle: 1, dx: 0, dy: 0});
  assert.deepEqual(fenetre_tuile(11, 6, 4, 3), {z: 3, x: 5, y: 3, echelle: 2, dx: 1, dy: 0});
});

test("relief : la grille reprend les pixels aux coins de la tuile", () => {
  const cote = 2;
  const rgba = new Uint8Array([128, 0, 0, 255, 128, 10, 0, 255, 128, 20, 0, 255, 128, 30, 0, 255]);
  assert.deepEqual([...grille_hauteurs(rgba, cote, 2, {echelle: 1, dx: 0, dy: 0})], [0, 10, 20, 30]);
});

test("scène 3D : le cap d'un drone vise le prochain point de sa route", () => {
  const monde = monde_lance();
  const drone = monde.drones[0];
  drone.geo = {lat: 0.8, lon: 0.04, alt: 100};
  drone.route = [{geo: {lat: 0.81, lon: 0.04, alt: 100}}];
  assert.equal(entites_scene(monde, calques_par_defaut()).drones.find((d) => d.id === "d0").cap, 0);
  drone.route = [];
  assert.equal(entites_scene(monde, calques_par_defaut()).drones.find((d) => d.id === "d0").cap, 0);
});

test("inspection 3D : un identifiant de scène redonne l'entité, et l'inspection redonne l'identifiant", () => {
  const monde = monde_lance();
  assert.equal(entite_depuis_id(monde, "d3").objet, monde.drones[3]);
  assert.equal(entite_depuis_id(monde, "v0").objet, monde.avions[0]);
  assert.deepEqual([entite_depuis_id(monde, "s1").type, entite_depuis_id(monde, "s1").indice], ["cible", 1]);
  assert.equal(entite_depuis_id(monde, "r2").indice, 2);
  assert.equal(entite_depuis_id(monde, "c0").type, "conduite");
  assert.equal(entite_depuis_id(monde, "b0"), null);
  assert.equal(entite_depuis_id(monde, null), null);
  for (const [inspection, id] of [[{type: "drone", id: 3}, "d3"], [{type: "avion", id: 0}, "v0"], [{type: "cible", id: 1}, "s1"], [{type: "radar", id: 2}, "r2"], [{type: "conduite", id: 0}, "c0"], [{type: "centre", id: 0}, "c1"]]) {
    assert.equal(id_depuis_inspection(inspection), id);
  }
  assert.equal(id_depuis_inspection(null), null);
});
