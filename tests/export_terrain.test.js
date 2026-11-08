// Export du terrain pour moteur de jeu (jalon 15.2, MODELE § 24, docs/FORMATS.md § 7).
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";
import test from "node:test";
import {inflateSync} from "node:zlib";
import {carte_hauteurs, decouper_grille, emprise_degres, emprise_tuiles, encoder_glb, maillage, source_imagerie, uv_mosaique} from "../outils/export_terrain.js";
import {tuile_du_point} from "../outils/hors_ligne.js";
import {encoder_png_gris16} from "../outils/png.js";
import {ids_unites_disque, RACINE} from "../src/moteur/catalogue_node.js";
import {direct, geo_deg, vers_degres, vers_ecef} from "../src/moteur/geodesie.js";
import {creer_repere} from "../src/moteur/rejeu.js";

const ORIGINE = geo_deg(47, 2.5);
const [PAS_LAT, PAS_LON] = [direct(ORIGINE, 0, 1000).lat - ORIGINE.lat, direct(ORIGINE, Math.PI / 2, 1000).lon - ORIGINE.lon];
const [LIGNES, COLONNES] = [21, 21];
// Grille centrée sur l'origine, altitude = 100 + 10 × rang de ligne : le nord est plus haut que le sud.
const GRILLE = {
  lat_sud: ORIGINE.lat - 10 * PAS_LAT, lon_ouest: ORIGINE.lon - 10 * PAS_LON, pas_lat: PAS_LAT, pas_lon: PAS_LON, lignes: LIGNES, colonnes: COLONNES, pas_m: 1000,
  z: Int16Array.from({length: LIGNES * COLONNES}, (_, k) => 100 + 10 * Math.floor(k / COLONNES)),
};
const TOUT = decouper_grille(GRILLE, ORIGINE);
const sommet = ({positions}, k) => [...positions.subarray(3 * k, 3 * k + 3)];
const proche = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, `${a} loin de ${b}`);

test("découpe : le pas espace les nœuds et le rayon borne l'emprise autour de l'origine", () => {
  assert.equal(TOUT.lignes.length, 21);
  assert.deepEqual(decouper_grille(GRILLE, ORIGINE, {pas: 5000}).colonnes, [0, 5, 10, 15, 20]);
  const proches = decouper_grille(GRILLE, ORIGINE, {rayon: 3500});
  assert.deepEqual(proches.lignes, [7, 8, 9, 10, 11, 12, 13]);
  assert.throws(() => decouper_grille(GRILLE, geo_deg(10, 10), {rayon: 3000}), /emprise vide/);
});

test("carte de hauteur : nord en haut, et altitude retrouvée à une demi-échelle près", () => {
  const {valeurs, alt_min_m: min, echelle_m: echelle} = carte_hauteurs(GRILLE, TOUT);
  assert.equal(min, 100);
  assert.equal(valeurs[0], 65_535);
  assert.equal(valeurs[20 * 21], 0);
  proche(min + valeurs[10 * 21] * echelle, 200, echelle / 2 + 1e-9);
});

test("carte de hauteur : un terrain tout plat donne une image nulle, sans division par zéro", () => {
  const plat = carte_hauteurs({...GRILLE, z: new Int16Array(LIGNES * COLONNES).fill(250)}, TOUT);
  assert.deepEqual([plat.alt_min_m, plat.echelle_m, Math.max(...plat.valeurs)], [250, 0, 0]);
});

