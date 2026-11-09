// Texture cuite d'un maillage (MODELE § 23) : chaque partie est dépliée par projection sur les six faces d'un cube, les îlots sont
// rangés dans une image carrée, puis chaque texel reçoit la couleur d'une fonction de peinture évaluée à sa position 3D.
// Peindre en 3D évite les raccords de camouflage entre îlots ; déplier par partie évite qu'un rotor imprime son ombre sur le toit
// qu'il survole. Rien ici ne décrit un système réel : les peintures privées vivent sous prive/.
import {deflateSync} from "node:zlib";

const BLANC = [1, 1, 1];
// Marge autour d'un îlot (texels) : sans elle, le filtrage des mipmaps fait baver la couleur de l'îlot voisin sur les arêtes.
const MARGE = 3;
const COTE_DEFAUT = 2048;
// Pour chaque axe dominant de la normale, les deux coordonnées qui restent une fois projeté le long de cet axe.
const COORDONNEES = [[2, 1], [0, 2], [0, 1]];
const FOND = [128, 128, 128];

/** Rendre la clé de projection d'un triangle : axe dominant de sa normale moyenne, doublé du signe. */
function vue_triangle(a, b, c) {
  const n = [0, 1, 2].map((i) => a.n[i] + b.n[i] + c.n[i]);
  const axe = n.indexOf(n.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0));
  return (axe < 0 ? 0 : axe) * 2 + (n[axe] < 0 ? 1 : 0);
}

/** Rendre les îlots d'une liste de parties : {partie, axe, triangles (indice du 1er sommet), min, max}, bornes en mètres. */
function former_ilots(parties) {
  const ilots = [];
  parties.forEach((partie, indice) => {
    const parVue = new Map();
    for (let i = 0; i + 2 < partie.length; i += 3) {
      const vue = vue_triangle(partie[i], partie[i + 1], partie[i + 2]);
      if (!parVue.has(vue)) parVue.set(vue, []);
      parVue.get(vue).push(i);
    }
    for (const [vue, triangles] of parVue) {
      const axe = vue >> 1;
      const [ca, cb] = COORDONNEES[axe];
      const valeurs = triangles.flatMap((i) => [partie[i], partie[i + 1], partie[i + 2]]);
      const bornes = (cle, choix) => choix(...valeurs.map((s) => s.p[cle]));
      ilots.push({partie: indice, axe, triangles, min: [bornes(ca, Math.min), bornes(cb, Math.min)], max: [bornes(ca, Math.max), bornes(cb, Math.max)]});
    }
  });
  return ilots;
}

const taille_ilot = (ilot, echelle) => [0, 1].map((i) => Math.max(1, Math.ceil((ilot.max[i] - ilot.min[i]) * echelle)) + 2 * MARGE);

/** Rendre les îlots posés par rangées dans le carré de `cote` texels, ou null s'ils n'y tiennent pas. */
function ranger(ilots, echelle, cote) {
  const tries = ilots.map((ilot) => ({ilot, taille: taille_ilot(ilot, echelle)})).sort((a, b) => b.taille[1] - a.taille[1]);
  let [x, y, hauteur] = [0, 0, 0];
  for (const entree of tries) {
    if (x + entree.taille[0] > cote) [x, y, hauteur] = [0, y + hauteur, 0];
    if (y + entree.taille[1] > cote || entree.taille[0] > cote) return null;
    entree.origine = [x, y];
    x += entree.taille[0];
    hauteur = Math.max(hauteur, entree.taille[1]);
  }
  return tries;
}

/** Rendre le rangement à la plus grande échelle (texels par mètre) qui tient dans l'image, trouvée par dichotomie. */
function ranger_au_mieux(ilots, cote) {
  let [bas, haut, meilleur] = [0.01, cote, ranger(ilots, 0.01, cote)];
  if (!meilleur) throw new Error(`${ilots.length} îlots ne tiennent pas dans ${cote} texels`);
  for (let i = 0; i < 24; i++) {
    const milieu = (bas + haut) / 2;
    const essai = ranger(ilots, milieu, cote);
    if (essai) [bas, meilleur] = [milieu, essai];
    else haut = milieu;
  }
  return {rangement: meilleur, echelle: bas};
}

