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
