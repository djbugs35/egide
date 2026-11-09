// Peintures de modèles 3D (MODELE § 23) : matières brutes, schémas de camouflage, usure et lettrage, évalués en un point de la
// surface par outils/modeles3d/texture.js. Schémas notionnels ; insignes et marquages d'un système réel vivent sous prive/.
import {couleur} from "./maillage.js";
import {bruit, hasard} from "./texture.js";

// Ces teintes sont comparées par identité : une partie construite avec l'une d'elles reçoit la matière correspondante.
export const NOIR = couleur("#15181c");
export const VITRE = couleur("#20303c");
export const METAL = couleur("#59616a");
export const PNEU = couleur("#1b1c1e");
export const PEINT = couleur("#808080");
export const ANTENNE = couleur("#7c8569");

const POLICE = {
  0: "3e 51 49 45 3e", 1: "00 42 7f 40 00", 2: "42 61 51 49 46", 3: "21 41 45 4b 31", 4: "18 14 12 7f 10", 5: "27 45 45 45 39", 6: "3c 4a 49 49 30", 7: "01 71 09 05 03", 8: "36 49 49 49 36", 9: "06 49 49 29 1e",
  A: "7e 11 11 11 7e", B: "7f 49 49 49 36", C: "3e 41 41 41 22", D: "7f 41 41 22 1c", E: "7f 49 49 49 41", F: "7f 09 09 09 01", G: "3e 41 49 49 7a", H: "7f 08 08 08 7f", I: "00 41 7f 41 00", K: "7f 08 14 22 41", L: "7f 40 40 40 40", M: "7f 02 0c 02 7f", N: "7f 04 08 10 7f",
  O: "3e 41 41 41 3e", P: "7f 09 09 09 06", R: "7f 09 19 29 46", S: "46 49 49 49 31", T: "01 01 7f 01 01", U: "3f 40 40 40 3f", V: "1f 20 40 20 1f", X: "63 14 08 14 63", Y: "07 08 70 08 07", Z: "61 51 49 45 43", "-": "08 08 08 08 08", " ": "00 00 00 00 00",
};

export const melange = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const assombrir = (a, k) => a.map((v) => v * k);
export const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export const borne = (v) => Math.min(1, Math.max(0, v));

/** Rendre vrai si `valeur` tombe à moins de `largeur` d'un multiple de `pas`. */
export const proche = (valeur, pas, largeur) => {
  const reste = ((valeur % pas) + pas) % pas;
  return Math.min(reste, pas - reste) < largeur;
};

/** Rendre vrai si (u, v), en mètres depuis le centre du texte, tombe sur un trait de `chaine` haute de `hauteur`. */
export function sur_texte(chaine, u, v, hauteur) {
  const cellule = hauteur / 7;
  const colonne = Math.floor((u + (chaine.length * 6 * cellule) / 2) / cellule);
  const ligne = Math.floor((hauteur / 2 - v) / cellule);
  if (colonne < 0 || ligne < 0 || ligne > 6 || colonne >= chaine.length * 6 || colonne % 6 === 5) return false;
  const lettre = POLICE[chaine[Math.floor(colonne / 6)]];
  return Boolean(lettre) && Boolean((Number.parseInt(lettre.split(" ")[colonne % 6], 16) >> ligne) & 1);
}

/** Rendre vrai si (u, v) est dans une étoile à cinq branches de rayon `r`, centrée, pointe en haut. */
export function sur_etoile(u, v, r) {
  const secteur = (2 * Math.PI) / 5;
  const a = Math.abs((((Math.atan2(u, v) % secteur) + secteur * 1.5) % secteur) - secteur / 2);
  const creux = 0.382 * r;
  const [bx, by] = [creux * Math.sin(secteur / 2), creux * Math.cos(secteur / 2)];
  const [x, y] = [Math.hypot(u, v) * Math.sin(a), Math.hypot(u, v) * Math.cos(a)];
  return bx * (y - r) - (by - r) * x <= 0;
}

/** Rendre l'abscisse de lecture d'un marquage de flanc : un texte se lit de gauche à droite des deux côtés de l'objet. */
export const abscisse_flanc = (p, z0) => (p[0] > 0 ? z0 - p[2] : p[2] - z0);

/** Rendre la surface brute d'un point : verre, caoutchouc, métal ; null pour une partie peinte. */
export function matiere_commune({p, n, c}) {
  const grain = bruit(p[0] * 30, p[1] * 30, p[2] * 30, 2);
  if (c === VITRE) {
    if (proche(p[2], 1.1, 0.03)) return couleur("#1a1c1f");
    return melange(couleur("#070b10"), couleur("#4a5a66"), 0.7 * borne(0.15 + 0.5 * n[1] + 0.5 * bruit(p[0] * 0.7, p[1] * 3, p[2] * 0.7, 2) - 0.25));
  }
  if (c === NOIR) return assombrir(c, 0.75 + 0.5 * grain);
  if (c === PNEU) {
    const sculpture = Math.abs(n[0]) < 0.5 && Math.sin(Math.atan2(n[1], n[2]) * 44) > 0.2;
    const poussiere = borne((bruit(p[0] * 4, p[1] * 4, p[2] * 4) - 0.45) * 2.2);
    return melange(assombrir(couleur("#26262a"), sculpture ? 0.45 : 1), couleur("#6b604c"), poussiere * 0.5);
  }
  if (c === METAL) return assombrir(c, 0.72 + 0.5 * bruit(p[0] * 40, p[1] * 40, p[2] * 2, 2));
  return null;
}