/** Rendre les coordonnées barycentriques de (x, y) dans le triangle de texels [a, b, c], ou null s'il est plat. */
function barycentre(a, b, c, x, y) {
  const aire = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(aire) < 1e-9) return null;
  const u = ((b[0] - x) * (c[1] - y) - (c[0] - x) * (b[1] - y)) / aire;
  const v = ((c[0] - x) * (a[1] - y) - (a[0] - x) * (c[1] - y)) / aire;
  return [u, v, 1 - u - v];
}

const interpoler = (sommets, poids, cle) => [0, 1, 2].map((i) => sommets[0][cle][i] * poids[0] + sommets[1][cle][i] * poids[1] + sommets[2][cle][i] * poids[2]);
const lineaire_vers_srgb = (v) => Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));

/** Remplir l'image pour un triangle : texels intérieurs, ou, si `debord`, ceux de la marge encore vides, avec le point le plus proche. */
function cuire_triangle(image, ecrits, cote, sommets, texels, rectangle, peindre, debord) {
  const [x0, y0, x1, y1] = rectangle;
  const marge = debord ? MARGE : 0;
  const [xs, ys] = [texels.map((t) => t[0]), texels.map((t) => t[1])];
  const [gauche, droite] = [Math.max(x0, Math.floor(Math.min(...xs)) - marge), Math.min(x1 - 1, Math.ceil(Math.max(...xs)) + marge)];
  const [haut, bas] = [Math.max(y0, Math.floor(Math.min(...ys)) - marge), Math.min(y1 - 1, Math.ceil(Math.max(...ys)) + marge)];
  for (let y = haut; y <= bas; y++) {
    for (let x = gauche; x <= droite; x++) {
      const case_image = y * cote + x;
      if (ecrits[case_image]) continue;
      let poids = barycentre(...texels, x + 0.5, y + 0.5);
      if (!poids) continue;
      if (!debord && Math.min(...poids) < 0) continue;
      if (debord) {
        poids = poids.map((v) => Math.max(0, v));
        const somme = poids[0] + poids[1] + poids[2];
        poids = poids.map((v) => v / somme);
      }
      const n = interpoler(sommets, poids, "n");
      const norme = Math.hypot(...n) || 1;
      const rgb = peindre({p: interpoler(sommets, poids, "p"), n: n.map((v) => v / norme), c: sommets[0].c});
      image.set(rgb.map(lineaire_vers_srgb), case_image * 3);
      ecrits[case_image] = 1;
    }
  }
}

/**
 * Rendre les parties dépliées, blanches (la texture porte la couleur), et l'image PNG de leur peinture.
 *
 * @param {object[][]} parties listes de sommets {p, n, c}.
 * @param {function({p: number[], n: number[], c: number[]}): number[]} peindre couleur linéaire [r, g, b] d'un point (m), selon sa normale et la teinte de sa partie.
 * @param {number} cote côté de l'image (texels).
 * @returns {{parties: object[][], png: Uint8Array, echelle: number}} `echelle` en texels par mètre.
 */
