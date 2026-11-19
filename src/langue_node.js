// Langue des programmes Node (serveur du jeu, lignes de commande, tests) : lit langues/<code>.json et l'installe,
// l'anglais en secours. Le choix : option --langue, sinon variable EGIDE_LANGUE, sinon l'anglais (jalon 27.5).
import {existsSync, readFileSync} from "node:fs";
import {chemin_catalogue, installer_catalogue} from "./catalogue_langue.js";
import {installer_langue, LANGUE_PAR_DEFAUT, LANGUES} from "./i18n.js";

const lire = (code) => JSON.parse(readFileSync(new URL(`../langues/${code}.json`, import.meta.url), "utf-8"));

/** Installer la langue `code` (inconnue : l'anglais) ; rendre le code installé. */
export function installer_langue_node(code = process.env.EGIDE_LANGUE ?? LANGUE_PAR_DEFAUT) {
  const choisi = code in LANGUES ? code : LANGUE_PAR_DEFAUT;
  const secours = lire(LANGUE_PAR_DEFAUT);
  installer_langue(choisi, choisi === LANGUE_PAR_DEFAUT ? secours : lire(choisi), secours);
  const catalogue = chemin_catalogue(choisi) && new URL(`../${chemin_catalogue(choisi)}`, import.meta.url);
  installer_catalogue(catalogue && existsSync(catalogue) ? JSON.parse(readFileSync(catalogue, "utf-8")) : null);
  return choisi;
}

/**
 * Ôter « --langue <code> » (ou « --langue=<code> ») de `argv` et installer cette langue, sinon celle de EGIDE_LANGUE,
 * sinon l'anglais ; rendre les arguments restants, pour la lecture propre à chaque outil.
 */
export function preparer_langue(argv) {
  const i = argv.findIndex((a) => a === "--langue" || a.startsWith("--langue="));
  if (i < 0) {
    installer_langue_node();
    return argv;
  }
  const egal = argv[i].startsWith("--langue=");
  installer_langue_node(egal ? argv[i].slice("--langue=".length) : argv[i + 1]);
  return [...argv.slice(0, i), ...argv.slice(i + (egal ? 1 : 2))];
}
