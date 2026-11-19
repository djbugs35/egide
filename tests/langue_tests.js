// Préchargé par npm test (--import) : installe le français, langue des textes que vérifient les tests de la vue,
// avec l'anglais en secours, comme le navigateur (src/vue/langue.js).
import {readFileSync} from "node:fs";
import {installer_langue} from "../src/i18n.js";

const lire = (code) => JSON.parse(readFileSync(new URL(`../langues/${code}.json`, import.meta.url), "utf-8"));
installer_langue("fr", lire("fr"), lire("en"));
