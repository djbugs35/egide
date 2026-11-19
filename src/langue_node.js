// Langue des programmes Node (serveur du jeu, lignes de commande, tests) : lit langues/<code>.json et l'installe,
// l'anglais en secours. Le choix : option --langue, sinon variable EGIDE_LANGUE, sinon l'anglais (jalon 27.5).
import {readFileSync} from "node:fs";
import {installer_langue, LANGUE_PAR_DEFAUT, LANGUES} from "./i18n.js";

const lire = (code) => JSON.parse(readFileSync(new URL(`../langues/${code}.json`, import.meta.url), "utf-8"));

/** Installer la langue `code` (inconnue : l'anglais) ; rendre le code installé. */
export function installer_langue_node(code = process.env.EGIDE_LANGUE ?? LANGUE_PAR_DEFAUT) {
  const choisi = code in LANGUES ? code : LANGUE_PAR_DEFAUT;
  const secours = lire(LANGUE_PAR_DEFAUT);
  installer_langue(choisi, choisi === LANGUE_PAR_DEFAUT ? secours : lire(choisi), secours);
  return choisi;
}