/** Rendre la face d'une antenne à réseau : modules de teinte inégale, séparés par un quadrillage sombre. */
function modules_antenne({p, n, c}) {
  if (Math.abs(n[1]) > 0.75) return assombrir(c, 0.85);
  const pas = 0.25;
  if (proche(p[0], pas, 0.012) || proche(p[1], pas, 0.012)) return assombrir(c, 0.35);
  return assombrir(couleur("#6b735c"), 0.8 + 0.3 * hasard(Math.floor(p[0] / pas), Math.floor(p[1] / pas)));
}

/** Rendre l'usure d'une cellule d'aéronef : panneaux de teinte inégale, joints sombres, coulures dans le sens du vent. */
export function panneaux(p, n, base, {pasZ = 1.15, pasT = 0.85} = {}) {
  const rangee = Math.floor(p[2] / pasZ);
  const transverse = Math.abs(n[1]) > Math.abs(n[0]) ? p[0] : p[1];
  const decalage = hasard(rangee, 7) * pasT;
  let teinte = assombrir(base, 0.93 + 0.14 * hasard(rangee, Math.floor((transverse + decalage) / pasT)));
  teinte = assombrir(teinte, 0.82 + 0.36 * bruit(p[0] * 2.2, p[1] * 2.2, p[2] * 0.25));
  const joint = Math.max(0.006, pasZ * 0.014);
  if (proche(p[2], pasZ, joint) || proche(transverse + decalage, pasT, joint)) return assombrir(teinte, 0.45);
  if (proche(p[2], pasZ / 8, joint / 2.6) && proche(transverse + decalage, pasT, joint * 3)) return assombrir(teinte, 0.7);
  return teinte;
}

/** Rendre l'usure d'un matériel au sol : tôles, salissures de bas de caisse et poussière des dessus. */
export function usure_sol(p, n, base) {
  let teinte = assombrir(base, 0.88 + 0.24 * bruit(p[0] * 1.5, p[1] * 1.5, p[2] * 1.5));
  if (proche(p[2], 1.25, 0.012) && Math.abs(n[0]) > 0.5) teinte = assombrir(teinte, 0.55);
  const boue = borne(((1.55 - p[1]) * 0.9 + bruit(p[0] * 3, p[1] * 5, p[2] * 3) - 0.75) * 2.2);
  teinte = melange(teinte, couleur("#6e5f47"), boue * 0.7);
  if (n[1] > 0.7) teinte = melange(teinte, couleur("#9c9179"), 0.22 * bruit(p[0] * 2.5, p[1] * 2.5, p[2] * 2.5));
  return teinte;
}

// Tons d'un schéma : base, tache claire, tache sombre, dessous (aéronefs). `taille` est l'étendue des taches (m).
const SCHEMA = (base, clair, sombre, dessous, taille) => ({base: couleur(base), clair: clair && couleur(clair), sombre: sombre && couleur(sombre), dessous: dessous && couleur(dessous), taille});
export const SCHEMAS = {
  gris: SCHEMA("#858d95", null, null, "#9aa2a9", 0),
  gris_fonce: SCHEMA("#5b626a", null, null, "#6d747b", 0),
  gris_taches: SCHEMA("#7c8790", "#a3adb5", "#59646e", "#aab3ba", 5),
  bleu_taches: SCHEMA("#6f8798", "#b5c6d1", "#3e5a72", "#c8d4dc", 2.4),
  blanc: SCHEMA("#c9cdce", null, null, "#d6d9da", 0),
  naval: SCHEMA("#8d959b", null, null, null, 0),
  sable: SCHEMA("#b39f78", "#c9b892", "#927f5c", "#c4b48f", 0),
  sable_taches: SCHEMA("#b39f78", "#cdbd99", "#7d6a4b", null, 1.8),
  vert: SCHEMA("#59644a", null, null, "#6f7a62", 0),
  vert_taches: SCHEMA("#59644a", "#6c5a3c", "#2b2a22", "#6f7a62", 1.8),
  vert_russe: SCHEMA("#55613f", "#7a7350", "#303622", null, 1.6),
  noir: SCHEMA("#2b2e33", null, null, "#2b2e33", 0),
};

/** Rendre la base peinte en p selon le schéma : aplat, ou taches à bords nets comme au pochoir. */
function ton_schema(p, n, schema) {
  if (n[1] < -0.45 && schema.dessous) return schema.dessous;
  if (!schema.taille) return schema.base;
  const f = 0.8 / schema.taille;
  const motif = bruit(p[0] * f + 11, p[1] * f, p[2] * f + 5, 3);
  if (motif > 0.585) return schema.sombre;
  if (motif < 0.44) return schema.clair;
  return schema.base;
}

/**
 * Rendre la fonction de peinture d'un objet.
 *
 * @param {object} options
 * @param {string} options.schema clé de SCHEMAS.
 * @param {"air"|"sol"} options.milieu usure à appliquer.
 * @param {number} options.pas pas des panneaux (m), en proportion de l'objet.
 * @param {function(object): (number[]|null)} [options.marque] couleur d'un insigne en ce point, null ailleurs.
 */
export function peinture({schema, milieu = "air", pas = 1.15, marque}) {
  const tons = SCHEMAS[schema];
  return (s) => {
    const brute = matiere_commune(s);
    if (brute) return brute;
    if (s.c === ANTENNE) return modules_antenne(s);
    const insigne = marque?.(s);
    if (insigne) return insigne;
    const base = s.c === PEINT ? ton_schema(s.p, s.n, tons) : s.c;
    return milieu === "air" ? panneaux(s.p, s.n, base, {pasZ: pas, pasT: pas * 0.74}) : usure_sol(s.p, s.n, base);
  };
}
