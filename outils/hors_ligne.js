// Prépare la vue 3D sans réseau (jalon 14.3) : télécharge imagerie et relief d'un théâtre dans hors_ligne/ (hors git).
//   node outils/hors_ligne.js --lat 47 --lon 2.5 --rayon-km 300 --zoom-max 10 [--fond fonds/ign_ortho]
// Respecter les conditions de chaque source (cartes/) : ces tuiles ne se redistribuent pas forcément.
import {mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {pathToFileURL} from "node:url";
import {RACINE} from "../src/moteur/catalogue_node.js";

const TELECHARGEMENTS_SIMULTANES = 4;
const ZOOM_MIN = 4;
// Rayon moyen de la Terre : l'emprise des tuiles n'a pas besoin de mieux, elle se prend avec de la marge.
const METRES_PAR_DEGRE = 111_195;

const borner = (valeur, min, max) => Math.max(min, Math.min(max, valeur));

/** Rendre la colonne et la ligne de la tuile Web Mercator qui contient (lat, lon, en degrés) au zoom `z`. */
export function tuile_du_point(lat, lon, z) {
  const n = 2 ** z;
  const phi = (borner(lat, -85.05, 85.05) * Math.PI) / 180;
  return {x: borner(Math.floor(((lon + 180) / 360) * n), 0, n - 1), y: borner(Math.floor(((1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2) * n), 0, n - 1)};
}

/** Rendre les tuiles {z, x, y} couvrant le carré de `rayonKm` autour de (lat, lon), pour chaque zoom de `zMin` à `zMax`. */
export function tuiles_emprise(lat, lon, rayonKm, zMin, zMax) {
  const dLat = (rayonKm * 1000) / METRES_PAR_DEGRE;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const tuiles = [];
  for (let z = zMin; z <= zMax; z++) {
    const [nordOuest, sudEst] = [tuile_du_point(lat + dLat, lon - dLon, z), tuile_du_point(lat - dLat, lon + dLon, z)];
    for (let x = nordOuest.x; x <= sudEst.x; x++) for (let y = nordOuest.y; y <= sudEst.y; y++) tuiles.push({z, x, y});
  }
  return tuiles;
}

const adresse = (modele, {z, x, y}) => modele.replace("{z}", z).replace("{x}", x).replace("{y}", y);

export function ecrire(chemin, contenu) {
  mkdirSync(dirname(chemin), {recursive: true});
  writeFileSync(`${chemin}.tmp`, contenu);
  renameSync(`${chemin}.tmp`, chemin);
}

/** Télécharger les tuiles d'une source ; une tuile absente (mer, hors couverture) est sautée. Rendre le nombre écrit. */
export async function telecharger(source, tuiles, dossier) {
  let [suivante, ecrites] = [0, 0];
  const ouvrier = async () => {
    while (suivante < tuiles.length) {
      const tuile = tuiles[suivante++];
      const reponse = await fetch(adresse(source.tuiles[0], tuile));
      if (!reponse.ok) continue;
      ecrire(join(dossier, String(tuile.z), String(tuile.x), `${tuile.y}.tuile`), Buffer.from(await reponse.arrayBuffer()));
      ecrites++;
    }
  };
  await Promise.all(Array.from({length: TELECHARGEMENTS_SIMULTANES}, ouvrier));
  return ecrites;
}

const lire_source = (id) => JSON.parse(readFileSync(join(RACINE, "cartes", `${id}.json`), "utf-8"));

function lire_options(argv) {
  const valeur = (nom, defaut) => {
    const i = argv.indexOf(`--${nom}`);
    return i >= 0 ? argv[i + 1] : defaut;
  };
  return {lat: Number(valeur("lat", 47)), lon: Number(valeur("lon", 2.5)), rayonKm: Number(valeur("rayon-km", 300)), zoomMax: Number(valeur("zoom-max", 10)),
    fond: valeur("fond", "fonds/ign_ortho"), relief: valeur("relief", "relief/terrarium_aws"), dossier: valeur("dossier", join(RACINE, "hors_ligne"))};
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = lire_options(process.argv.slice(2));
  const [fond, relief] = [lire_source(o.fond), lire_source(o.relief)];
  const tuiles = tuiles_emprise(o.lat, o.lon, o.rayonKm, ZOOM_MIN, o.zoomMax);
  console.log(`${tuiles.length} tuiles par source, zoom ${ZOOM_MIN} à ${o.zoomMax}`);
  const decrire = (source, nom) => ({...source, tuiles: [`hors_ligne/${nom}/{z}/{x}/{y}.tuile`], zoom_max: o.zoomMax});
  const [nFond, nRelief] = [await telecharger(fond, tuiles, join(o.dossier, "fond")), await telecharger(relief, tuiles, join(o.dossier, "relief"))];
  ecrire(join(o.dossier, "index.json"), `${JSON.stringify({fond: decrire(fond, "fond"), relief: decrire(relief, "relief")}, null, 2)}\n`);
  console.log(`Écrit dans ${o.dossier} : ${nFond} tuiles de fond, ${nRelief} de relief.`);
}
