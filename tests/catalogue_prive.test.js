import {chemin_icone} from "../src/moteur/catalogue.js";
// Import du catalogue privé dans l'interface (src/vue/catalogue_prive.js) : fusion ou remplacement de l'index public,
// et unités privées rangées dans la palette comme leurs homologues publiques. Index privés fictifs : prive/ est hors git.
import assert from "node:assert/strict";
import test from "node:test";
import {charger_index, index_selon_mode, sans_prive} from "../src/vue/catalogue_prive.js";
import {famille_de, palette} from "../src/vue/deploiement.js";

const PUBLIC = [
  {id: "vecteurs/avions/_avion", nom: "Avion", base: true},
  {id: "vecteurs/avions/turbopropulseur_ir_notionnel", nom: "Turbo IR", base: false},
  {id: "terrains/centre_france", nom: "Centre", base: false},
];
const PRIVE = [
  {id: "prive/vecteurs/avions/_avion_reel", nom: "Aéronef réel", base: true},
  {id: "prive/vecteurs/avions/mon_avion", nom: "Mon avion", base: false, pays: "FRA"},
];

test("catalogue privé : le mode public ignore le privé, la fusion ajoute toutes ses unités", () => {
  assert.deepEqual(index_selon_mode(PUBLIC, PRIVE, "public"), PUBLIC);
  assert.deepEqual(index_selon_mode(PUBLIC, PRIVE, "fusion"), [...PUBLIC, ...PRIVE]);
});

test("catalogue privé : le remplacement ôte les unités publiques des seuls dossiers que le privé couvre, bases gardées", () => {
  const ids = index_selon_mode(PUBLIC, PRIVE, "remplacement").map((u) => u.id);
  assert.ok(!ids.includes("vecteurs/avions/turbopropulseur_ir_notionnel"), "avions publics remplacés");
  assert.ok(ids.includes("vecteurs/avions/_avion"), "base publique parente gardée");
  assert.ok(ids.includes("terrains/centre_france"), "dossier non couvert gardé");
});

test("catalogue privé : une unité privée se range dans la famille de palette de son dossier", () => {
  assert.equal(sans_prive("prive/vecteurs/avions/mon_avion"), "vecteurs/avions/mon_avion");
  assert.equal(famille_de("prive/vecteurs/avions/mon_avion").id, "avions");
  const aviation = palette(index_selon_mode(PUBLIC, PRIVE, "fusion")).find((f) => f.id === "avions");
  assert.deepEqual(aviation.elements.map((e) => e.id), ["vecteurs/avions/turbopropulseur_ir_notionnel", "prive/vecteurs/avions/mon_avion"]);
});

test("catalogue privé : sans index privé, l'interface garde le public et dit quoi lancer", async () => {
  const lire = async (chemin) => {
    if (chemin.startsWith("prive/")) throw new Error("404");
    return PUBLIC;
  };
  const {index, privees, erreur} = await charger_index(lire, "fusion");
  assert.deepEqual(index, PUBLIC);
  assert.equal(privees, 0);
  assert.match(erreur, /node outils\/indexer\.js/);
});

test("catalogue privé : avec son index, compte les unités importées hors classes de base", async () => {
  const lire = async (chemin) => (chemin.startsWith("prive/") ? PRIVE : PUBLIC);
  const {privees, erreur} = await charger_index(lire, "remplacement");
  assert.equal(privees, 1);
  assert.equal(erreur, null);
});

test("icône : une icône privée vit dans prive/icones/, une icône publique dans icones/", () => {
  assert.equal(chemin_icone("prive/modele"), "prive/icones/modele.svg");
  assert.equal(chemin_icone("chasseur"), "icones/chasseur.svg");
});
