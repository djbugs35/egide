// Boîte à outils passée en argument à tout algorithme (algos/, prive/algos/). Un algorithme n'importe rien :
// il reste pur, testable seul, et fonctionne quel que soit son dossier (Node, navigateur, Worker).
import * as geodesie from "./geodesie.js";
import {horizon_radar} from "./geometrie.js";
import {portee_contre_menace} from "./radars.js";

export const OUTILS = Object.freeze({
  ...geodesie,
  horizon_radar,
  portee_contre_menace,
  G: 9.80665,
});
