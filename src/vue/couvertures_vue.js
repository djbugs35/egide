// Affichage des couvertures (MODELE § 25) : ce qu'il faut montrer selon les calques et l'objet inspecté, partagé entre la
// 2D et la 3D. Chaque enveloppe vient du moteur (couvertures.js) ; ici, on ne calcule aucune portée.
import {couvertures, rayon_dans} from "../moteur/couvertures.js";
import {direct} from "../moteur/geodesie.js";
import {COULEURS} from "./couleurs.js";
import {ecran} from "./ecran.js";

const SEGMENTS = 72;
const GENRES = ["detection", "conduite", "interception"];
const COULEUR_GENRE = {detection: COULEURS.ami, conduite: COULEURS.conduite, interception: COULEURS.interception};
const NOM_GENRE = {detection: "détection", conduite: "conduite", interception: "interception"};
// Un objet fixe garde son contour : le redessiner à chaque image coûterait 72 calculs géodésiques par objet et par enveloppe.
const contours = new Map();
const CONTOURS_MAX = 3000;

/** Rendre le contour géographique de l'enveloppe `genre` d'un objet, tenant compte du relief. */
export function contour_objet(objet, genre) {
  const calculer = () => Array.from({length: SEGMENTS}, (_, i) => {
    const azimut = (2 * Math.PI * i) / SEGMENTS;
    return direct(objet.geo, azimut, rayon_dans(objet, genre, azimut));
  });
  if (objet.genre === "vecteur") return calculer();
  const cle = `${objet.geo.lat},${objet.geo.lon},${genre},${objet[genre]},${objet.profil ? objet.noeud : ""}`;
  if (!contours.has(cle)) {
    if (contours.size > CONTOURS_MAX) contours.clear();
    contours.set(cle, calculer());
  }
  return contours.get(cle);
}

/**
 * Rendre {objets, c2} désignés par l'inspection ({type, id}) : l'objet seul, ou tous les membres du centre (`c2` : son
 * rang, sinon null). Un drone n'a pas de couverture.
 */
export function enveloppes_inspectees({objets, c2}, inspection) {
  const type = inspection?.type;
  if (type === "conduite" || type === "centre") {
    const rang = type === "conduite" ? 0 : inspection.id + 1;
    return {objets: c2[rang].membres.map((m) => objets[m]), c2: rang};
  }
  const garde = {radar: (o) => o.genre === "radar" && o.id === inspection.id, cible: (o) => o.genre === "poste" && o.id === `sol:${inspection.id}`, avion: (o) => o.genre === "vecteur" && o.id === inspection.id}[type];
  return {objets: garde ? objets.filter(garde) : [], c2: null};
}

/**
 * Rendre les enveloppes à tracer : [{objets, genre, couleur, largeur, union}]. Calques : conduite et interception de tous les objets,
 * résultante de chaque centre en état. L'objet inspecté montre toujours les siennes, plus marquées.
 */
export function enveloppes_a_montrer(monde, calques, inspection) {
  const choix = ["conduite", "centre", "radar", "cible", "avion"].includes(inspection?.type);
  if (!calques.conduite_tir && !calques.interception && !calques.resultante_c2 && !choix) return [];
  const donnees = couvertures(monde);
  const liste = [];
  if (calques.conduite_tir) liste.push({objets: donnees.objets, genre: "conduite", couleur: COULEURS.conduite, largeur: 1, union: true});
  if (calques.interception) liste.push({objets: donnees.objets, genre: "interception", couleur: COULEURS.interception, largeur: 1, union: true});
  if (calques.resultante_c2) {
    for (const centre of donnees.c2.filter((c) => !c.hs)) {
      const objets = centre.membres.map((m) => donnees.objets[m]);
      liste.push(...GENRES.map((genre) => ({objets, genre, couleur: COULEURS.resultante, largeur: 1, union: true})));
    }
  }
  if (choix) {
    const {objets, c2} = enveloppes_inspectees(donnees, inspection);
    liste.push(...GENRES.map((genre) => ({objets, genre, couleur: c2 === null ? COULEUR_GENRE[genre] : COULEURS.resultante, largeur: 2, union: c2 !== null})));
  }
  return liste;
}

/** Ajouter au chemin courant le contour de `genre` d'un objet. */
function ajouter_contour(ctx, camera, objet, genre) {
  contour_objet(objet, genre).forEach((sommet, i) => {
    const p = ecran(camera, sommet);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

/** Écrire la portée au nord d'une enveloppe, pour lire le chiffre sur la carte. */
function ecrire_portee(ctx, camera, objet, genre, couleur) {
  const p = ecran(camera, direct(objet.geo, 0, objet[genre]));
  ctx.fillStyle = couleur;
  ctx.textAlign = "center";
  ctx.fillText(`${NOM_GENRE[genre]} ${Math.round(objet[genre] / 100) / 10} km`, p.x, p.y - 4);
  ctx.textAlign = "start";
}

// Toile de travail d'une union : on y efface l'intérieur du tracé sans toucher à ce qui est déjà dessiné.
let toile_union = null;

function toile_de_travail(ctx) {
  toile_union ??= document.createElement("canvas");
  if (toile_union.width !== ctx.canvas.width || toile_union.height !== ctx.canvas.height) [toile_union.width, toile_union.height] = [ctx.canvas.width, ctx.canvas.height];
  const travail = toile_union.getContext("2d");
  travail.setTransform(1, 0, 0, 1, 0, 0);
  travail.clearRect(0, 0, toile_union.width, toile_union.height);
  travail.setTransform(ctx.getTransform());
  return travail;
}

/**
 * Dessiner l'union des enveloppes : remplissage et contour extérieur seul. Sans cela, 60 cercles superposés rendaient
 * la carte illisible. Effacer l'intérieur après le tracé ne laisse que la moitié externe du trait, d'où l'épaisseur double.
 */
function tracer_union(ctx, camera, objets, genre, couleur, largeur) {
  const travail = toile_de_travail(ctx);
  travail.beginPath();
  for (const objet of objets) ajouter_contour(travail, camera, objet, genre);
  travail.strokeStyle = couleur;
  travail.lineWidth = 2 * largeur;
  travail.stroke();
  travail.globalCompositeOperation = "destination-out";
  travail.fill();
  travail.globalCompositeOperation = "source-over";
  travail.globalAlpha = 0.1;
  travail.fillStyle = couleur;
  travail.fill();
  travail.globalAlpha = 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(toile_union, 0, 0);
  ctx.restore();
}

/** Dessiner les enveloppes d'objets inspectés, chacune visible, avec sa portée écrite. */
function tracer_separees(ctx, camera, objets, genre, couleur, largeur) {
  for (const objet of objets) {
    ctx.beginPath();
    ajouter_contour(ctx, camera, objet, genre);
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = couleur;
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = couleur;
    ctx.lineWidth = largeur;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ecrire_portee(ctx, camera, objet, genre, couleur);
  }
}

/** Dessiner les couvertures sur une image 2D. */
export function dessiner_couvertures(ctx, camera, monde, calques, inspection) {
  for (const {objets, genre, couleur, largeur, union} of enveloppes_a_montrer(monde, calques, inspection)) {
    const utiles = objets.filter((o) => o[genre] > 0);
    if (!utiles.length) continue;
    (union ? tracer_union : tracer_separees)(ctx, camera, utiles, genre, couleur, largeur);
  }
}
