// Noms d'unités sans chevauchement (jalon 13) : quand deux noms se recouvrent à l'écran, seul le premier posé s'écrit.
// On ne passe ici que des noms, retrouvables au survol ; un chiffre du bilan s'écrit toujours.

const HAUTEUR_LIGNE = 12;
const MARGE = 2;
let occupes = [];

/** Oublier les noms de l'image précédente : à appeler au début de chaque image. */
export function nouvelle_image_libelles() {
  occupes = [];
}

/** Rendre vrai si les rectangles {x0, y0, x1, y1} `a` et `b` se recouvrent. */
export const recouvrent = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Écrire le nom `texte` à (x, y), ligne de base en y, sauf s'il recouvre un nom déjà écrit dans cette image. */
export function ecrire_nom(ctx, texte, x, y) {
  const cadre = {x0: x - MARGE, y0: y - HAUTEUR_LIGNE, x1: x + ctx.measureText(texte).width + MARGE, y1: y + MARGE};
  if (occupes.some((autre) => recouvrent(cadre, autre))) return;
  occupes.push(cadre);
  ctx.fillText(texte, x, y);
}
