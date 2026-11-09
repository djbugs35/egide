// Refonte de l'éditeur (MODELE § 12) : palette à onglets, réglages du théâtre, consigne, raid différé pendant l'édition.
import assert from "node:assert/strict";
import test from "node:test";
import {geo_deg} from "../src/moteur/geodesie.js";
import {consigne_outil} from "../src/vue/aides_edition.js";
import {filtrer_palette} from "../src/vue/deploiement.js";
import {modifications_centre_theatre, modifications_reglage_theatre} from "../src/vue/edition.js";
import {creer_lecteur} from "../src/vue/lecteur.js";
import {REGISTRE, scenario} from "./aide_scenario.js";

const FAMILLES = [
  {id: "capteurs", elements: [{id: "a", nom: "Radar Hêtre", pays: "FRA"}, {id: "b", nom: "Veille longue", pays: "USA"}]},
  {id: "sol", elements: [{id: "c", nom: "Batterie Hêtre", pays: null}]},
];

test("palette : sans recherche, seule la famille de l'onglet est montrée", () => {
  assert.deepEqual(filtrer_palette(FAMILLES, {famille: "sol"}).map((f) => f.id), ["sol"]);
});

test("palette : la recherche traverse les familles et ignore les accents et la casse", () => {
  const trouve = filtrer_palette(FAMILLES, {texte: "hetre", famille: "sol"});
  assert.deepEqual(trouve.map((f) => f.elements.map((e) => e.id)), [["a"], ["c"]]);
});

test("palette : la recherche lit aussi le pays et n'en garde aucune famille vide", () => {
  assert.deepEqual(filtrer_palette(FAMILLES, {texte: "usa"}).map((f) => f.id), ["capteurs"]);
});

test("théâtre : le centre posé sur la carte s'arrondit au millième de degré", () => {
  assert.deepEqual(modifications_centre_theatre(geo_deg(48.12345, -4.56789, 0)), {"theatre.origine_lat_deg": 48.123, "theatre.origine_lon_deg": -4.568});
});

test("théâtre : une valeur saisie hors bornes ou illisible ne modifie rien", () => {
  assert.deepEqual(modifications_reglage_theatre("theatre.zone_rayon_km", 0), {});
  assert.deepEqual(modifications_reglage_theatre("theatre.origine_lat_deg", 95), {});
  assert.deepEqual(modifications_reglage_theatre("theatre.zone_rayon_km", Number.NaN), {});
  assert.deepEqual(modifications_reglage_theatre("theatre.autre", 3), {});
});

test("théâtre : une valeur correcte devient une modification par chemin, le nombre de cibles reste entier", () => {
  assert.deepEqual(modifications_reglage_theatre("theatre.zone_rayon_km", 520), {"theatre.zone_rayon_km": 520});
  assert.deepEqual(modifications_reglage_theatre("theatre.cibles_nombre", 3.4), {"theatre.cibles_nombre": 3});
});

test("consigne : chaque outil dit quoi faire, le dépôt nomme l'unité", () => {
  assert.match(consigne_outil({outil: "depot", mode: "edition", nom_depot: "Radar X"}), /^Radar X : clic pour poser/);
  assert.match(consigne_outil({outil: "liaison", mode: "edition", liaison: {}}), /seconde unité/);
  assert.match(consigne_outil({outil: "liaison", mode: "edition", nom_moyen: "Liaison filaire (notionnelle)"}), /^Liaison filaire : cliquez la première/);
  assert.match(consigne_outil({outil: "zone", mode: "edition", sommets: 2}), /^2 sommets/);
  assert.match(consigne_outil({outil: "selection", mode: "ordres", choisis: 3}), /^3 unités : clic droit/);
});

test("lecteur différé : l'éditeur obtient un monde à t = 0 sans simuler le raid", () => {
  const lecteur = creer_lecteur(scenario({"rouge.nombre": 20}), REGISTRE, {differe: true});
  assert.equal(lecteur.duree, Infinity);
  assert.equal(lecteur.monde.t, 0);
  assert.ok(Number.isFinite(creer_lecteur(scenario({"rouge.nombre": 20}), REGISTRE).duree));
});
