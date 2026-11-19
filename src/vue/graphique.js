// Courbes du balayage : moyenne de chaque grandeur et son intervalle de confiance à 95 %, survol par valeur.
import {COULEURS} from "./couleurs.js";
import {format_decimal, format_intervalle} from "./format.js";
import {t} from "../i18n.js";

export const SERIES = [
  {cle: "fuites", libelle: "vue.graphique.fuites", couleur: COULEURS.hostile},
  {cle: "detruits_air", libelle: "vue.graphique.detruits_air", couleur: COULEURS.ami},
  {cle: "detruits_sol", libelle: "vue.graphique.detruits_sol", couleur: COULEURS.sol},
];

const MARGES = {haut: 16, droite: 150, bas: 40, gauche: 52};
const HAUTEUR = 280;

/** Rendre le pas de graduation « rond » (1, 2 ou 5 × 10^n) qui découpe `maximum` en 4 à 8 intervalles. */
export function pas_rond(maximum) {
  const brut = maximum / 4;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  return [1, 2, 5, 10].map((f) => f * puissance).find((pas) => maximum / pas <= 8);
}

function echelles(points, largeur) {
  const valeurs = points.map((p) => p.valeur);
  const [xMin, xMax] = [Math.min(...valeurs), Math.max(...valeurs)];
  const plafond = Math.max(1, ...points.flatMap((p) => SERIES.map((s) => p.resume[s.cle].moyenne + p.resume[s.cle].ic95)));
  const pas = pas_rond(plafond);
  const yMax = Math.ceil(plafond / pas) * pas;
  const utile = largeur - MARGES.gauche - MARGES.droite;
  return {
    x: (v) => MARGES.gauche + (xMax === xMin ? utile / 2 : ((v - xMin) / (xMax - xMin)) * utile),
    y: (v) => MARGES.haut + (1 - v / yMax) * (HAUTEUR - MARGES.haut - MARGES.bas),
    yMax,
    pas,
  };
}

function axes(echelle, largeur, points, libelleAbscisse) {
  const graduationsY = Array.from({length: Math.round(echelle.yMax / echelle.pas) + 1}, (_, i) => i * echelle.pas);
  const lignes = graduationsY.map((valeur) => {
    const y = echelle.y(valeur);
    return `<line x1="${MARGES.gauche}" x2="${largeur - MARGES.droite}" y1="${y}" y2="${y}" stroke="${COULEURS.grille}"/>
      <text x="${MARGES.gauche - 8}" y="${y + 4}" text-anchor="end">${format_decimal(valeur)}</text>`;
  });
  const graduations = points.map((p) => `<text x="${echelle.x(p.valeur)}" y="${HAUTEUR - MARGES.bas + 18}" text-anchor="middle">${format_decimal(p.valeur)}</text>`);
  const titre = `<text x="${(MARGES.gauche + largeur - MARGES.droite) / 2}" y="${HAUTEUR - 4}" text-anchor="middle">${libelleAbscisse}</text>`;
  return [...lignes, ...graduations, titre].join("");
}

function serie(echelle, points, {cle, couleur, libelle}) {
  const trace = points.map((p, i) => `${i ? "L" : "M"}${echelle.x(p.valeur)},${echelle.y(p.resume[cle].moyenne)}`).join("");
  const marques = points.map((p) => {
    const {moyenne, ic95} = p.resume[cle];
    const x = echelle.x(p.valeur);
    return `<line x1="${x}" x2="${x}" y1="${echelle.y(moyenne - ic95)}" y2="${echelle.y(moyenne + ic95)}" stroke="${couleur}" stroke-width="2"/>
      <circle cx="${x}" cy="${echelle.y(moyenne)}" r="4.5" fill="${couleur}" stroke="${COULEURS.fond}" stroke-width="2"/>`;
  });
  const dernier = points.at(-1);
  const etiquette = `<text x="${echelle.x(dernier.valeur) + 10}" y="${echelle.y(dernier.resume[cle].moyenne) + 4}" fill="${COULEURS.texte}">${libelle}</text>`;
  return `<path d="${trace}" fill="none" stroke="${couleur}" stroke-width="2"/>${marques.join("")}${etiquette}`;
}

/** Rendre le texte de l'infobulle d'une valeur balayée : chaque grandeur avec son IC. */
export function texte_infobulle(point, libelleAbscisse) {
  const lignes = SERIES.map((s) => t("vue.graphique.ligne", {serie: t(s.libelle), valeur: format_intervalle(point.resume[s.cle])}));
  return [`${libelleAbscisse} = ${format_decimal(point.valeur)}`, ...lignes, t("vue.graphique.raids", {n: point.resume.fuites.effectif})].join("\n");
}

/** Dessiner dans `conteneur` les courbes des `points` reçus ({valeur, resume}) ; `surSurvol(point|null, x, y)`. */
export function dessiner_courbes(conteneur, points, libelleAbscisse, surSurvol) {
  if (!points.length) {
    conteneur.innerHTML = "";
    return;
  }
  const largeur = Math.max(420, conteneur.clientWidth);
  const echelle = echelles(points, largeur);
  const zones = points.map((p, i) => {
    const gauche = i ? (echelle.x(points[i - 1].valeur) + echelle.x(p.valeur)) / 2 : MARGES.gauche;
    const droite = i < points.length - 1 ? (echelle.x(p.valeur) + echelle.x(points[i + 1].valeur)) / 2 : largeur - MARGES.droite;
    return `<rect data-indice="${i}" x="${gauche}" y="0" width="${Math.max(1, droite - gauche)}" height="${HAUTEUR}" fill="transparent"/>`;
  });
  conteneur.innerHTML = `<svg viewBox="0 0 ${largeur} ${HAUTEUR}" width="100%" role="img" aria-label="${t("vue.graphique.titre")}">
    <g class="axes">${axes(echelle, largeur, points, libelleAbscisse)}</g>${SERIES.map((s) => serie(echelle, points, s)).join("")}${zones.join("")}</svg>`;
  conteneur.querySelectorAll("rect[data-indice]").forEach((zone) => {
    zone.addEventListener("pointermove", (e) => surSurvol(points[Number(zone.dataset.indice)], e.clientX, e.clientY));
    zone.addEventListener("pointerleave", () => surSurvol(null));
  });
}
