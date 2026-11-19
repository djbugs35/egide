// Pays d'inspiration des unités du catalogue (clé « pays », code ISO 3166 à trois lettres) : nom affiché et couleur
// de pastille des icônes de jeu. Une couleur de classement, pas un emblème : ni drapeau, ni cocarde ; jamais le rouge,
// réservé à la menace détectée. Les noms sont des clés de langues/*.json (nom_pays).
import {t} from "../i18n.js";

export const PAYS = {
  AUS: {nom: "vue.pays.aus", couleur: "#2f8fb5"},
  BLR: {nom: "vue.pays.blr", couleur: "#6b8f3f"},
  BRA: {nom: "vue.pays.bra", couleur: "#2e9e5b"},
  CHE: {nom: "vue.pays.che", couleur: "#7a5a9e"},
  CHN: {nom: "vue.pays.chn", couleur: "#b58a2c"},
  DEU: {nom: "vue.pays.deu", couleur: "#6b6b6b"},
  FRA: {nom: "vue.pays.fra", couleur: "#2f5fb3"},
  GBR: {nom: "vue.pays.gbr", couleur: "#3a4f8f"},
  IND: {nom: "vue.pays.ind", couleur: "#3f9e8f"},
  IRN: {nom: "vue.pays.irn", couleur: "#3f8f5a"},
  ISR: {nom: "vue.pays.isr", couleur: "#4b8fd6"},
  ITA: {nom: "vue.pays.ita", couleur: "#2f8a4d"},
  KOR: {nom: "vue.pays.kor", couleur: "#5a6fb8"},
  NLD: {nom: "vue.pays.nld", couleur: "#5a7a9e"},
  PRK: {nom: "vue.pays.prk", couleur: "#8f3f6b"},
  RUS: {nom: "vue.pays.rus", couleur: "#7c5aa6"},
  SWE: {nom: "vue.pays.swe", couleur: "#2d6fa8"},
  TUR: {nom: "vue.pays.tur", couleur: "#2f8f8f"},
  UKR: {nom: "vue.pays.ukr", couleur: "#c9a227"},
  USA: {nom: "vue.pays.usa", couleur: "#41588f"},
};

/** Rendre le nom d'un pays dans la langue installée (son code s'il est inconnu). */
export const nom_pays = (code) => (PAYS[code] ? t(PAYS[code].nom) : code);

/** Rendre la couleur de pastille d'un pays, ou `defaut` pour une unité générique. */
export const couleur_pays = (pays, defaut) => PAYS[pays]?.couleur ?? defaut;
