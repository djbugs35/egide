// Altitudes du relief lues dans les tuiles « terrarium » déclarées sous cartes/relief/ (MODELE § 12.6).
// Le calcul (tuile, pixel, décodage, échantillonnage d'un chemin) est pur et testé ; seul le chargement des images
// dépend du navigateur.
import {direct, inverse, vers_degres} from "../moteur/geodesie.js";
import {decoder_png} from "./png.js";

// Zoom 10 : environ 150 m par pixel à l'équateur, assez fin pour un profil sur des centaines de km.
export const ZOOM_RELIEF = 10;
const TAILLE_TUILE = 256;

/** Rendre la tuile {x, y} et le pixel {px, py} qui couvrent une position géographique au zoom `z` (Web Mercator). */
export function tuile_de(geo, z) {
  const n = 2 ** z;
  const lat = Math.max(-85.0511, Math.min(85.0511, vers_degres(geo.lat)));
  const xMonde = ((vers_degres(geo.lon) + 180) / 360) * n;
  const yMonde = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const [x, y] = [Math.floor(xMonde), Math.floor(yMonde)];
  return {x, y, px: Math.min(TAILLE_TUILE - 1, Math.floor((xMonde - x) * TAILLE_TUILE)), py: Math.min(TAILLE_TUILE - 1, Math.floor((yMonde - y) * TAILLE_TUILE))};
}

/** Rendre l'altitude (m) codée par un pixel terrarium : (R × 256 + V + B / 256) − 32 768. */
export const altitude_terrarium = (r, v, b) => r * 256 + v + b / 256 - 32_768;

/** Rendre des points régulièrement espacés de `pas` m le long d'un chemin géodésique, avec leur distance cumulée. */
export function echantillonner_chemin(points, pas) {
  const echantillons = [{geo: points[0], distance: 0, passage: 0}];
  let cumul = 0;
  for (let i = 1; i < points.length; i++) {
    const {distance, azimut_depart: azimut} = inverse(points[i - 1], points[i]);
    const nombre = Math.max(1, Math.ceil(distance / pas));
    for (let k = 1; k <= nombre; k++) {
      echantillons.push({geo: direct(points[i - 1], azimut, (distance * k) / nombre), distance: cumul + (distance * k) / nombre, passage: k === nombre ? i : null});
    }
    cumul += distance;
  }
  return echantillons;
}

// 256 tuiles de 256 × 256 pixels RGBA : 67 Mo au plus, de quoi couvrir la vue 3D sans gonfler pendant la navigation.
const TUILES_EN_MEMOIRE = 256;
const tuiles = new Map();

async function telecharger_pixels(url) {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`${reponse.status} sur ${url}`);
  return (await decoder_png(new Uint8Array(await reponse.arrayBuffer()))).rgba;
}

/** Rendre les pixels RGBA exacts d'une tuile PNG, gardés en mémoire ; un échec n'est pas retenu, la tuile sera redemandée. */
export function pixels_tuile(url) {
  if (!tuiles.has(url)) {
    if (tuiles.size >= TUILES_EN_MEMOIRE) tuiles.delete(tuiles.keys().next().value);
    tuiles.set(url, telecharger_pixels(url).catch((erreur) => {
      tuiles.delete(url);
      throw erreur;
    }));
  }
  return tuiles.get(url);
}

/**
 * Rendre l'altitude du relief (m) sous chaque échantillon, lue dans la source terrarium `source`, ou null si le relief
 * est indisponible (hors ligne, source absente) : le profil se replie alors sur l'altitude de vol seule.
 */
export async function altitudes_relief(echantillons, source) {
  if (!source || source.encodage !== "terrarium") return null;
  try {
    return await Promise.all(echantillons.map(async ({geo}) => {
      const {x, y, px, py} = tuile_de(geo, ZOOM_RELIEF);
      const url = source.tuiles[0].replace("{z}", ZOOM_RELIEF).replace("{x}", x).replace("{y}", y);
      const donnees = await pixels_tuile(url);
      const i = (py * TAILLE_TUILE + px) * 4;
      return altitude_terrarium(donnees[i], donnees[i + 1], donnees[i + 2]);
    }));
  } catch (erreur) {
    console.warn(`Relief indisponible pour le profil : ${erreur.message}`);
    return null;
  }
}
