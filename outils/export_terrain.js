// Exporte le terrain d'un théâtre pour un moteur de jeu (jalon 15.2, docs/FORMATS.md § 7) : carte de hauteur PNG 16 bits
// et maillage glTF binaire, dans le repère local du rejeu, plus l'imagerie en tuiles si la source le permet.
//
//   node outils/export_terrain.js --terrain terrains/centre_france --rayon-km 200 --pas-km 2
//   node outils/export_terrain.js --terrain terrains/centre_france --plat --imagerie fonds/ign_ortho --zoom-imagerie 9
//
// `--plat` : le maillage suit (e, n, alt), pour un rejeu affiché à plat (FORMATS § 6.3). Écrit resultats/terrains/<nom>/.
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {charger_unites_scenario, RACINE} from "../src/moteur/catalogue_node.js";
import {direct, vers_degres, vers_ecef} from "../src/moteur/geodesie.js";
import {creer_repere} from "../src/moteur/rejeu.js";
import {en_v2, modifier_scenario, resoudre_scenario} from "../src/moteur/scenario.js";
import {grille_terrain} from "../src/moteur/terrain.js";
import {ecrire, telecharger, tuile_du_point} from "./hors_ligne.js";
import {encoder_png_gris16} from "./png.js";

export const FORMAT_TERRAIN = "egide-terrain";
export const VERSION_TERRAIN = 1;
const VALEUR_MAX_PNG = 65_535;
const [FLOTTANT, ENTIER_32] = [5126, 5125];
const [TAMPON_SOMMETS, TAMPON_INDICES] = [34962, 34963];
const ZOOM_IMAGERIE_DEFAUT = 9;

/**
 * Rendre {lignes, colonnes} : les rangs de la grille à garder, du sud au nord et d'ouest en est. `rayon` (m, null : toute
 * la grille) borne le carré autour de `origine` ; `pas` (m, null : celui de la grille) espace les nœuds gardés.
 */
export function decouper_grille(grille, origine, {rayon = null, pas = null} = {}) {
  const saut = pas === null ? 1 : Math.max(1, Math.round(pas / grille.pas_m));
  const [dLat, dLon] = rayon === null ? [Infinity, Infinity] : [direct(origine, 0, rayon).lat - origine.lat, direct(origine, Math.PI / 2, rayon).lon - origine.lon];
  const rangs = (nombre, debut, ecart, centre, demi) => {
    const dedans = Array.from({length: nombre}, (_, k) => k).filter((k) => Math.abs(debut + k * ecart - centre) <= demi);
    return dedans.filter((_, n) => n % saut === 0);
  };
  const lignes = rangs(grille.lignes, grille.lat_sud, grille.pas_lat, origine.lat, dLat);
  const colonnes = rangs(grille.colonnes, grille.lon_ouest, grille.pas_lon, origine.lon, dLon);
  if (lignes.length < 2 || colonnes.length < 2) throw new Error(`emprise vide : ${lignes.length} × ${colonnes.length} nœuds autour de l'origine`);
  return {lignes, colonnes};
}

/** Rendre {valeurs (Uint16Array, nord en haut), alt_min_m, echelle_m} : altitude = alt_min_m + valeur × echelle_m. */
export function carte_hauteurs(grille, {lignes, colonnes}) {
  const altitudes = lignes.flatMap((i) => colonnes.map((j) => grille.z[i * grille.colonnes + j]));
  const [min, max] = altitudes.reduce(([a, b], z) => [Math.min(a, z), Math.max(b, z)], [Infinity, -Infinity]);
  const echelle = (max - min) / VALEUR_MAX_PNG;
  const valeurs = new Uint16Array(lignes.length * colonnes.length);
  const largeur = colonnes.length;
  for (let r = 0; r < lignes.length; r++) {
    const haut = lignes.length - 1 - r;
    for (let c = 0; c < largeur; c++) valeurs[haut * largeur + c] = echelle === 0 ? 0 : Math.round((altitudes[r * largeur + c] - min) / echelle);
  }
  return {valeurs, alt_min_m: min, echelle_m: echelle};
}

