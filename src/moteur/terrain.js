// Relief dans le moteur (MODELE § 16) : grille d'altitudes du théâtre, masques d'horizon des radars, vue directe des
// liaisons radio. Atmosphère standard : rayons droits sur une Terre de rayon effectif k R_T, k = 4/3.
import {direct, soustraire, vers_ecef, vers_enu} from "./geodesie.js";
import {RAYON_TERRESTRE_EFFECTIF} from "./geometrie.js";

/** Nombre de secteurs d'azimut d'un masque d'horizon (1° chacun). */
export const AZIMUTS = 360;

const grilles = new Map();

/** Rendre les octets décodés d'une chaîne base64 (atob : Node ≥ 16 et navigateurs). */
function octets_base64(texte) {
  const brut = atob(texte);
  const octets = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}

/**
 * Rendre la grille décodée d'un terrain résolu (unité de unites/terrains/, en SI) : origine sud-ouest, pas en
 * radians, altitudes en m (Int16, lignes du sud au nord). Décodée une fois par terrain.
 */
export function grille_terrain(terrain) {
  const cle = terrain.id;
  // Comparer le texte, pas sa longueur : un terrain retouché garde son identifiant et la taille de sa grille.
  if (grilles.get(cle)?.source !== terrain.altitudes_b64) {
    const octets = octets_base64(terrain.altitudes_b64);
    const z = new Int16Array(octets.buffer, octets.byteOffset, octets.byteLength / 2);
    if (z.length !== terrain.lignes * terrain.colonnes) throw new Error(`terrain ${terrain.id} : ${z.length} altitudes pour ${terrain.lignes} × ${terrain.colonnes}`);
    grilles.set(cle, {lat_sud: terrain.lat_sud, lon_ouest: terrain.lon_ouest, pas_lat: terrain.pas_lat, pas_lon: terrain.pas_lon,
      lignes: terrain.lignes, colonnes: terrain.colonnes, pas_m: terrain.pas, z, source: terrain.altitudes_b64});
  }
  return grilles.get(cle);
}

/** Rendre l'altitude du sol en `geo` (m), interpolée entre les quatre nœuds voisins ; 0 hors de la grille. */
export function altitude_sol(grille, geo) {
  const y = (geo.lat - grille.lat_sud) / grille.pas_lat;
  const x = (geo.lon - grille.lon_ouest) / grille.pas_lon;
  if (y < 0 || x < 0 || y > grille.lignes - 1 || x > grille.colonnes - 1) return 0;
  const [i, j] = [Math.min(Math.floor(y), grille.lignes - 2), Math.min(Math.floor(x), grille.colonnes - 2)];
  const [fy, fx] = [y - i, x - j];
  const z = (a, b) => grille.z[(i + a) * grille.colonnes + j + b];
  return (1 - fy) * ((1 - fx) * z(0, 0) + fx * z(0, 1)) + fy * ((1 - fx) * z(1, 0) + fx * z(1, 1));
}

/** Rendre l'angle de site (rad, petits angles) d'un point d'altitude `z` à `s` m d'une antenne d'altitude `za`. */
export const angle_site = (z, za, s) => (z - za) / s - s / (2 * RAYON_TERRESTRE_EFFECTIF);

/**
 * Rendre le masque d'horizon d'une antenne posée en `site` à `hauteur` m au-dessus du sol : pour chaque secteur
 * d'azimut et chaque pas de distance k (jusqu'à `portee`), le plus grand angle de site du relief entre l'antenne et
 * k pas. Une cible est vue si son angle de site dépasse celui du relief qui la précède (MODELE § 16.2).
 */
export function masque_horizon(grille, site, hauteur, portee) {
  const pas = grille.pas_m;
  const etapes = Math.ceil(portee / pas) + 1;
  const za = altitude_sol(grille, site) + hauteur;
  const angles = new Float32Array(AZIMUTS * etapes).fill(-Infinity);
  for (let a = 0; a < AZIMUTS; a++) {
    const azimut = ((a + 0.5) * 2 * Math.PI) / AZIMUTS;
    let maximum = -Infinity;
    for (let k = 1; k < etapes; k++) {
      const s = k * pas;
      maximum = Math.max(maximum, angle_site(altitude_sol(grille, direct(site, azimut, s)), za, s));
      angles[a * etapes + k] = maximum;
    }
  }
  return {site, za, pas, etapes, angles, ecef: vers_ecef({...site, alt: 0})};
}

/** Rendre vrai si un point au-dessus du sol en `geo`, à `hauteur` m du sol, est vu par l'antenne du `masque`. */
export function vu_par(masque, grille, geo, ecef, hauteur) {
  const {e, n} = vers_enu(masque.site, soustraire(ecef, masque.ecef));
  const s = Math.hypot(e, n);
  if (s < masque.pas) return true;
  const k = Math.floor(s / masque.pas);
  if (k >= masque.etapes) return false;
  const a = Math.floor(((Math.atan2(e, n) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * AZIMUTS) % AZIMUTS;
  return angle_site(altitude_sol(grille, geo) + hauteur, masque.za, s) > masque.angles[a * masque.etapes + k];
}

/**
 * Rendre vrai si deux antennes se voient au-dessus du relief : altitudes absolues `za` en `a` et `zb` en `b`
 * (positions géographiques), rayon droit sur la Terre de rayon effectif, échantillonné au pas de la grille.
 */
export function vue_directe(grille, a, za, b, zb, distance) {
  const etapes = Math.ceil(distance / grille.pas_m);
  for (let k = 1; k < etapes; k++) {
    const f = k / etapes;
    const point = {lat: a.lat + f * (b.lat - a.lat), lon: a.lon + f * (b.lon - a.lon)};
    const s = f * distance;
    const rayon = za + f * (zb - za) - (s * (distance - s)) / (2 * RAYON_TERRESTRE_EFFECTIF);
    if (altitude_sol(grille, point) >= rayon) return false;
  }
  return true;
}

/** Rendre la couverture réelle d'un masque contre une cible à `hauteur` m du sol : portée vue dans chaque secteur. */
export function couverture_reelle(masque, grille, hauteur) {
  return Array.from({length: AZIMUTS}, (_, a) => {
    const azimut = ((a + 0.5) * 2 * Math.PI) / AZIMUTS;
    for (let k = 1; k < masque.etapes; k++) {
      const s = k * masque.pas;
      const geo = direct(masque.site, azimut, s);
      if (angle_site(altitude_sol(grille, geo) + hauteur, masque.za, s) <= masque.angles[a * masque.etapes + k - 1]) return {azimut, portee: (k - 1) * masque.pas};
    }
    return {azimut, portee: (masque.etapes - 1) * masque.pas};
  });
}
