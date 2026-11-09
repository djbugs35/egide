// Passage géographique → écran, quelle que soit la vue : scope (projection azimutale, camera.js) ou carte MapLibre.
// Tout le dessin passe par ici ; les cercles sont tracés en polygones géodésiques, exacts sur toute projection.
import {direct, geo_deg, vers_degres} from "../moteur/geodesie.js";
import {geo_vers_ecran, vers_monde} from "./camera.js";

// Circonférence équatoriale WGS84 et taille de monde de MapLibre (tuiles de 512 px au zoom 0).
const CIRCONFERENCE = 40_075_016.686;
const TUILE_MONDE = 512;
// Environ 1 km : assez pour que l'écart écran soit mesurable, assez peu pour que la route reste droite.
const PAS_CAP_RAD = 1.6e-4;

/** Rendre la position écran (px) d'une position géographique, pour une caméra de scope ou de carte. */
export function ecran(camera, geo) {
  if (camera.type !== "carte") return geo_vers_ecran(camera, geo);
  const point = camera.carte.project([vers_degres(geo.lon), vers_degres(geo.lat)]);
  return {x: point.x, y: point.y};
}

/**
 * Rendre la rotation (rad, sens horaire à l'écran) d'une silhouette dessinée le nez en haut, au cap `cap` (rad, depuis
 * le nord) en `geo`. Mesurée sur l'écran : elle reste juste quand la carte est tournée, inclinée, ou loin du centre du scope.
 */
export function rotation_ecran(camera, geo, cap) {
  const [depart, arrivee] = [ecran(camera, geo), ecran(camera, {lat: geo.lat + PAS_CAP_RAD * Math.cos(cap), lon: geo.lon + (PAS_CAP_RAD * Math.sin(cap)) / Math.cos(geo.lat)})];
  return Math.atan2(arrivee.x - depart.x, depart.y - arrivee.y);
}

/** Rendre la position géographique (au sol) sous un point écran (px), pour une caméra de scope ou de carte. */
export function geo_depuis_ecran(camera, point) {
  if (camera.type === "carte") {
    const {lng, lat} = camera.carte.unproject([point.x, point.y]);
    return geo_deg(lat, lng, 0);
  }
  // Projection azimutale équidistante : la distance au centre et l'azimut se lisent directement sur le plan.
  const plan = vers_monde(camera, point);
  return direct(camera.origine, Math.atan2(plan.x, plan.y), Math.hypot(plan.x, plan.y));
}

/** Rendre la taille au sol d'un pixel au centre de la vue, en m. */
export function metres_par_pixel(camera) {
  if (camera.type !== "carte") return 1 / camera.echelle;
  const centre = camera.carte.getCenter();
  return (CIRCONFERENCE * Math.cos((centre.lat * Math.PI) / 180)) / (TUILE_MONDE * 2 ** camera.carte.getZoom());
}

// Choix d'interface (MODELE § 12) : jusqu'à ce zoom, les symboles gardent leur taille ; la vue d'un théâtre régional y reste.
const METRES_PAR_PIXEL_PLEINE_TAILLE = 1000;
const ECHELLE_SYMBOLE_MINIMALE = 0.3;
const ECHELLE_NOMS_LISIBLES = 0.5;

/**
 * Rendre le facteur (0,3 à 1, par pas de 0,1) des symboles au zoom de `camera`, en puissance 3/4 de l'échelle : essayé en
 * racine, 40 avions sur 60 px de rayon restaient une tache. Le pas borne le cache des silhouettes teintées (icones.js) à huit tailles.
 */
export function echelle_symboles(camera) {
  const facteur = (METRES_PAR_PIXEL_PLEINE_TAILLE / metres_par_pixel(camera)) ** 0.75;
  return Math.round(Math.max(ECHELLE_SYMBOLE_MINIMALE, Math.min(1, facteur)) * 10) / 10;
}

/** Rendre vrai si, au facteur `echelle` des symboles, les noms ont encore la place d'être écrits. */
export const noms_lisibles = (echelle) => echelle >= ECHELLE_NOMS_LISIBLES;

/** Exécuter `dessin`, tracé en coordonnées écran autour du point `p`, réduit d'un facteur `echelle` autour de ce point. */
export function a_l_echelle(ctx, p, echelle, dessin) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(echelle, echelle);
  ctx.translate(-p.x, -p.y);
  dessin();
  ctx.restore();
}

const cercles = new Map();

/** Rendre les sommets géographiques (mis en cache) du cercle géodésique de `rayon` m autour de `centre`. */
export function cercle_geodesique(centre, rayon, segments = 72) {
  const cle = `${centre.lat},${centre.lon},${rayon},${segments}`;
  if (!cercles.has(cle)) {
    // Le cache ne retient que les derniers cercles : il suit le théâtre affiché, pas l'historique.
    if (cercles.size > 500) cercles.clear();
    cercles.set(cle, Array.from({length: segments}, (_, i) => direct(centre, (2 * Math.PI * i) / segments, rayon)));
  }
  return cercles.get(cle);
}

/** Tracer (chemin seulement) le cercle géodésique de `rayon` m autour de `centre` ; à remplir ou tracer ensuite. */
export function chemin_cercle(ctx, camera, centre, rayon, segments) {
  ctx.beginPath();
  cercle_geodesique(centre, rayon, segments).forEach((sommet, i) => {
    const p = ecran(camera, sommet);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}