/** Rendre le bloc {zoom, x_min, y_min, colonnes, lignes} des tuiles Web Mercator qui couvrent une emprise en degrés. */
export function emprise_tuiles({nord, sud, ouest, est}, zoom) {
  const [haut, bas] = [tuile_du_point(nord, ouest, zoom), tuile_du_point(sud, est, zoom)];
  return {zoom, x_min: haut.x, y_min: haut.y, colonnes: bas.x - haut.x + 1, lignes: bas.y - haut.y + 1};
}

/** Rendre [u, v] d'un point (degrés) dans la mosaïque de tuiles `e` : v = 0 en haut, comme glTF. */
export function uv_mosaique(lat, lon, e) {
  const n = 2 ** e.zoom;
  const phi = (lat * Math.PI) / 180;
  return [(((lon + 180) / 360) * n - e.x_min) / e.colonnes, (((1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2) * n - e.y_min) / e.lignes];
}

/** Rendre la normale unitaire [x, y, z] du nœud (r, c), par différences centrées : vers le haut de la scène. */
function normale(positions, nl, nc, r, c) {
  const point = (rr, cc) => {
    const k = 3 * (Math.max(0, Math.min(nl - 1, rr)) * nc + Math.max(0, Math.min(nc - 1, cc)));
    return [positions[k], positions[k + 1], positions[k + 2]];
  };
  const ecart = ([ax, ay, az], [bx, by, bz]) => [ax - bx, ay - by, az - bz];
  const [a, b] = [ecart(point(r, c + 1), point(r, c - 1)), ecart(point(r + 1, c), point(r - 1, c))];
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const longueur = Math.hypot(...n);
  return n.map((v) => v / longueur);
}

/**
 * Rendre le maillage {positions, normales, uvs, indices} des nœuds gardés : glTF est à Y vers le haut et Z vers
 * l'arrière, d'où (x, y, z) = (e, u, −n). `plat` : hauteur = altitude au lieu de u. `emprise` : UV dans la mosaïque.
 */
export function maillage(grille, {lignes, colonnes}, origine, {plat = false, emprise = null} = {}) {
  const [nl, nc] = [lignes.length, colonnes.length];
  const repere = creer_repere(origine);
  const positions = new Float32Array(3 * nl * nc);
  const uvs = new Float32Array(2 * nl * nc);
  lignes.forEach((i, r) => colonnes.forEach((j, c) => {
    const geo = {lat: grille.lat_sud + i * grille.pas_lat, lon: grille.lon_ouest + j * grille.pas_lon, alt: grille.z[i * grille.colonnes + j]};
    const {e, n, u} = repere(vers_ecef(geo));
    const k = r * nc + c;
    positions.set([e, plat ? geo.alt : u, -n], 3 * k);
    uvs.set(emprise ? uv_mosaique(vers_degres(geo.lat), vers_degres(geo.lon), emprise) : [c / (nc - 1), 1 - r / (nl - 1)], 2 * k);
  }));
  const normales = new Float32Array(3 * nl * nc);
  for (let r = 0; r < nl; r++) for (let c = 0; c < nc; c++) normales.set(normale(positions, nl, nc, r, c), 3 * (r * nc + c));
  const indices = new Uint32Array(6 * (nl - 1) * (nc - 1));
  let n = 0;
  for (let r = 0; r < nl - 1; r++) {
    for (let c = 0; c < nc - 1; c++) {
      const [so, se, no, ne] = [r * nc + c, r * nc + c + 1, (r + 1) * nc + c, (r + 1) * nc + c + 1];
      // Sens antihoraire vu du dessus : la face avant de glTF regarde le ciel.
      indices.set([so, se, ne, so, ne, no], n);
      n += 6;
    }
  }
  return {positions, normales, uvs, indices};
}

/** Rendre les bornes [min, max] de chaque composante d'un tableau de vecteurs de `taille` composantes. */
function bornes(tableau, taille) {
  const [min, max] = [Array(taille).fill(Infinity), Array(taille).fill(-Infinity)];
  tableau.forEach((v, i) => {
    const k = i % taille;
    if (v < min[k]) min[k] = v;
    if (v > max[k]) max[k] = v;
  });
  return [min, max];
}

/** Rendre les octets du fichier glTF binaire (.glb, glTF 2.0) d'un maillage. */
export function encoder_glb({positions, normales, uvs, indices}) {
  const sommets = positions.length / 3;
  const parties = [[positions, TAMPON_SOMMETS, FLOTTANT, "VEC3"], [normales, TAMPON_SOMMETS, FLOTTANT, "VEC3"], [uvs, TAMPON_SOMMETS, FLOTTANT, "VEC2"], [indices, TAMPON_INDICES, ENTIER_32, "SCALAR"]];
  let decalage = 0;
  const vues = parties.map(([t, cible]) => {
    const vue = {buffer: 0, byteOffset: decalage, byteLength: t.byteLength, target: cible};
    decalage += t.byteLength;
    return vue;
  });
  const [min, max] = bornes(positions, 3);
  const accesseurs = parties.map(([, , composante, type], i) => ({bufferView: i, componentType: composante, count: i === 3 ? indices.length : sommets, type, ...(i === 0 ? {min, max} : {})}));
  const description = {
    asset: {version: "2.0", generator: "Égide (outils/export_terrain.js)"}, scene: 0, scenes: [{nodes: [0]}], nodes: [{mesh: 0, name: "terrain"}],
    meshes: [{name: "terrain", primitives: [{attributes: {POSITION: 0, NORMAL: 1, TEXCOORD_0: 2}, indices: 3, material: 0}]}],
    materials: [{name: "sol", pbrMetallicRoughness: {baseColorFactor: [0.45, 0.5, 0.4, 1], metallicFactor: 0, roughnessFactor: 1}}],
    accessors: accesseurs, bufferViews: vues, buffers: [{byteLength: decalage}],
  };
  // Chaque bloc d'un .glb doit tenir sur 4 octets : espaces pour le JSON, zéros pour le binaire (déjà multiple de 4 ici).
  const texte = Buffer.from(JSON.stringify(description), "utf-8");
  const json = Buffer.concat([texte, Buffer.alloc((4 - (texte.length % 4)) % 4, 0x20)]);
  const binaire = Buffer.concat(parties.map(([t]) => Buffer.from(t.buffer, t.byteOffset, t.byteLength)));
  const entete = Buffer.alloc(12 + 8);
  entete.write("glTF", 0, "ascii");
  entete.writeUInt32LE(2, 4);
  entete.writeUInt32LE(12 + 8 + json.length + 8 + binaire.length, 8);
  entete.writeUInt32LE(json.length, 12);
  entete.write("JSON", 16, "ascii");
  const enteteBinaire = Buffer.alloc(8);
  enteteBinaire.writeUInt32LE(binaire.length, 0);
  enteteBinaire.write("BIN\0", 4, "ascii");
  return Buffer.concat([entete, json, enteteBinaire, binaire]);
}

/** Rendre l'emprise en degrés {nord, sud, ouest, est} des nœuds gardés. */
export function emprise_degres(grille, {lignes, colonnes}) {
  const [lat, lon] = [(i) => vers_degres(grille.lat_sud + i * grille.pas_lat), (j) => vers_degres(grille.lon_ouest + j * grille.pas_lon)];
  return {nord: lat(lignes.at(-1)), sud: lat(lignes[0]), ouest: lon(colonnes[0]), est: lon(colonnes.at(-1))};
}

/** Rendre la source d'imagerie `id`, ou lever une erreur si ses conditions n'autorisent pas l'export d'une emprise. */
export function source_imagerie(id, lire = (chemin) => JSON.parse(readFileSync(join(RACINE, "cartes", `${chemin}.json`), "utf-8"))) {
  const source = lire(id);
  if (source.export_imagerie !== true) throw new Error(`imagerie ${id} : la source n'autorise pas ce téléchargement (${source.conditions})`);
  return source;
}

function lire_options(argv) {
  const o = {scenario: "scenarios/reference.json", terrain: null, "rayon-km": null, "pas-km": null, plat: false, imagerie: null, "zoom-imagerie": ZOOM_IMAGERIE_DEFAUT, dossier: null};
  for (let i = 0; i < argv.length; i++) {
    const cle = argv[i].replace(/^--/, "");
    if (!(cle in o)) throw new Error(`option inconnue : ${argv[i]}`);
    if (cle === "plat") o.plat = true;
    else o[cle] = ["rayon-km", "pas-km", "zoom-imagerie"].includes(cle) ? Number(argv[++i]) : argv[++i];
  }
  return o;
}

async function principal() {
  const o = lire_options(process.argv.slice(2));
  const lu = en_v2(JSON.parse(readFileSync(o.scenario, "utf-8")));
  const brut = o.terrain ? modifier_scenario(lu, {"theatre.terrain": o.terrain}) : lu;
  if (!brut.theatre.terrain) throw new Error("ce scénario n'a pas de terrain : préciser --terrain terrains/<nom>");
  const {origine: lue, terrain} = resoudre_scenario(brut, await charger_unites_scenario(brut)).theatre;
  const origine = {...lue, alt: lue.alt ?? 0};
  const source = o.imagerie ? source_imagerie(o.imagerie) : null;
  const grille = grille_terrain(terrain);
  const decoupe = decouper_grille(grille, origine, {rayon: o["rayon-km"] === null ? null : o["rayon-km"] * 1000, pas: o["pas-km"] === null ? null : o["pas-km"] * 1000});
  const [nl, nc] = [decoupe.lignes.length, decoupe.colonnes.length];
  const degres = emprise_degres(grille, decoupe);
  const emprise = source ? emprise_tuiles(degres, o["zoom-imagerie"]) : null;
  const dossier = o.dossier ?? join("resultats", "terrains", brut.theatre.terrain.split("/").at(-1));
  const hauteurs = carte_hauteurs(grille, decoupe);
  ecrire(join(dossier, "hauteurs.png"), encoder_png_gris16(nc, nl, hauteurs.valeurs));
  // Godot ramène les PNG 16 bits à 8 bits au chargement : le client lit donc ces mêmes valeurs en brut.
  ecrire(join(dossier, "hauteurs.raw"), Buffer.from(hauteurs.valeurs.buffer));
  ecrire(join(dossier, "terrain.glb"), encoder_glb(maillage(grille, decoupe, origine, {plat: o.plat, emprise})));
  let imagerie = null;
  if (source) {
    const tuiles = Array.from({length: emprise.colonnes * emprise.lignes}, (_, k) => ({z: emprise.zoom, x: emprise.x_min + (k % emprise.colonnes), y: emprise.y_min + Math.floor(k / emprise.colonnes)}));
    const ecrites = await telecharger(source, tuiles, join(dossier, "imagerie"));
    imagerie = {source: o.imagerie, dossier: "imagerie/{z}/{x}/{y}.tuile", taille_tuile: source.taille_tuile, ...emprise, tuiles_ecrites: ecrites, attribution: source.attribution, conditions: source.conditions};
    console.log(`Imagerie : ${ecrites} tuiles sur ${tuiles.length}.`);
  }
  const description = {
    format: FORMAT_TERRAIN, version: VERSION_TERRAIN, terrain: {id: brut.theatre.terrain, nom: terrain.nom, sources: terrain.sources},
    origine: {lat_deg: vers_degres(origine.lat), lon_deg: vers_degres(origine.lon), alt_m: origine.alt}, repere: o.plat ? "plat" : "enu",
    grille: {lignes: nl, colonnes: nc, ...degres}, hauteurs: {fichier: "hauteurs.png", brut: "hauteurs.raw", alt_min_m: hauteurs.alt_min_m, echelle_m: hauteurs.echelle_m},
    maillage: {fichier: "terrain.glb", uv: source ? "mosaique" : "grille"}, imagerie,
  };
  ecrire(join(dossier, "terrain.json"), `${JSON.stringify(description, null, 2)}\n`);
  console.log(`${nc} × ${nl} nœuds, altitudes ${hauteurs.alt_min_m} à ${Math.round(hauteurs.alt_min_m + hauteurs.echelle_m * VALEUR_MAX_PNG)} m → ${dossier}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
