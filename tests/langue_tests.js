// Préchargé par npm test (--import) : installe le français, langue des textes que vérifient les tests de la vue,
// avec l'anglais en secours, comme le navigateur (src/vue/langue.js).
import {installer_langue_node} from "../src/langue_node.js";

installer_langue_node("fr");
