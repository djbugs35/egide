// Icônes de jeu (clé « icone » des unités, fichiers icones/*.svg) : silhouette blanche vue de dessus sur une pastille
// aux couleurs du pays, cerclée de la couleur du camp. Chaque silhouette est teintée une fois puis gardée en mémoire.
import {chemin_icone} from "../moteur/catalogue.js";
import {COULEURS} from "./couleurs.js";
import {couleur_pays} from "./pays.js";

const sources = new Map();
const teintes = new Map();
// Les silhouettes sont rendues au double de leur taille d'affichage : nettes sur un écran haute densité.
const SURECHANTILLON = 2;

function source(icone) {
  if (!sources.has(icone)) {
    const image = new Image();
    image.src = new URL(`../../${chemin_icone(icone)}`, import.meta.url).href;
    sources.set(icone, image);
  }
  return sources.get(icone);
}

/** Rendre la silhouette `icone` teintée de `couleur` à `taille` px, ou null tant que le fichier n'est pas chargé. */
function teinte(icone, couleur, taille) {
  const cle = `${icone}|${couleur}|${taille}`;
  if (teintes.has(cle)) return teintes.get(cle);
  const image = source(icone);
  if (!image.complete || !image.naturalWidth) return null;
  const toile = document.createElement("canvas");
  toile.width = toile.height = Math.ceil(taille * SURECHANTILLON);
  const ctx = toile.getContext("2d");
  ctx.drawImage(image, 0, 0, toile.width, toile.height);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = couleur;
  ctx.fillRect(0, 0, toile.width, toile.height);
  teintes.set(cle, toile);
  return toile;
}

/** Rendre vrai si l'icône est prête à être dessinée (sinon l'appelant garde le symbole APP-6 pour cette image). */
export const icone_prete = (icone) => Boolean(icone) && source(icone).complete && source(icone).naturalWidth > 0;

/**
 * Dessiner l'icône d'une unité amie ou neutre en (x, y) : pastille du pays (couleur du camp pour une unité générique),
 * liseré du camp, silhouette blanche. `camp` : couleur du liseré ; `rotation` : voir rotation_ecran (la pastille ne tourne pas).
 */
export function dessiner_icone(ctx, x, y, {icone, pays, camp = COULEURS.ami, taille = 22, rotation = 0}) {
  const silhouette = teinte(icone, "#ffffff", taille * 0.62);
  if (!silhouette) return false;
  ctx.beginPath();
  ctx.arc(x, y, taille / 2, 0, 2 * Math.PI);
  ctx.fillStyle = couleur_pays(pays, "#24384f");
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = camp;
  ctx.stroke();
  poser_tournee(ctx, silhouette, x, y, taille * 0.62, rotation);
  return true;
}

/** Dessiner une silhouette seule, teintée (essaim adverse : des centaines à la fois, sans pastille), tournée de `rotation`. */
export function dessiner_silhouette(ctx, x, y, icone, couleur, taille = 12, rotation = 0) {
  const silhouette = teinte(icone, couleur, taille);
  if (!silhouette) return false;
  poser_tournee(ctx, silhouette, x, y, taille, rotation);
  return true;
}

/** Poser `image` centrée en (x, y), carrée de `cote` px, tournée de `rotation` rad (sens horaire à l'écran). */
function poser_tournee(ctx, image, x, y, cote, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(image, -cote / 2, -cote / 2, cote, cote);
  ctx.restore();
}
