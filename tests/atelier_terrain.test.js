// Édition du relief (docs/FORMATS.md § 10.5) : pinceaux, historique, fichier écrit lisible par le moteur.
import assert from "node:assert/strict";
import test from "node:test";
import {masques_radars} from "../src/moteur/reseau.js";
import {en_v2, modifier_scenario, resoudre_scenario} from "../src/moteur/scenario.js";
import {altitude_sol, grille_terrain} from "../src/moteur/terrain.js";
import {FICHIERS, REFERENCE} from "./aide_scenario.js";
import {appliquer_pinceau, creer_atelier_terrain, encoder_altitudes, grille_depuis_unite, grille_plate, message_terrain, unite_de_grille} from "../src/serveur/atelier_terrain.js";

const plate = () => grille_plate({lat_deg: 47, lon_deg: 2.5, rayon_km: 20, pas_km: 1});
const CENTRE = {lat_deg: 47, lon_deg: 2.5};
const valeur = (g, i, j) => g.z[i * g.colonnes + j];

test("pinceau élever : maximal au centre, nul au bord, le rectangle rendu couvre ce qui a changé", () => {
  const g = plate();
  const r = appliquer_pinceau(g, {outil: "elever", ...CENTRE, rayon_m: 5000, force_m: 100});
  const c = 20;
  assert.equal(valeur(g, c, c), 100);
  assert.ok(valeur(g, c, c + 3) > 0 && valeur(g, c, c + 3) < 100);
  assert.equal(valeur(g, c, c + 8), 0);
  for (let i = 0; i < g.lignes; i++) for (let j = 0; j < g.colonnes; j++) {
    if (valeur(g, i, j)) assert.ok(i >= r.i0 && i < r.i0 + r.lignes && j >= r.j0 && j < r.j0 + r.colonnes);
  }
});

test("pinceau abaisser, puis altitude bornée : un pinceau ne creuse pas sans fin", () => {
  const g = plate();
  for (let k = 0; k < 20; k++) appliquer_pinceau(g, {outil: "abaisser", ...CENTRE, rayon_m: 3000, force_m: 100});
  assert.equal(valeur(g, 20, 20), -500);
});

test("pinceau aplanir : rapproche de la hauteur visée ; lisser : réduit un pic isolé", () => {
  const g = plate();
  g.z.fill(100);
  for (let k = 0; k < 30; k++) appliquer_pinceau(g, {outil: "aplanir", ...CENTRE, rayon_m: 5000, force_m: 1, cible: 300});
  assert.ok(Math.abs(valeur(g, 20, 20) - 300) <= 2);
  const h = plate();
  h.z[20 * h.colonnes + 20] = 1000;
  appliquer_pinceau(h, {outil: "lisser", ...CENTRE, rayon_m: 5000, force_m: 1});
  assert.ok(valeur(h, 20, 20) < 1000);
  assert.ok(valeur(h, 20, 21) > 0);
});

test("pinceau hors de la grille : rien ne change, rien n'est rendu", () => {
  const g = plate();
  assert.equal(appliquer_pinceau(g, {outil: "elever", lat_deg: 60, lon_deg: 2.5, rayon_m: 1000, force_m: 10}), null);
  assert.ok(g.z.every((a) => a === 0));
});

test("aller-retour : le fichier écrit se relit à l'identique, et le moteur y lit l'altitude retouchée", () => {
  const g = plate();
  appliquer_pinceau(g, {outil: "elever", ...CENTRE, rayon_m: 5000, force_m: 250});
  const unite = unite_de_grille(g, "essai", "un terrain plat");
  assert.deepEqual(grille_depuis_unite(unite).z, g.z);
  assert.equal(unite.fidelite, "notionnel");
  assert.ok(unite.sources.length);
  const DEG = Math.PI / 180;
  const resolu = {id: "essai_lecture", altitudes_b64: unite.altitudes_b64, lat_sud: g.lat_sud_deg * DEG, lon_ouest: g.lon_ouest_deg * DEG, pas_lat: g.pas_lat_deg * DEG, pas_lon: g.pas_lon_deg * DEG, lignes: g.lignes, colonnes: g.colonnes, pas: 1000};
  assert.ok(Math.abs(altitude_sol(grille_terrain(resolu), {lat: 47 * DEG, lon: 2.5 * DEG}) - 250) < 1);
});

test("cache du moteur : un terrain retouché de même identifiant et de même taille est relu, pas confondu avec l'ancien", () => {
  // Le cache se fiait à la longueur du texte : après un second enregistrement, la simulation aurait gardé l'ancien relief sans rien dire.
  const g = plate();
  const DEG = Math.PI / 180;
  const resolu = (grille) => ({id: "meme_id", altitudes_b64: encoder_altitudes(grille.z), lat_sud: grille.lat_sud_deg * DEG, lon_ouest: grille.lon_ouest_deg * DEG, pas_lat: grille.pas_lat_deg * DEG, pas_lon: grille.pas_lon_deg * DEG, lignes: grille.lignes, colonnes: grille.colonnes, pas: 1000});
  assert.equal(altitude_sol(grille_terrain(resolu(g)), {lat: 47 * DEG, lon: 2.5 * DEG}), 0);
  g.z.fill(300);
  assert.equal(altitude_sol(grille_terrain(resolu(g)), {lat: 47 * DEG, lon: 2.5 * DEG}), 300);
});

