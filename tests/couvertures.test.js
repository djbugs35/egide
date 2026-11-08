// Couvertures par objet et résultante des C2 (MODELE § 25).
import assert from "node:assert/strict";
import test from "node:test";
import {direct, geo_deg} from "../src/moteur/geodesie.js";
import {horizon_radar} from "../src/moteur/geometrie.js";
import {conduite_poste, conduite_vecteur, couvertures, enveloppe_poste, enveloppe_vecteur, rayon_dans, rayon_interception, surface_union} from "../src/moteur/couvertures.js";
import {bilan, creer_monde, simuler} from "../src/moteur/monde.js";
import {preparer_reseau} from "../src/moteur/reseau.js";
import {REGISTRE, scenario} from "./aide_scenario.js";

const PETIT = {"rouge.nombre": 150, "bleu.sol.nombre": 20, "bleu.sol.munitions": 200};
const raid = (m = {}) => bilan(simuler(scenario({...PETIT, ...m}), {registre: REGISTRE, journal: false}));
const monde = (m = {}) => creer_monde(scenario({...PETIT, ...m}), {registre: REGISTRE});
const proche = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, `${a} loin de ${b}`);
const FILAIRE = "liaisons/filaire_notionnelle";
const POSTE = {portee: 20_000, portee_conduite: 0, facteur_conduite: 1.5, hauteur_conduite: 10};

test("conduite : déclarée, elle prime ; sinon elle suit la portée de l'arme", () => {
  assert.equal(conduite_poste(POSTE), 30_000);
  assert.equal(conduite_poste({...POSTE, portee_conduite: 12_000}), 12_000);
  assert.equal(conduite_vecteur({portee_conduite: 0, facteur_conduite: 3, arme: {portee: 4000}}), 12_000);
});

test("bulle de tir d'un poste : bornée par l'arme, la conduite et l'horizon du capteur", () => {
  assert.equal(enveloppe_poste(POSTE, 100), 20_000);
  assert.equal(enveloppe_poste({...POSTE, portee_conduite: 5000}, 100), 5000);
  const loin = {...POSTE, portee: 200_000, facteur_conduite: 2};
  proche(enveloppe_poste(loin, 100), horizon_radar(10, 100), 1e-6);
});

test("vecteur : il tire au plus à la portée de son arme, ou de sa conduite si elle est plus courte", () => {
  assert.equal(enveloppe_vecteur({portee_conduite: 0, facteur_conduite: 3, arme: {portee: 4000}}), 4000);
  assert.equal(enveloppe_vecteur({portee_conduite: 2500, facteur_conduite: 3, arme: {portee: 4000}}), 2500);
});

test("moteur : une conduite qui porte plus loin que l'arme ne change pas le bilan", () => {
  assert.deepEqual(raid({"bleu.sol.surcharges.portee_conduite_km": 100}), raid());
});

test("moteur : un poste à la conduite plus courte que son arme abat moins de drones", () => {
  assert.ok(raid({"bleu.sol.surcharges.portee_conduite_km": 1}).detruits_sol < raid().detruits_sol);
});

test("moteur : un vecteur à la conduite très courte abat moins de drones", () => {
  const surcharges = {"bleu.avions.0.surcharges.portee_conduite_km": 0.2, "bleu.avions.1.surcharges.portee_conduite_km": 0.2};
  assert.ok(raid(surcharges).detruits_air < raid().detruits_air);
});

test("interception d'un vecteur : sa distance de tir, plus ce qu'il parcourt dans le délai disponible", () => {
  const s = scenario(PETIT);
  const [groupe] = s.avions;
  const reduit = {...s, conduite: {...s.conduite, delai_reaction: 1e9}};
  proche(rayon_interception(reduit, groupe), enveloppe_vecteur(groupe), 1e-6);
  assert.ok(rayon_interception(s, groupe) > enveloppe_vecteur(groupe) + groupe.vitesse_mise_a_poste);
});

