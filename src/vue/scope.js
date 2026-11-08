// Le scope : assemble le fond et les entités dans l'ordre de lecture, et retrouve l'entité sous le curseur.
import {ecran as projeter_ecran} from "./ecran.js";
import {dessiner_anneaux, dessiner_balayage, dessiner_echelle} from "./cadre.js";
import {dessiner_couvertures} from "./couvertures_vue.js";
import {COULEURS} from "./couleurs.js";
import {parametres_radar, positions_radars} from "../moteur/radars.js";
import {pistes_connues, connu_du_pc} from "./situation.js";
import {calques_par_defaut, element_visible} from "./calques.js";
import {nouvelle_image_libelles} from "./libelles.js";
import {dessiner_pannes, dessiner_reseau} from "./reseau_vue.js";
import {dessiner_avions, dessiner_cibles, dessiner_drones, dessiner_messages, dessiner_radars, dessiner_tirs} from "./symboles.js";

/**
 * Dessiner une image du scope.
 * `etat` : {monde, traces, effets, maintenant (ms), angle (rad, balayage), balayage (bool), survol (entité ou null),
 * calques (voir calques.js), percue (vue du CDC : ce que sait la conduite), inspection (objet inspecté : ses couvertures)}.
 */
export function dessiner_scope(ctx, camera, etat) {
  const {monde, traces, effets, maintenant} = etat;
  const calques = etat.calques ?? calques_par_defaut();
  nouvelle_image_libelles();
  // Sur la carte, le canevas est un calque transparent posé sur le fond MapLibre.
  if (camera.type === "carte") ctx.clearRect(0, 0, camera.largeur, camera.hauteur);
  else {
    ctx.fillStyle = COULEURS.fond;
    ctx.fillRect(0, 0, camera.largeur, camera.hauteur);
  }
  if (etat.balayage && calques.balayage) dessiner_balayage(ctx, camera, monde, etat.angle);
  dessiner_anneaux(ctx, camera, monde, calques);
  dessiner_couvertures(ctx, camera, monde, calques, etat.inspection ?? null);
  dessiner_cibles(ctx, camera, monde, effets, maintenant, calques);
  if (calques.reseau) dessiner_reseau(ctx, camera, monde);
  if (calques.radars) dessiner_radars(ctx, camera, positions_radars(monde.scenario), (i) => icone_radar(monde.scenario, i, calques));
  if (calques.radars || calques.reseau) dessiner_pannes(ctx, camera, monde);
  if (etat.percue) {
    dessiner_drones(ctx, camera, monde, traces, calques, (drone) => connu_du_pc(monde, drone));
    dessiner_pistes(ctx, camera, pistes_connues(monde));
  } else {
    dessiner_drones(ctx, camera, monde, traces, calques);
  }
  if (calques.tirs) dessiner_tirs(ctx, camera, effets, maintenant);
  dessiner_avions(ctx, camera, monde, calques);
  if (calques.messages) dessiner_messages(ctx, camera, effets, maintenant);
  if (etat.survol) dessiner_survol(ctx, camera, etat.survol);
  dessiner_echelle(ctx, camera);
}

/** Tracer les pistes de la conduite : un cercle hostile par piste, d'aire proportionnelle à son effectif. */
function dessiner_pistes(ctx, camera, pistes) {
  ctx.strokeStyle = COULEURS.hostile;
  ctx.fillStyle = COULEURS.hostile;
  ctx.lineWidth = 1.5;
  ctx.font = "bold 11px system-ui, sans-serif";
  for (const {drone, effectif} of pistes) {
    const p = projeter_ecran(camera, drone.geo);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7 + 2.2 * Math.sqrt(effectif), 0, 2 * Math.PI);
    ctx.stroke();
    if (effectif > 1) ctx.fillText(String(effectif), p.x + 9 + 2.2 * Math.sqrt(effectif), p.y - 6);
  }
}

function dessiner_survol(ctx, camera, survol) {
  const ecran = projeter_ecran(camera, survol.objet.geo);
  ctx.strokeStyle = COULEURS.texte;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ecran.x, ecran.y, 11, 0, 2 * Math.PI);
  ctx.stroke();
}

function plus_proche_ecran(camera, elements, position, ecran, rayonPx) {
  let retenu = null;
  let meilleure = rayonPx;
  for (const element of elements) {
    const point = projeter_ecran(camera, position(element));
    const ecart = Math.hypot(point.x - ecran.x, point.y - ecran.y);
    if (ecart <= meilleure) {
      meilleure = ecart;
      retenu = element;
    }
  }
  return retenu;
}

/**
 * Rendre l'entité visible sous la position écran `ecran` : avion, radar, cible ou drone en vol (dans cet ordre), ou
 * null. Une entité d'un calque masqué ne se trouve pas.
 */
export function trouver_sous_curseur(camera, monde, ecran, calques = calques_par_defaut(), percue = false) {
  const visible = (type) => (objet) => element_visible(calques, {type, objet});
  const avion = plus_proche_ecran(camera, monde.avions.filter((a) => !a.perdu && visible("avion")(a)), (a) => a.geo, ecran, 10);
  if (avion) return {type: "avion", objet: avion};
  const radars = calques.radars ? positions_radars(monde.scenario).map((geo, indice) => ({geo, indice})) : [];
  const radar = plus_proche_ecran(camera, radars, (r) => r.geo, ecran, 10);
  if (radar) return {type: "radar", objet: radar, indice: radar.indice};
  const centres = calques.reseau ? monde.reseau.centres.map((c, indice) => ({geo: c.geo, indice})) : [];
  const centre = plus_proche_ecran(camera, centres, (c) => c.geo, ecran, 14);
  if (centre) return centre.indice === 0 ? {type: "conduite", objet: centre} : {type: "centre", objet: centre, indice: centre.indice - 1};
  const indice = !calques.cibles ? -1 : monde.cibles.findIndex((cible) => {
    const point = projeter_ecran(camera, cible.geo);
    return Math.abs(point.x - ecran.x) <= 8 && Math.abs(point.y - ecran.y) <= 8;
  });
  if (indice >= 0) return {type: "cible", objet: monde.cibles[indice], indice};
  const enVol = monde.drones.filter((d) => d.vivant && !d.arrive && monde.t >= d.depart && visible("drone")(d) && (!percue || connu_du_pc(monde, d)));
  const drone = plus_proche_ecran(camera, enVol, (d) => d.geo, ecran, 8);
  return drone ? {type: "drone", objet: drone} : null;
}

/** Rendre l'icône du radar `i` ({icone, pays}) si le calque des icônes est actif et que son modèle en a une. */
function icone_radar(scenario, i, calques) {
  const {icone, pays} = parametres_radar(scenario, i);
  return calques.icones && icone ? {icone, pays} : null;
}
