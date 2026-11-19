// Fond de la situation : anneaux de distance gradués, frontière, couverture radar, balayage, barre d'échelle.
// Tracés en polygones géodésiques : justes sur le scope comme sur la carte, à plat comme sur le globe.
import {direct} from "../moteur/geodesie.js";
import {longueur_ronde} from "./camera.js";
import {COULEURS} from "./couleurs.js";
import {chemin_cercle, ecran, metres_par_pixel} from "./ecran.js";
import {format_distance} from "./format.js";
import {couverture_reelle} from "../moteur/terrain.js";
import {t} from "../i18n.js";

const couvertures = new WeakMap();

/** Rendre (en mémoire par masque) la couverture réelle d'un radar contre un drone à sa hauteur au-dessus du sol. */
function couverture_radar(masque, reseau) {
  if (!couvertures.has(masque)) couvertures.set(masque, couverture_reelle(masque, reseau.grille, reseau.hauteur_drones));
  return couvertures.get(masque);
}

const ESPACEMENT_ANNEAUX = 50_000;
const POLICE_PETITE = "11px system-ui, sans-serif";

/** Tracer la frontière de la zone et, selon les calques, les anneaux tous les 50 km et la couverture radar. */
export function dessiner_anneaux(ctx, camera, monde, calques) {
  const {origine, zone_rayon: zone} = monde.scenario.theatre;
  ctx.lineWidth = 1;
  ctx.font = POLICE_PETITE;
  for (let rayon = ESPACEMENT_ANNEAUX; calques.anneaux && rayon < monde.rayonDetection; rayon += ESPACEMENT_ANNEAUX) {
    ctx.strokeStyle = COULEURS.grille;
    chemin_cercle(ctx, camera, origine, rayon);
    ctx.stroke();
    const etiquette = ecran(camera, direct(origine, Math.PI / 4, rayon));
    ctx.fillStyle = COULEURS.texte_secondaire;
    ctx.fillText(format_distance(rayon), etiquette.x + 4, etiquette.y - 4);
  }
  ctx.strokeStyle = COULEURS.texte_secondaire;
  ctx.lineWidth = 1.5;
  chemin_cercle(ctx, camera, origine, zone, 144);
  ctx.stroke();
  if (calques.couverture) dessiner_couverture(ctx, camera, monde);
}

/** Tracer la couverture radar : le cercle de la couverture frontière, ou la portée de chaque radar placé. */
function dessiner_couverture(ctx, camera, monde) {
  const {origine} = monde.scenario.theatre;
  const sites = monde.couverture.sites;
  if (monde.reseau.masques) return dessiner_couverture_reelle(ctx, camera, monde.reseau);
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = COULEURS.ami;
  ctx.lineWidth = 1;
  if (sites) {
    ctx.fillStyle = "rgba(74, 152, 232, 0.05)";
    for (const site of sites) {
      chemin_cercle(ctx, camera, site.geo, site.portee, 96);
      ctx.fill();
      ctx.stroke();
    }
    ctx.setLineDash([]);
    return;
  }
  chemin_cercle(ctx, camera, origine, monde.rayonDetection, 144);
  ctx.stroke();
  ctx.setLineDash([]);
  const nord = ecran(camera, direct(origine, 0, monde.rayonDetection));
  ctx.fillStyle = COULEURS.ami;
  ctx.textAlign = "center";
  ctx.fillText(t("vue.cadre.couverture"), nord.x, nord.y - 8);
  ctx.textAlign = "start";
}

/** Tracer la couverture réelle de chaque radar sur le relief : la portée vue dans chaque degré d'azimut (MODELE § 16.2). */
function dessiner_couverture_reelle(ctx, camera, reseau) {
  ctx.setLineDash([]);
  ctx.strokeStyle = COULEURS.ami;
  ctx.fillStyle = "rgba(74, 152, 232, 0.07)";
  ctx.lineWidth = 1;
  reseau.masques.forEach((masque, i) => {
    if (reseau.radars_hs[i]) return;
    ctx.beginPath();
    couverture_radar(masque, reseau).forEach(({azimut, portee}, k) => {
      const p = ecran(camera, direct(masque.site, azimut, Math.max(portee, 500)));
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

/** Tracer le faisceau tournant : depuis le centre (couverture frontière) ou depuis chaque radar placé. */
export function dessiner_balayage(ctx, camera, monde, angle) {
  const sites = monde.couverture.sites;
  if (!sites) return dessiner_faisceau(ctx, camera, monde.scenario.theatre.origine, monde.rayonDetection, angle);
  for (const site of sites) dessiner_faisceau(ctx, camera, site.geo, site.portee, angle);
}

/** Tracer un faisceau : un secteur de 40° qui s'estompe, en azimut vrai, de rayon `rayon` autour de `origine`. */
function dessiner_faisceau(ctx, camera, origine, rayon, angle) {
  const traine = (40 * Math.PI) / 180;
  const centre = ecran(camera, origine);
  const pas = 12;
  for (let i = 0; i < pas; i++) {
    const a0 = angle - traine + (traine * i) / pas;
    const a1 = a0 + traine / pas;
    const p0 = ecran(camera, direct(origine, a0, rayon));
    const p1 = ecran(camera, direct(origine, a1, rayon));
    ctx.fillStyle = `rgba(74, 152, 232, ${(0.16 * (i + 1)) / pas})`;
    ctx.beginPath();
    ctx.moveTo(centre.x, centre.y);
    ctx.lineTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.closePath();
    ctx.fill();
  }
}

/** Tracer la barre d'échelle en bas à gauche, d'une longueur ronde mesurée au centre de la vue. */
export function dessiner_echelle(ctx, camera) {
  const mpp = metres_par_pixel(camera);
  const longueur = longueur_ronde(mpp, 120);
  const pixels = longueur / mpp;
  const x = 16;
  const y = camera.hauteur - 18;
  ctx.strokeStyle = COULEURS.texte;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y);
  ctx.lineTo(x + pixels, y);
  ctx.lineTo(x + pixels, y - 5);
  ctx.stroke();
  ctx.fillStyle = COULEURS.texte;
  ctx.font = POLICE_PETITE;
  ctx.fillText(format_distance(longueur), x + pixels + 8, y + 3);
}