test("objets : un radar détecte sans tirer, un poste et un vecteur tirent sans détecter", () => {
  const {objets} = couvertures(monde());
  const parGenre = (g) => objets.find((o) => o.genre === g);
  assert.ok(parGenre("radar").detection > 0 && parGenre("radar").interception === 0);
  assert.ok(parGenre("poste").interception > 0 && parGenre("poste").detection === 0);
  assert.ok(parGenre("vecteur").conduite > 0 && parGenre("vecteur").interception > parGenre("vecteur").conduite);
});

test("objets : les postes d'un même site n'en font qu'un, et un site sans munitions n'a plus de couverture", () => {
  const m = monde();
  const sites = () => couvertures(m).objets.filter((o) => o.genre === "poste");
  assert.equal(sites().length, m.cibles.length);
  m.postes.filter((p) => p.cible === 0).forEach((p) => (p.munitions = 0));
  assert.equal(sites().length, m.cibles.length - 1);
});

test("résultante : en réseau complet, le centre couvre tous les objets", () => {
  const {objets, c2} = couvertures(monde());
  assert.equal(c2[0].noeud, "conduite");
  assert.equal(c2[0].membres.length, objets.length);
});

test("résultante : seuls les objets reliés au centre y entrent", () => {
  const {objets, c2} = couvertures(monde({"bleu.reseau.mode": "liaisons", "bleu.reseau.liaisons": [{de: "radar:0", vers: "conduite", moyen: FILAIRE}, {de: "sol:1", vers: "conduite", moyen: FILAIRE}]}));
  assert.deepEqual(c2[0].membres.map((r) => objets[r].noeud).sort(), ["radar:0", "sol:1"]);
});

test("résultante : une liaison coupée retire aussitôt l'objet, et un centre hors service ne couvre plus rien", () => {
  const m = monde({"bleu.reseau.mode": "liaisons", "bleu.reseau.liaisons": [{de: "radar:0", vers: "conduite", moyen: FILAIRE}, {de: "radar:1", vers: "conduite", moyen: FILAIRE}]});
  const cibles = m.cibles.map((c) => c.geo);
  assert.equal(couvertures(m).c2[0].membres.length, 2);
  m.reseau = preparer_reseau(m.scenario, new Set(["liaison:0"]), cibles);
  assert.deepEqual(couvertures(m).c2[0].membres.map((r) => couvertures(m).objets[r].noeud), ["radar:1"]);
  m.reseau = preparer_reseau(m.scenario, new Set(["conduite"]), cibles);
  assert.deepEqual(couvertures(m).c2[0], {noeud: "conduite", nom: "CDC", hs: true, membres: []});
});

test("relief : la couverture d'un radar dépend de l'azimut sur un terrain, et jamais au-delà de sa portée", () => {
  const {objets} = couvertures(monde({"theatre.terrain": "terrains/crete_notionnelle"}));
  const radar = objets.find((o) => o.genre === "radar");
  assert.equal(radar.profil.length, 360);
  assert.ok(radar.profil.every((_, a) => rayon_dans(radar, "detection", ((a + 0.5) * Math.PI) / 180) <= radar.detection));
  assert.equal(rayon_dans({detection: 100, conduite: 0, profil: null}, "detection", 1), 100);
  assert.equal(rayon_dans({detection: 100, conduite: 0, profil: Array(360).fill(40)}, "detection", 1), 40);
});

test("surface : un disque seul donne π r², et deux disques confondus ne comptent qu'une fois", () => {
  const origine = geo_deg(47, 2.5);
  const objet = {geo: origine, detection: 50_000, profil: null};
  const attendue = Math.PI * 50_000 ** 2;
  proche(surface_union([objet], "detection", origine), attendue, attendue * 0.01);
  proche(surface_union([objet, {...objet}], "detection", origine), attendue, attendue * 0.01);
});

test("surface : deux disques disjoints s'additionnent ; sans objet, elle est nulle", () => {
  const origine = geo_deg(47, 2.5);
  const a = {geo: origine, detection: 30_000, profil: null};
  const b = {...a, geo: direct(origine, 1, 200_000)};
  const attendue = 2 * Math.PI * 30_000 ** 2;
  proche(surface_union([a, b], "detection", origine), attendue, attendue * 0.02);
  assert.equal(surface_union([], "detection", origine), 0);
});
