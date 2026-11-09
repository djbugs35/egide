// Contenu de la vue 3D (MODELE § 23) : mêmes positions que le moteur, mêmes calques que la 2D, relief décodé.
import assert from "node:assert/strict";
import test from "node:test";
import {geo_deg, inverse, vers_degres} from "../src/moteur/geodesie.js";
import {horizon_radar} from "../src/moteur/geometrie.js";
import {portee_site} from "../src/moteur/radars.js";
import {creer_monde} from "../src/moteur/monde.js";
import {calques_par_defaut} from "../src/vue/calques.js";
import {bulles_scene, couvertures_scene, liaisons_scene, entite_depuis_id, entites_scene, fenetre_tuile, grille_hauteurs, hauteur_terrarium, id_depuis_inspection, metres_par_pixel_tuile, ombrage_tuile} from "../src/vue/scene3d.js";
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

const SITES = [{lat_deg: 48.2, lon_deg: 2.5}, {lat_deg: 46, lon_deg: 2.5}];

test("couverture 3D : à la hauteur de l'essaim, chaque contour est à la portée du moteur ; plus haut, à l'horizon borné", () => {
  const monde = creer_monde(scenario({"bleu.radar.disposition": "sites", "bleu.radar.sites": SITES}), {registre: REGISTRE, journal: false});
  const volumes = couvertures_scene(monde);
  assert.equal(volumes.length, 2);
  const site = monde.couverture.sites[0];
  const distance = (point) => inverse(site.geo, geo_deg(point.lat_deg, point.lon_deg, 0)).distance;
  const [bas, haut] = volumes[0].niveaux;
  assert.equal(bas.hauteur, monde.scenario.rouge.altitude);
  assert.ok(Math.abs(distance(bas.contour[10]) - portee_site(monde.scenario, 0)) < 1);
  const {hauteur_antenne: mat, portee_max: maximale} = monde.scenario.radar;
  assert.ok(Math.abs(distance(haut.contour[10]) - Math.min(horizon_radar(mat, haut.hauteur), maximale)) < 1);
  assert.equal(couvertures_scene(monde), volumes, "gardés pour un même scénario");
});

test("couverture 3D : en disposition frontière, un seul contour au rayon de détection", () => {
  const monde = monde_lance();
  const [volume, ...autres] = couvertures_scene(monde);
  assert.equal(autres.length, 0);
  assert.equal(volume.id, "frontiere");
  const point = volume.niveaux[0].contour[0];
  assert.ok(Math.abs(inverse(monde.scenario.theatre.origine, geo_deg(point.lat_deg, point.lon_deg, 0)).distance - monde.rayonDetection) < 1);
});

test("bulles 3D : une par cible défendue, de la portée du moteur, pleine au départ, et moins pleine sans munitions", () => {
  const monde = monde_lance();
  const bulles = bulles_scene(monde);
  assert.equal(bulles[0].rayon, monde.scenario.sol.portee);
  assert.ok(Math.abs(bulles[0].part - 1) < 0.05);
  for (const p of monde.postes) p.munitions = 0;
  assert.equal(bulles_scene(monde)[0].part, 0);
});

test("liaisons 3D : réseau complet, chaque radar relié au CDC à sa position ; un satellite monte et redescend", () => {
  const monde = monde_lance();
  const liaisons = liaisons_scene(monde);
  assert.equal(liaisons.length, monde.reseau.radars.length + monde.reseau.centres.length - 1);
  assert.equal(liaisons[0].points[0].lat_deg, vers_degres(monde.reseau.radars[0].lat));
  assert.equal(liaisons[0].points.length, 2);
  const avecSatellite = creer_monde(scenario({"bleu.reseau.mode": "liaisons", "bleu.reseau.liaisons": [{de: "radar:0", vers: "conduite", moyen: "liaisons/satellite_notionnelle"}]}), {registre: REGISTRE, journal: false});
  const satellite = liaisons_scene(avecSatellite).find((l) => l.type === "satellite");
  assert.equal(satellite.points.length, 3);
  assert.ok(satellite.points[1].alt > 100_000);
});

/** Rendre une tuile terrarium carrée dont l'altitude de chaque pixel vaut `altitude(ligne, colonne)` (m). */
function tuile_terrarium(cote, altitude) {
  const rgba = new Uint8ClampedArray(cote * cote * 4).fill(255);
  for (let ligne = 0; ligne < cote; ligne++) {
    for (let colonne = 0; colonne < cote; colonne++) {
      const code = Math.round(altitude(ligne, colonne)) + 32768;
      rgba.set([code >> 8, code & 255, 0], 4 * (ligne * cote + colonne));
    }
  }
  return rgba;
}

test("la grille de hauteurs ramène le fond marin au niveau de la mer", () => {
  const rgba = tuile_terrarium(2, (ligne) => (ligne === 0 ? -4000 : 300));
  assert.deepEqual([...grille_hauteurs(rgba, 2, 2, {echelle: 1, dx: 0, dy: 0})], [0, 0, 300, 300]);
});

test("l'ombrage laisse un terrain plat transparent", () => {
  const sortie = ombrage_tuile(tuile_terrarium(4, () => 500), 4, 30);
  assert.ok(sortie.every((_, i) => i % 4 !== 3 || sortie[i] === 0));
});

test("l'ombrage assombrit un versant au sud-est et éclaire un versant au nord-ouest", () => {
  // Le sol monte vers l'est puis redescend : à l'ouest de la crête, le versant regarde la lumière ; à l'est, il lui tourne le dos.
  const sortie = ombrage_tuile(tuile_terrarium(9, (_, colonne) => 400 - 50 * Math.abs(colonne - 4)), 9, 30);
  const pixel = (colonne) => sortie.subarray(4 * (4 * 9 + colonne), 4 * (4 * 9 + colonne) + 4);
  assert.equal(pixel(2)[0], 255);
  assert.equal(pixel(6)[0], 0);
  assert.ok(pixel(2)[3] > 0 && pixel(6)[3] > 0);
});

test("la taille d'un pixel de tuile vaut 156 km au zoom 0, côté de 256 pixels, à l'équateur", () => {
  assert.ok(Math.abs(metres_par_pixel_tuile(0, 0, 256) - 156_543) < 1);
});