export function habiller(parties, peindre, cote = COTE_DEFAUT) {
  const {rangement, echelle} = ranger_au_mieux(former_ilots(parties), cote);
  const image = new Uint8Array(cote * cote * 3);
  for (let i = 0; i < image.length; i += 3) image.set(FOND, i);
  const ecrits = new Uint8Array(cote * cote);
  const sortie = parties.map((partie) => partie.map((s) => ({...s, c: BLANC, uv: [0, 0]})));
  for (const {ilot, taille, origine} of rangement) {
    const [ca, cb] = COORDONNEES[ilot.axe];
    const rectangle = [origine[0], origine[1], origine[0] + taille[0], origine[1] + taille[1]];
    const vers_texel = (s) => [origine[0] + MARGE + (s.p[ca] - ilot.min[0]) * echelle, origine[1] + MARGE + (s.p[cb] - ilot.min[1]) * echelle];
    const partie = parties[ilot.partie];
    for (const debord of [false, true]) {
      for (const i of ilot.triangles) {
        const sommets = [partie[i], partie[i + 1], partie[i + 2]];
        cuire_triangle(image, ecrits, cote, sommets, sommets.map(vers_texel), rectangle, peindre, debord);
      }
    }
    for (const i of ilot.triangles) {
      for (const k of [0, 1, 2]) {
        const [x, y] = vers_texel(partie[i + k]);
        sortie[ilot.partie][i + k].uv = [x / cote, y / cote];
      }
    }
  }
  return {parties: sortie, png: encoder_png(image, cote), echelle};
}

const TABLE_CRC = Uint32Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(octets) {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc_png(type, donnees) {
  const bloc = new Uint8Array(12 + donnees.length);
  const vue = new DataView(bloc.buffer);
  vue.setUint32(0, donnees.length);
  bloc.set(new TextEncoder().encode(type), 4);
  bloc.set(donnees, 8);
  vue.setUint32(8 + donnees.length, crc32(bloc.subarray(4, 8 + donnees.length)));
  return bloc;
}

/** Rendre le fichier PNG d'une image carrée RVB 8 bits, de haut en bas ; le filtre Sub réduit le fichier d'environ un tiers sur ces images. */
export function encoder_png(rgb, cote) {
  const lignes = new Uint8Array(cote * (cote * 3 + 1));
  for (let y = 0; y < cote; y++) {
    const debut = y * (cote * 3 + 1);
    lignes[debut] = 1;
    for (let i = 0; i < cote * 3; i++) lignes[debut + 1 + i] = rgb[y * cote * 3 + i] - (i >= 3 ? rgb[y * cote * 3 + i - 3] : 0);
  }
  const entete = new Uint8Array(13);
  const vue = new DataView(entete.buffer);
  vue.setUint32(0, cote);
  vue.setUint32(4, cote);
  entete.set([8, 2, 0, 0, 0], 8);
  const blocs = [Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), bloc_png("IHDR", entete), bloc_png("IDAT", deflateSync(lignes, {level: 9})), bloc_png("IEND", new Uint8Array())];
  const fichier = new Uint8Array(blocs.reduce((s, b) => s + b.length, 0));
  let curseur = 0;
  for (const b of blocs) {
    fichier.set(b, curseur);
    curseur += b.length;
  }
  return fichier;
}

/** Rendre un nombre pseudo-aléatoire de [0, 1[, déterminé par des entiers : une peinture se recuit à l'identique. */
export function hasard(...entiers) {
  let h = 2166136261;
  for (const n of entiers) h = Math.imul(h ^ (n | 0), 16777619);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const lisser = (t) => t * t * (3 - 2 * t);

function bruit_valeur(x, y, z) {
  const [ix, iy, iz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  const [fx, fy, fz] = [lisser(x - ix), lisser(y - iy), lisser(z - iz)];
  const coin = (a, b, c) => hasard(ix + a, iy + b, iz + c);
  const ligne = (b, c) => coin(0, b, c) + (coin(1, b, c) - coin(0, b, c)) * fx;
  const plan = (c) => ligne(0, c) + (ligne(1, c) - ligne(0, c)) * fy;
  return plan(0) + (plan(1) - plan(0)) * fz;
}

/** Rendre un bruit fractal de [0, 1] en un point : `octaves` couches de fréquence doublée, pour camouflage, usure et salissures. */
export function bruit(x, y, z, octaves = 4) {
  let [somme, poids, total, frequence] = [0, 1, 0, 1];
  for (let i = 0; i < octaves; i++) {
    somme += poids * bruit_valeur(x * frequence, y * frequence, z * frequence);
    total += poids;
    poids /= 2;
    frequence *= 2;
  }
  return somme / total;
}
