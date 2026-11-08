// Entités du scope en symbologie inspirée d'APP-6 : ami en dôme (plein = IR, creux = laser), hostile en
// demi-losange, cibles en carré ; bulle de défense sol dont l'opacité suit les munitions restantes.
import {ecrire_nom} from "./libelles.js";
import {cap_drone} from "../moteur/menace.js";
import {chemin_cercle, ecran as projeter_ecran, rotation_ecran} from "./ecran.js";
import {COULEURS} from "./couleurs.js";
import {avancement} from "./effets.js";
import {dessiner_icone, dessiner_silhouette} from "./icones.js";

const TAILLE = 6;

/** Tracer les bulles sol (calque « postes ») et les cibles (calque « cibles »), frappes et impacts récents. */
export function dessiner_cibles(ctx, camera, monde, effets, maintenant, calques) {
  const {sol} = monde.scenario;
  const munitionsInitiales = monde.postes.length ? sol.munitions : 0;
  monde.cibles.forEach((cible, indice) => {
    const ecran = projeter_ecran(camera, cible.geo);
    // Les batteries placées ont leur propre bulle, tracée à leur position (dessiner_batteries).
    const postes = monde.postes.filter((poste) => poste.cible === indice && poste.batterie === undefined);
    if (postes.length && calques.postes) {
      const restantes = postes.reduce((somme, poste) => somme + poste.munitions, 0);
      const part = restantes / (munitionsInitiales / monde.cibles.length);
      ctx.fillStyle = `rgba(184, 134, 11, ${0.05 + 0.13 * part})`;
      ctx.strokeStyle = COULEURS.sol;
      ctx.lineWidth = 1;
      chemin_cercle(ctx, camera, cible.geo, sol.portee, 36);
      ctx.fill();
      ctx.stroke();
    }
    if (!calques.cibles) return;
    // Le centre de conduite visé est tracé par le synoptique du réseau (CDC) ; ici, seulement ses frappes.
    if (cible.conduite) {
      if (monde.fuites[indice]) {
        ctx.fillStyle = COULEURS.hostile;
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillText(`${monde.fuites[indice]} frappes`, ecran.x + 14, ecran.y + 14);
      }
      return;
    }
    const frappe = effets.liste.some((effet) => effet.type === "impact" && effet.cible === indice);
    ctx.fillStyle = frappe ? COULEURS.hostile : COULEURS.fond;
    ctx.strokeStyle = COULEURS.texte;
    ctx.lineWidth = 1.5;
    ctx.fillRect(ecran.x - 5, ecran.y - 5, 10, 10);
    ctx.strokeRect(ecran.x - 5, ecran.y - 5, 10, 10);
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = COULEURS.texte;
    ecrire_nom(ctx, `C${indice + 1}`, ecran.x + 9, ecran.y - 6);
    if (monde.fuites[indice]) {
      ctx.fillStyle = COULEURS.hostile;
      ctx.fillText(`${monde.fuites[indice]} frappes`, ecran.x + 9, ecran.y + 9);
    }
  });
  if (calques.postes) dessiner_batteries(ctx, camera, monde, calques);
  if (calques.cibles) dessiner_impacts(ctx, camera, monde, effets, maintenant);
}

/** Tracer les batteries placées (MODELE § 21.2) : bulle de leur propre portée, opacité selon leurs munitions, symbole et nom. */
function dessiner_batteries(ctx, camera, monde, calques) {
  const initiales = monde.scenario.sol.batteries ?? [];
  for (const poste of monde.postes) {
    if (poste.batterie === undefined) continue;
    const part = poste.munitions / Math.max(1, initiales[poste.batterie]?.munitions ?? 1);
    ctx.fillStyle = `rgba(184, 134, 11, ${0.04 + 0.12 * part})`;
    ctx.strokeStyle = COULEURS.sol;
    ctx.lineWidth = 1;
    chemin_cercle(ctx, camera, poste.geo, poste.unite.portee, 48);
    ctx.fill();
    ctx.stroke();
    const p = projeter_ecran(camera, poste.geo);
    if (calques.icones && poste.unite.icone && dessiner_icone(ctx, p.x, p.y, {icone: poste.unite.icone, pays: poste.unite.pays, camp: COULEURS.sol, taille: 22})) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = COULEURS.sol;
      ecrire_nom(ctx, `B${poste.batterie + 1}`, p.x + 13, p.y + 4);
      continue;
    }
    // Symbole de batterie sol-air : socle et rampe dressée.
    ctx.fillStyle = COULEURS.fond;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y + 5);
    ctx.lineTo(p.x + 7, p.y + 5);
    ctx.lineTo(p.x, p.y - 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = COULEURS.sol;
    ecrire_nom(ctx, `B${poste.batterie + 1}`, p.x + 9, p.y + 4);
  }
}

