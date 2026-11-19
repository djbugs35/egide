// Vue en profil du plan de vol : altitude en fonction de la distance parcourue, relief en dessous s'il est disponible.
import {COULEURS} from "./couleurs.js";
import {format_decimal, format_entier} from "./format.js";
import {pas_rond} from "./graphique.js";
import {t} from "../i18n.js";

const MARGES = {haut: 18, droite: 20, bas: 34, gauche: 56};
const HAUTEUR = 220;

/**
 * Dessiner dans `conteneur` le profil des `echantillons` ({distance, passage}) : l'altitude de vol `altitudeVol` (m)
 * et, si `relief` n'est pas null, l'altitude du relief sous chaque échantillon.
 */
export function dessiner_profil(conteneur, echantillons, relief, altitudeVol) {
  const largeur = Math.max(420, conteneur.clientWidth);
  const longueur = echantillons.at(-1).distance;
  const plafond = Math.max(altitudeVol, ...(relief ?? [0])) * 1.25 + 10;
  const pasY = pas_rond(plafond);
  const yMax = Math.ceil(plafond / pasY) * pasY;
  const pasX = pas_rond(longueur / 1000) * 1000;
  const x = (d) => MARGES.gauche + (d / longueur) * (largeur - MARGES.gauche - MARGES.droite);
  const y = (h) => MARGES.haut + (1 - Math.max(0, h) / yMax) * (HAUTEUR - MARGES.haut - MARGES.bas);
  const lignesY = Array.from({length: Math.round(yMax / pasY) + 1}, (_, i) => i * pasY).map((h) =>
    `<line x1="${MARGES.gauche}" x2="${largeur - MARGES.droite}" y1="${y(h)}" y2="${y(h)}" stroke="${COULEURS.grille}"/>
     <text x="${MARGES.gauche - 8}" y="${y(h) + 4}" text-anchor="end">${format_entier(h)} m</text>`);
  const graduationsX = Array.from({length: Math.floor(longueur / pasX) + 1}, (_, i) => i * pasX).map((d) =>
    `<text x="${x(d)}" y="${HAUTEUR - MARGES.bas + 16}" text-anchor="middle">${format_decimal(d / 1000)} km</text>`);
  const passages = echantillons.filter((e) => e.passage !== null).map((e) =>
    `<line x1="${x(e.distance)}" x2="${x(e.distance)}" y1="${MARGES.haut}" y2="${HAUTEUR - MARGES.bas}" stroke="${COULEURS.hostile}" stroke-dasharray="2 4" opacity="0.6"/>
     <text x="${x(e.distance)}" y="${MARGES.haut - 4}" text-anchor="middle" fill="${COULEURS.texte}">${e.passage + 1}</text>`);
  const sol = relief
    ? `<path d="M${x(0)},${y(0)} ${echantillons.map((e, i) => `L${x(e.distance)},${y(relief[i])}`).join(" ")} L${x(longueur)},${y(0)} Z" fill="#4a5a6c" stroke="#8b9bab" stroke-width="1"/>`
    : "";
  const vol = `<line x1="${x(0)}" x2="${x(longueur)}" y1="${y(altitudeVol)}" y2="${y(altitudeVol)}" stroke="${COULEURS.hostile}" stroke-width="2"/>
    <text x="${x(longueur) - 4}" y="${y(altitudeVol) - 6}" text-anchor="end" fill="${COULEURS.texte}">${t("vue.profil.essaim_a", {m: format_entier(altitudeVol)})}</text>`;
  const note = relief ? "" : `<p class="note-profil">${t("vue.profil.sans_relief")}</p>`;
  conteneur.innerHTML = `<svg viewBox="0 0 ${largeur} ${HAUTEUR}" width="100%" role="img" aria-label="${t("vue.profil.titre")}">
    ${lignesY.join("")}${graduationsX.join("")}${sol}${passages.join("")}${vol}</svg>${note}`;
}