test("PNG 16 bits : en-tête gris 16 bits, valeurs gros-boutistes, somme de contrôle de la norme", () => {
  const octets = encoder_png_gris16(2, 1, Uint16Array.of(0x1234, 0xabcd));
  assert.deepEqual([...octets.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(octets.readUInt32BE(16), 2);
  assert.deepEqual([octets[24], octets[25]], [16, 0]);
  const longueur = octets.readUInt32BE(33);
  assert.deepEqual([...inflateSync(octets.subarray(41, 41 + longueur))], [0, 0x12, 0x34, 0xab, 0xcd]);
  // Somme connue du bloc IEND, identique dans tout PNG (RFC 2083).
  assert.equal(octets.subarray(-4).toString("hex"), "ae426082");
});

test("maillage : chaque sommet est au point (e, u, −n) du repère du rejeu", () => {
  const m = maillage(GRILLE, TOUT, ORIGINE);
  const repere = creer_repere(ORIGINE);
  for (const [r, c] of [[0, 0], [10, 10], [20, 3], [7, 20]]) {
    const geo = {lat: GRILLE.lat_sud + r * PAS_LAT, lon: GRILLE.lon_ouest + c * PAS_LON, alt: 100 + 10 * r};
    const {e, n, u} = repere(vers_ecef(geo));
    const [x, y, z] = sommet(m, r * COLONNES + c);
    proche(x, e, 0.01);
    proche(y, u, 0.01);
    proche(z, -n, 0.01);
  }
});

test("maillage : à plat, la hauteur est l'altitude ; le nœud central reste à l'origine", () => {
  const [x, y, z] = sommet(maillage(GRILLE, TOUT, ORIGINE, {plat: true}), 10 * COLONNES + 10);
  proche(x, 0, 0.01);
  proche(y, 200, 1e-6);
  proche(z, 0, 0.01);
});

test("maillage : les faces regardent le ciel et les normales montent", () => {
  const m = maillage({...GRILLE, z: new Int16Array(LIGNES * COLONNES)}, TOUT, ORIGINE, {plat: true});
  assert.equal(m.indices.length, 6 * 20 * 20);
  for (let t = 0; t < m.indices.length; t += 3 * 97) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((k) => sommet(m, k));
    const [u, v] = [[b[0] - a[0], b[2] - a[2]], [c[0] - a[0], c[2] - a[2]]];
    // Composante Y du produit vectoriel (b − a) × (c − a).
    assert.ok(u[1] * v[0] - u[0] * v[1] > 0, `triangle ${t / 3}`);
  }
  proche(m.normales[3 * 200 + 1], 1, 1e-3);
});

test("glb : en-tête, blocs alignés sur 4 octets, accesseurs cohérents avec le binaire", () => {
  const m = maillage(GRILLE, TOUT, ORIGINE);
  const glb = encoder_glb(m);
  assert.equal(glb.toString("ascii", 0, 4), "glTF");
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length);
  const longueurJson = glb.readUInt32LE(12);
  assert.equal(longueurJson % 4, 0);
  const json = JSON.parse(glb.toString("utf-8", 20, 20 + longueurJson));
  const debutBinaire = 20 + longueurJson;
  assert.equal(glb.toString("ascii", debutBinaire + 4, debutBinaire + 8), "BIN\0");
  assert.equal(glb.readUInt32LE(debutBinaire), json.buffers[0].byteLength);
  assert.equal(json.accessors[0].count, LIGNES * COLONNES);
  assert.equal(json.accessors[3].count, m.indices.length);
  assert.equal(json.accessors[0].max[1], Math.max(...m.positions.filter((_, i) => i % 3 === 1)));
});

test("imagerie : l'emprise est couverte par la mosaïque, et ses UV restent dans la mosaïque", () => {
  const degres = emprise_degres(GRILLE, TOUT);
  const e = emprise_tuiles(degres, 9);
  const {x, y} = tuile_du_point(47, 2.5, 9);
  assert.ok(x >= e.x_min && x < e.x_min + e.colonnes && y >= e.y_min && y < e.y_min + e.lignes);
  for (const [lat, lon] of [[degres.nord, degres.ouest], [degres.sud, degres.est]]) for (const v of uv_mosaique(lat, lon, e)) assert.ok(v >= 0 && v <= 1);
  const [u, v] = uv_mosaique(vers_degres(ORIGINE.lat), vers_degres(ORIGINE.lon), {zoom: 9, x_min: x, y_min: y, colonnes: 1, lignes: 1});
  assert.ok(u >= 0 && u < 1 && v >= 0 && v < 1);
});

test("imagerie : une source dont les conditions interdisent le téléchargement est refusée", () => {
  assert.throws(() => source_imagerie("fonds/osm"), /n'autorise pas/);
  assert.equal(source_imagerie("fonds/ign_ortho").export_imagerie, true);
});

test("modèles : chaque icône et chaque famille d'unités a un modèle générique déclaré", () => {
  const {modeles, icones, familles} = JSON.parse(readFileSync(join(RACINE, "clients", "modeles.json"), "utf-8"));
  const disponibles = readdirSync(join(RACINE, "icones")).filter((f) => f.endsWith(".svg")).map((f) => f.replace(".svg", "")).sort();
  assert.deepEqual(Object.keys(icones).sort(), disponibles);
  // Catalogue public seul : les fiches privées qui ne peuvent pas entrer dans un scénario ont leurs propres dossiers.
  const sans_modele = new Set(["", "terrains"]);
  const presentes = new Set(ids_unites_disque().filter((id) => !id.startsWith("prive/")).map((id) => id.split("/").slice(0, -1).join("/")).filter((f) => !sans_modele.has(f)));
  for (const famille of presentes) assert.ok(famille in familles, `famille sans modèle : ${famille}`);
  for (const modele of [...Object.values(icones), ...Object.values(familles)]) assert.ok(modeles.includes(modele), `modèle non déclaré : ${modele}`);
  for (const modele of modeles) assert.ok(Object.values(icones).includes(modele), `modèle sans icône : ${modele}`);
});
