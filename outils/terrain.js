// Fabrique un terrain du catalogue (unites/terrains/<nom>.json) : grille d'altitudes autour d'un centre, lue dans
// les tuiles de relief terrarium (cartes/relief/terrarium_aws.json), ou relief synthétique pour les essais.
//
//   node outils/terrain.js --nom centre_france --lat 47 --lon 2.5 --rayon_km 320 --pas_km 1    # tuiles (réseau)
//   node outils/terrain.js --nom crete_notionnelle --lat 47 --lon 2.5 --rayon_km 320 --pas_km 2 --synthetique
//
// Puis : node outils/indexer.js. Le scénario cite le terrain par theatre.terrain (MODELE § 16).
import {readFileSync, renameSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {RACINE} from "../src/moteur/catalogue_node.js";
import {decoder_png} from "./png.js";
import {preparer_langue} from "../src/langue_node.js";
import {t} from "../src/i18n.js";

const KM_PAR_DEGRE = 111.32;

/** Rendre la géométrie d'une grille carrée de demi-côté `rayon_km` centrée en (lat, lon), au pas `pas_km`. */
export function geometrie_grille(lat, lon, rayonKm, pasKm) {
  const demi = Math.ceil(rayonKm / pasKm);
  const pasLat = pasKm / KM_PAR_DEGRE;
  const pasLon = pasKm / (KM_PAR_DEGRE * Math.cos((lat * Math.PI) / 180));
  return {lat_sud: lat - demi * pasLat, lon_ouest: lon - demi * pasLon, pas_lat: pasLat, pas_lon: pasLon, lignes: 2 * demi + 1, colonnes: 2 * demi + 1};
}

/** Rendre l'altitude (m) codée par un pixel terrarium. */
export const altitude_terrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;

/** Rendre la tuile {x, y} et le pixel {px, py} d'un point au zoom `zoom` (Web Mercator, tuiles de 256 px). */
export function pixel_tuile(lat, lon, zoom) {
  const n = 2 ** zoom * 256;
  const X = ((lon + 180) / 360) * n;
  const phi = (lat * Math.PI) / 180;
  const Y = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n;
  return {x: Math.floor(X / 256), y: Math.floor(Y / 256), px: Math.floor(X) % 256, py: Math.floor(Y) % 256};
}

/** Rendre les altitudes en base64 (Int16 petit-boutiste), bornées à ±32 767 m et arrondies au mètre. */
export function encoder_altitudes(altitudes) {
  const z = Int16Array.from(altitudes, (a) => Math.max(-32768, Math.min(32767, Math.round(a))));
  return Buffer.from(z.buffer).toString("base64");
}

/**
 * Relief synthétique de démonstration : une crête est-ouest de 1 500 m à 170 km au nord du centre (juste au-delà de
 * la frontière d'une zone de 150 km : elle aveugle les radars du nord vers l'extérieur), un massif de 1 200 m à
 * 165 km au sud-est, une plaine à 150 m ailleurs.
 */
export function relief_synthetique(lat, lon, lat0, lon0) {
  const nord = (lat - lat0) * KM_PAR_DEGRE;
  const est = (lon - lon0) * KM_PAR_DEGRE * Math.cos((lat0 * Math.PI) / 180);
  const crete = 1350 * Math.exp(-(((nord - 170) / 8) ** 2)) * (Math.abs(est) < 100 ? 1 : Math.exp(-(((Math.abs(est) - 100) / 30) ** 2)));
  const massif = 1050 * Math.exp(-(((nord + 117) ** 2 + (est - 117) ** 2) / (2 * 15 ** 2)));
  return 150 + crete + massif;
}

async function tuile(source, zoom, x, y, memoire) {
  const cle = `${zoom}/${x}/${y}`;
  if (!memoire.has(cle)) {
    const adresse = source.tuiles[0].replace("{z}", zoom).replace("{x}", x).replace("{y}", y);
    const reponse = await fetch(adresse);
    if (!reponse.ok) throw new Error(`${reponse.status} sur ${adresse}`);
    memoire.set(cle, decoder_png(new Uint8Array(await reponse.arrayBuffer())));
  }
  return memoire.get(cle);
}

async function altitudes_tuiles(g, zoom) {
  const source = JSON.parse(readFileSync(join(RACINE, "cartes", "relief", "terrarium_aws.json"), "utf-8"));
  const memoire = new Map();
  const altitudes = new Float64Array(g.lignes * g.colonnes);
  for (let i = 0; i < g.lignes; i++) {
    for (let j = 0; j < g.colonnes; j++) {
      const p = pixel_tuile(g.lat_sud + i * g.pas_lat, g.lon_ouest + j * g.pas_lon, zoom);
      const image = await tuile(source, zoom, p.x, p.y, memoire);
      const k = (p.py * image.largeur + p.px) * image.canaux;
      altitudes[i * g.colonnes + j] = altitude_terrarium(image.pixels[k], image.pixels[k + 1], image.pixels[k + 2]);
    }
    if (i % 50 === 0) process.stdout.write(`\r${t("cli.terrain.ligne", {i: i + 1, n: g.lignes, tuiles: memoire.size})}`);
  }
  process.stdout.write("\n");
  return {altitudes, source};
}

function lire_arguments(liste) {
  const o = {nom: null, lat: null, lon: null, rayon_km: 320, pas_km: 1, zoom: 9, synthetique: false};
  for (let i = 0; i < liste.length; i++) {
    const cle = liste[i].replace(/^--/, "");
    if (cle === "synthetique") o.synthetique = true;
    else o[cle] = cle === "nom" ? liste[++i] : Number(liste[++i]);
  }
  if (!o.nom || o.lat === null || o.lon === null) throw new Error(t("cli.terrain.usage"));
  return o;
}

async function principal() {
  const o = lire_arguments(preparer_langue(process.argv.slice(2)));
  const g = geometrie_grille(o.lat, o.lon, o.rayon_km, o.pas_km);
  let altitudes;
  let sources;
  let nom;
  if (o.synthetique) {
    altitudes = Array.from({length: g.lignes * g.colonnes}, (_, k) => relief_synthetique(g.lat_sud + Math.floor(k / g.colonnes) * g.pas_lat, g.lon_ouest + (k % g.colonnes) * g.pas_lon, o.lat, o.lon));
    sources = ["Relief synthétique de démonstration (outils/terrain.js --synthetique) : crête est-ouest et massif, sans rapport avec le terrain réel"];
    nom = `Terrain synthétique autour de ${o.lat}° N, ${o.lon}° E (notionnel)`;
  } else {
    const lu = await altitudes_tuiles(g, o.zoom);
    altitudes = lu.altitudes;
    sources = [`${lu.source.attribution} ; tuiles terrarium au zoom ${o.zoom}, échantillonnées au pas de ${o.pas_km} km`, lu.source.conditions];
    nom = `Relief réel autour de ${o.lat}° N, ${o.lon}° E, ${o.rayon_km} km`;
  }
  const terrain = {herite_de: "terrains/_terrain", nom, fidelite: "notionnel", sources,
    lat_sud_deg: g.lat_sud, lon_ouest_deg: g.lon_ouest, pas_lat_deg: g.pas_lat, pas_lon_deg: g.pas_lon, pas_km: o.pas_km,
    lignes: g.lignes, colonnes: g.colonnes, altitudes_b64: encoder_altitudes(altitudes)};
  const chemin = join(RACINE, "unites", "terrains", `${o.nom}.json`);
  writeFileSync(`${chemin}.tmp`, `${JSON.stringify(terrain, null, 2)}\n`);
  renameSync(`${chemin}.tmp`, chemin);
  console.log(`→ ${t("cli.terrain.fait", {chemin, lignes: g.lignes, colonnes: g.colonnes})}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
