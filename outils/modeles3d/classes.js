// Génère les modèles 3D notionnels du catalogue public, un par icône de classe, dans modeles/ (MODELE § 23). Aucun système réel :
// proportions et teintes de classe, sans insigne. Lancer : node outils/modeles3d/classes.js ; les fichiers ne sont pas versionnés.
import {mkdir, rename, writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {ARCHETYPES} from "./archetypes.js";
import {ecrire_glb} from "./maillage.js";
import {peinture} from "./peinture.js";
import {habiller} from "./texture.js";

const COTE_TEXTURE = 1024;
const DOSSIER = new URL("../../modeles/", import.meta.url);

const sol = (train, L, ...charges) => ({forme: "sol", train, L, charges, s: "vert_taches"});
const lanceur = {n: 4, L: 5, D: 0.5};

export const CLASSES = {
  anti_drone: sol("4x4", 6, ["laser", {r: 0.3}], ["mat", {h: 4}]),
  batterie_courte: sol("6x6", 8, ["lanceur_i", lanceur]),
  batterie_missile: sol("8x8", 11, ["lanceur_v", {}]),
  batterie_moyenne: sol("8x8", 11, ["lanceur_i", {n: 4, carre: false, angle: 1.4, L: 7, D: 0.7}]),
  brouilleur: sol("6x6", 9, ["abri", {l: 4.5}], ["mat", {h: 8}]),
  c2: sol("6x6", 9, ["abri", {l: 5}], ["parabole", {r: 1.1}]),
  canon: sol("remorque", 7, ["canon", {tubes: 2, radar: false}]),
  chasseur: {forme: "chasseur", L: 16, E: 11, H: 5, s: "gris"},
  drone_arme: {forme: "drone_male", L: 8, E: 15, queue: "vinv", s: "gris"},
  drone_delta: {forme: "drone_delta", L: 3.5, E: 2.5, s: "gris"},
  drone_helice: {forme: "multirotor", L: 0.6, E: 0.7, s: "gris_fonce"},
  drone_reaction: {forme: "drone_male", L: 4, E: 3, reacteur: true, s: "gris"},
  helicoptere: {forme: "helico", L: 13, D: 11, s: "vert"},
  hypersonique: {forme: "munition", L: 6, D: 1.2, type: "planeur", s: "gris_fonce"},
  intercepteur: {forme: "munition", L: 5, D: 0.3, type: "intercepteur", s: "blanc"},
  laser: sol("4x4", 6, ["laser", {r: 0.5}]),
  liaison: sol("socle", 3, ["mat", {h: 12}]),
  missile_balistique: {forme: "munition", L: 11, D: 1.3, type: "balistique", s: "vert"},
  missile_croisier: {forme: "munition", L: 6, D: 0.55, E: 2.6, type: "croisiere", s: "gris"},
  radar_aesa: sol("8x8", 11, ["radar", {l: 6, h: 4.5}]),
  radar_mobile: sol("6x6", 9, ["radar", {l: 4, h: 2.4}]),
  radar_pylone: {...sol("socle", 8, ["dome", {r: 4, h: 18}]), s: "blanc"},
  site: {...sol("socle", 12, ["abri", {l: 8, h: 4}]), s: "gris"},
  turbopropulseur: {forme: "avion_large", L: 10, E: 12, H: 3.6, haute: true, helice: true, moteurs: 2, s: "gris"},
};

/** Écrire `contenu` dans `url` par un fichier temporaire. */
async function ecrire(url, contenu) {
  const temporaire = new URL(`${url.href}.tmp`);
  await writeFile(temporaire, contenu);
  await rename(temporaire, url);
}

/** Rendre le fichier .glb d'une classe. */
export function construire_classe(nom) {
  const {forme, s, ...reglages} = CLASSES[nom];
  const {parties, pas} = ARCHETYPES[forme](reglages);
  const cuit = habiller(parties, peinture({schema: s, milieu: forme === "sol" ? "sol" : "air", pas}), COTE_TEXTURE);
  return ecrire_glb(nom, cuit.parties, cuit.png);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir(DOSSIER, {recursive: true});
  for (const nom of Object.keys(CLASSES)) await ecrire(new URL(`${nom}.glb`, DOSSIER), construire_classe(nom));
  await ecrire(new URL("index.json", DOSSIER), `${JSON.stringify(Object.keys(CLASSES))}\n`);
  console.log(`${Object.keys(CLASSES).length} modèles`);
}
