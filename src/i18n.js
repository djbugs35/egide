// Langues de l'interface et des messages (docs/PLAN_V3.md, jalon 27) : un dictionnaire plat par langue dans
// langues/<code>.json, clé → texte. Pur, sans DOM ni réseau : sert au navigateur, à Node et aux tests.
//
// Un texte peut porter des paramètres {nom} et, pour les pluriels, être un objet {"one": "…", "other": "…"} choisi
// par Intl.PluralRules sur le paramètre n. Une clé absente de la langue retombe sur l'anglais, puis s'affiche
// ⟦clé⟧ : visible à l'écran, et refusée par les tests.

/** Langues disponibles : code → nom dans sa propre langue, et code régional pour les nombres. */
export const LANGUES = {
  en: {nom: "English", region: "en-GB"},
  fr: {nom: "Français", region: "fr-FR"},
};
export const LANGUE_PAR_DEFAUT = "en";

// État initial français, sans dictionnaire : le moteur et les tests gardent leurs nombres à la française tant
// qu'aucune langue n'est installée ; le navigateur installe la langue choisie avant tout affichage.
let courante = {langue: "fr", dico: {}, secours: {}, pluriels: new Intl.PluralRules("fr-FR")};

/** Installer la langue `langue` avec son dictionnaire et celui de secours (l'anglais). */
export function installer_langue(langue, dico, secours = {}) {
  const region = LANGUES[langue]?.region ?? langue;
  courante = {langue, dico, secours, pluriels: new Intl.PluralRules(region)};
}

/** Rendre le code de la langue installée (« en », « fr »). */
export const langue = () => courante.langue;

/** Rendre le code régional de la langue installée, pour Intl (« en-GB », « fr-FR »). */
export const region = () => LANGUES[courante.langue]?.region ?? courante.langue;

/** Rendre vrai si la clé existe dans la langue installée ou dans celle de secours. */
export const existe = (cle) => cle in courante.dico || cle in courante.secours;

/** Rendre le texte de `cle` dans la langue installée, paramètres {nom} remplacés ; ⟦clé⟧ s'il manque partout. */
export function t(cle, parametres = {}) {
  let texte = courante.dico[cle] ?? courante.secours[cle];
  if (texte === undefined) return `⟦${cle}⟧`;
  if (typeof texte === "object") texte = texte[courante.pluriels.select(Number(parametres.n ?? 0))] ?? texte.other;
  return texte.replace(/\{(\w+)\}/g, (motif, nom) => (nom in parametres ? String(parametres[nom]) : motif));
}

/**
 * Rendre le code de la langue à utiliser : celle de l'adresse (?lang=fr), sinon celle mémorisée, sinon l'anglais.
 * Une valeur inconnue est ignorée.
 */
export function choisir_langue({adresse = "", memorisee = null} = {}) {
  const demandee = /[?&]lang=([a-z]{2})/.exec(adresse)?.[1];
  for (const code of [demandee, memorisee]) if (code && code in LANGUES) return code;
  return LANGUE_PAR_DEFAUT;
}