function dessiner_impacts(ctx, camera, monde, effets, maintenant) {
  for (const effet of effets.liste) {
    if (effet.type !== "impact") continue;
    const progres = avancement(effet, maintenant);
    const ecran = projeter_ecran(camera, monde.cibles[effet.cible].geo);
    ctx.strokeStyle = `rgba(229, 87, 75, ${1 - progres})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ecran.x, ecran.y, 8 + 36 * progres, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

/**
 * Tracer les drones en vol : plots d'historique estompés, puis le symbole hostile (gris tant que non détecté).
 * `montre(drone)` : filtre facultatif (vue du CDC : seulement les drones que la conduite connaît).
 */
export function dessiner_drones(ctx, camera, monde, traces, calques, montre = () => true) {
  for (const [id, plots] of calques.plots ? traces.plots : []) {
    if (!montre(monde.drones[id])) continue;
    plots.forEach((plot, rang) => {
      const ecran = projeter_ecran(camera, plot);
      ctx.fillStyle = `rgba(229, 87, 75, ${0.12 + (0.4 * rang) / plots.length})`;
      ctx.fillRect(ecran.x - 1, ecran.y - 1, 2, 2);
    });
  }
  for (const drone of monde.drones) {
    if (!drone.vivant || drone.arrive || monde.t < drone.depart) continue;
    if (!calques[drone.detection === null ? "drones_inconnus" : "drones_detectes"] || !montre(drone)) continue;
    const ecran = projeter_ecran(camera, drone.geo);
    const couleur = drone.detection === null ? COULEURS.inconnu : COULEURS.hostile;
    const rotation = rotation_ecran(camera, drone.geo, cap_drone(drone));
    if (calques.icones && monde.scenario.rouge.icone && dessiner_silhouette(ctx, ecran.x, ecran.y, monde.scenario.rouge.icone, couleur, undefined, rotation)) continue;
    ctx.fillStyle = couleur;
    ctx.save();
    ctx.translate(ecran.x, ecran.y);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.moveTo(0, -TAILLE * 0.8);
    ctx.lineTo(TAILLE * 0.8, 0);
    ctx.lineTo(-TAILLE * 0.8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Calque d'un vecteur défensif : avions par guidage, drones défensifs ensemble. */
export const calque_vecteur = (avion) => (avion.type && avion.type !== "avion" ? "drones_defensifs" : avion.guidage === "ir" ? "avions_ir" : "avions_laser");

/**
 * Tracer un drone défensif (MODELE § 19), en bleu ami : losange plein pour un drone armé, triangle creux pour un
 * intercepteur à usage unique, cercle barré d'un zigzag pour un brouilleur, avec son rayon d'effet en pointillés.
 */
function dessiner_drone_defensif(ctx, camera, avion, ecran) {
  ctx.strokeStyle = COULEURS.ami;
  ctx.fillStyle = COULEURS.ami;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (avion.type === "drone_arme") {
    ctx.moveTo(ecran.x, ecran.y - 5);
    ctx.lineTo(ecran.x + 5, ecran.y);
    ctx.lineTo(ecran.x, ecran.y + 5);
    ctx.lineTo(ecran.x - 5, ecran.y);
    ctx.closePath();
    ctx.fill();
  } else if (avion.type === "kamikaze") {
    ctx.moveTo(ecran.x, ecran.y - 5);
    ctx.lineTo(ecran.x + 4.5, ecran.y + 4);
    ctx.lineTo(ecran.x - 4.5, ecran.y + 4);
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.arc(ecran.x, ecran.y, 5, 0, 2 * Math.PI);
    ctx.moveTo(ecran.x - 4, ecran.y);
    ctx.lineTo(ecran.x - 1.5, ecran.y - 2.5);
    ctx.lineTo(ecran.x + 1.5, ecran.y + 2.5);
    ctx.lineTo(ecran.x + 4, ecran.y);
    ctx.stroke();
    ctx.setLineDash([2, 4]);
    ctx.globalAlpha *= 0.5;
    chemin_cercle(ctx, camera, avion.geo, avion.groupe.arme.portee, 24);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Tracer les avions et les drones défensifs : symbole ami, ligne pointillée vers le point de mise à poste, estompés une fois vides. */
export function dessiner_avions(ctx, camera, monde, calques) {
  for (const avion of monde.avions) {
    if (avion.perdu || !calques[calque_vecteur(avion)]) continue;
    const ecran = projeter_ecran(camera, avion.geo);
    ctx.globalAlpha = avion.munitions === 0 ? 0.35 : 1;
    if (calques.missions && avion.etat === "ralliement" && avion.point) {
      const but = projeter_ecran(camera, avion.point);
      ctx.strokeStyle = COULEURS.ami;
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ecran.x, ecran.y);
      ctx.lineTo(but.x, but.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (calques.icones && avion.groupe.icone && dessiner_icone(ctx, ecran.x, ecran.y, {icone: avion.groupe.icone, pays: avion.groupe.pays, taille: avion.type && avion.type !== "avion" ? 18 : 22, rotation: rotation_ecran(camera, avion.geo, avion.cap)})) {
      ctx.globalAlpha = 1;
      continue;
    }
    if (avion.type && avion.type !== "avion") {
      dessiner_drone_defensif(ctx, camera, avion, ecran);
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.beginPath();
    ctx.arc(ecran.x, ecran.y + 3, TAILLE + 1, Math.PI, 2 * Math.PI);
    ctx.closePath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COULEURS.ami;
    ctx.fillStyle = COULEURS.ami;
    if (avion.guidage === "ir") ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Tracer les tirs (trait de la couleur du tireur) et les éclats des destructions. */
export function dessiner_tirs(ctx, camera, effets, maintenant) {
  for (const effet of effets.liste) {
    const progres = avancement(effet, maintenant);
    const couleur = effet.couche === "air" ? "74, 152, 232" : effet.couche === "brouillage" ? "180, 142, 232" : "184, 134, 11";
    if (effet.type === "trait") {
      const de = projeter_ecran(camera, effet.de);
      const vers = projeter_ecran(camera, effet.vers);
      ctx.strokeStyle = `rgba(${couleur}, ${0.9 * (1 - progres)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(de.x, de.y);
      ctx.lineTo(vers.x, vers.y);
      ctx.stroke();
    } else if (effet.type === "eclat") {
      const ecran = projeter_ecran(camera, effet.position);
      ctx.strokeStyle = `rgba(255, 241, 204, ${1 - progres})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ecran.x, ecran.y, 2 + 12 * progres, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
}

/**
 * Tracer les radars : symbole d'installation amie (cadre bleu) et parabole, numérotés R1, R2… En disposition
 * « frontière », ce sont les positions qui matérialisent la couverture (MODELE § 15.1).
 */
export function dessiner_radars(ctx, camera, positions, icones = () => null) {
  ctx.font = "11px system-ui, sans-serif";
  positions.forEach((geo, i) => {
    const p = projeter_ecran(camera, geo);
    const icone = icones(i);
    if (icone && dessiner_icone(ctx, p.x, p.y, {...icone, taille: 24})) {
      ctx.fillStyle = COULEURS.ami;
      ecrire_nom(ctx, `R${i + 1}`, p.x + 14, p.y + 4);
      return;
    }
    ctx.fillStyle = COULEURS.fond;
    ctx.strokeStyle = COULEURS.ami;
    ctx.lineWidth = 1.5;
    ctx.fillRect(p.x - 8, p.y - 6, 16, 12);
    ctx.strokeRect(p.x - 8, p.y - 6, 16, 12);
    // Parabole : un arc ouvert vers le haut et son mât.
    ctx.beginPath();
    ctx.arc(p.x, p.y - 3, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.moveTo(p.x, p.y + 2);
    ctx.lineTo(p.x, p.y + 5);
    ctx.stroke();
    ctx.fillStyle = COULEURS.ami;
    ecrire_nom(ctx, `R${i + 1}`, p.x + 11, p.y + 4);
  });
}

/**
 * Tracer la circulation de l'information (MODELE § 17) : impulsion bleue d'un radar vers le CDC (nombre de drones
 * signalés ; rouge barrée si l'information ne va nulle part), impulsion blanche du CDC vers l'avion missionné, éclair
 * jaune quand un avion accroche un drone avec son propre capteur, cercle blanc quand il reçoit sa mission.
 */
export function dessiner_messages(ctx, camera, effets, maintenant) {
  ctx.font = "bold 11px system-ui, sans-serif";
  for (const effet of effets.liste) {
    const f = avancement(effet, maintenant);
    if (effet.type === "message") {
      const [p, q] = [projeter_ecran(camera, effet.de), projeter_ecran(camera, effet.vers)];
      const couleur = effet.perdu ? COULEURS.hostile : effet.sens === "montee" ? COULEURS.ami : COULEURS.selection;
      ctx.strokeStyle = couleur;
      ctx.globalAlpha = 0.5 * (1 - f);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const g = effet.perdu ? Math.min(f, 0.25) : f;
      const m = {x: p.x + (q.x - p.x) * g, y: p.y + (q.y - p.y) * g};
      ctx.fillStyle = couleur;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4.5, 0, 2 * Math.PI);
      ctx.fill();
      if (effet.n) ctx.fillText(String(effet.n), m.x + 7, m.y - 6);
    } else if (effet.type === "contact") {
      const [p, q] = [projeter_ecran(camera, effet.de), projeter_ecran(camera, effet.vers)];
      ctx.strokeStyle = `rgba(232, 211, 106, ${1 - f})`;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (effet.type === "reception") {
      const p = projeter_ecran(camera, effet.position);
      ctx.strokeStyle = `rgba(242, 242, 242, ${1 - f})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8 + 14 * f, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
}