test("masques d'horizon : un relief retouché de même identifiant change les masques des radars", () => {
  // La clé citait l'identifiant du terrain : après retouche, la détection aurait suivi l'ancien relief.
  const id = "terrains/crete_notionnelle";
  const brut = modifier_scenario(en_v2(REFERENCE), {"theatre.terrain": id});
  const masques = (fichiers) => masques_radars(resoudre_scenario(brut, fichiers));
  const relief = structuredClone(masques(FICHIERS));
  const plat = {...FICHIERS[id], altitudes_b64: encoder_altitudes(new Int16Array(FICHIERS[id].lignes * FICHIERS[id].colonnes))};
  assert.notDeepEqual(masques({...FICHIERS, [id]: plat}), relief);
});

function atelier() {
  const diffuses = [];
  let relance = null;
  const ecrits = [];
  const partie = {point: (e, n) => ({lat: ((47 + n / 111_320) * Math.PI) / 180, lon: ((2.5 + e / 75_900) * Math.PI) / 180}), origine_deg: () => CENTRE, brut: {theatre: {}}};
  const a = creer_atelier_terrain({lire_unite: async () => unite_de_grille(plate(), "x", "y"), ecrire_terrain: (nom, unite) => (ecrits.push([nom, unite]), `prive/terrains/${nom}`)})({partie: () => partie, relancer: async (b) => { relance = b; }, diffuser: (m) => diffuses.push(m)});
  return {c: a.commandes, diffuses, ecrits, relance: () => relance};
}
const PINCEAU = {outil: "elever", rayon_m: 3000, force_m: 50, e: 0, n: 0};

test("atelier : un trait s'annule d'un coup, et se rétablit", () => {
  const {c, diffuses} = atelier();
  c.terrain_nouveau({rayon_km: 20, pas_km: 1});
  c.terrain_debut({e: 0, n: 0});
  c.terrain_pinceau(PINCEAU);
  c.terrain_pinceau(PINCEAU);
  assert.equal(diffuses.at(-1).genre, "terrain_retouche");
  c.terrain_annuler();
  assert.deepEqual(grille_depuis_unite(diffuses.at(-1)).z, plate().z);
  c.terrain_retablir();
  assert.ok(grille_depuis_unite(diffuses.at(-1)).z.some((z) => z > 0));
});

test("retouche : le morceau diffusé est celui de la grille, au bon endroit", () => {
  const {c, diffuses} = atelier();
  c.terrain_nouveau({rayon_km: 20, pas_km: 1});
  c.terrain_debut({e: 0, n: 0});
  c.terrain_pinceau(PINCEAU);
  const r = diffuses.at(-1);
  const o = Buffer.from(r.altitudes_b64, "base64");
  assert.equal(o.length, r.lignes * r.colonnes * 2);
  assert.equal(Math.max(...Array.from({length: o.length / 2}, (_, k) => o.readInt16LE(2 * k))), 50);
});

test("enregistrer : écrit l'unité et fait citer le terrain par le scénario ; un nom hostile est refusé", async () => {
  const {c, ecrits, relance} = atelier();
  c.terrain_nouveau({rayon_km: 20, pas_km: 1});
  await c.terrain_enregistrer({nom: "mon_relief"});
  assert.equal(ecrits[0][0], "mon_relief");
  assert.equal(relance().theatre.terrain, "prive/terrains/mon_relief");
  await assert.rejects(c.terrain_enregistrer({nom: "../../etc"}));
  await assert.rejects(c.terrain_enregistrer({nom: ""}));
});

test("pinceau refusé : outil inconnu, rayon hors bornes, aucun terrain ouvert", () => {
  const {c} = atelier();
  assert.throws(() => c.terrain_pinceau(PINCEAU));
  c.terrain_nouveau({rayon_km: 20, pas_km: 1});
  assert.throws(() => c.terrain_pinceau({...PINCEAU, outil: "x"}));
  assert.throws(() => c.terrain_pinceau({...PINCEAU, rayon_m: 1}));
  assert.throws(() => c.terrain_pinceau({...PINCEAU, force_m: 1e6}));
  assert.throws(() => c.terrain_pinceau({...PINCEAU, e: "x"}));
});

test("terrain de la partie : grille en degrés, ou id nul sans terrain", () => {
  assert.deepEqual(message_terrain({terrain: null}), {genre: "terrain", id: null});
  const m = message_terrain({terrain: {id: "t", lat_sud: Math.PI / 4, lon_ouest: 0, pas_lat: 0, pas_lon: 0, lignes: 1, colonnes: 1, altitudes_b64: "AAA="}});
  assert.ok(Math.abs(m.lat_sud_deg - 45) < 1e-9);
});
