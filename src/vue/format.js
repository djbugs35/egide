// Mise en forme des grandeurs affichées : unités toujours écrites, nombres selon la langue installée (src/i18n.js).
// Pur, testé.
import {region} from "../i18n.js";

// Formats rangés par région : en changer de langue n'en recrée qu'un par région.
const formats = new Map();
function format_nombre(decimales) {
  const cle = `${region()}|${decimales}`;
  if (!formats.has(cle)) formats.set(cle, new Intl.NumberFormat(region(), {maximumFractionDigits: decimales}));
  return formats.get(cle);
}
const ENTIER = {format: (valeur) => format_nombre(0).format(valeur)};
const DECIMAL = {format: (valeur) => format_nombre(1).format(valeur)};

/** Rendre une durée en s sous la forme « 12:05 » (minutes:secondes). */
export function format_duree(secondes) {
  const total = Math.max(0, Math.floor(secondes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Rendre un entier selon la langue (en français, espace insécable fine entre milliers). */
export const format_entier = (valeur) => ENTIER.format(valeur);

/** Rendre un nombre avec au plus une décimale, selon la langue. */
export const format_decimal = (valeur) => DECIMAL.format(valeur);

/** Rendre une distance en m sous forme lisible : « 800 m » ou « 12,5 km ». */
export const format_distance = (metres) => (metres < 1000 ? `${ENTIER.format(metres)} m` : `${DECIMAL.format(metres / 1000)} km`);

/** Rendre une moyenne et son intervalle de confiance : « 187,2 ± 10,5 ». */
export const format_intervalle = (resume) => `${DECIMAL.format(resume.moyenne)} ± ${DECIMAL.format(resume.ic95)}`;

/** Rendre `texte` sans danger dans du HTML. */
export const echapper_html = (texte) => texte.replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
