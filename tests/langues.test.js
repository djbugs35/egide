// Langues (jalon 27) : les dictionnaires ont les mêmes clés et les mêmes paramètres, chaque clé citée existe, et
// les pages n'affichent aucun texte qui ne passe pas par un dictionnaire.
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {RACINE} from "../src/moteur/catalogue_node.js";
import {choisir_langue, installer_langue, LANGUES, t} from "../src/i18n.js";

const lire = (chemin) => readFileSync(join(RACINE, chemin), "utf-8");
const DICOS = Object.fromEntries(Object.keys(LANGUES).map((code) => [code, JSON.parse(lire(`langues/${code}.json`))]));
const PAGES = ["index.html", "catalogue.html"];
const parametres = (texte) => [...JSON.stringify(texte).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const balises = (texte) => [...String(texte).matchAll(/<\/?([a-z]+)/g)].map((m) => m[1]).sort();

test("langues : chaque langue a exactement les clés de l'anglais, mêmes paramètres et mêmes balises", () => {
  const reference = DICOS.en;
  for (const [code, dico] of Object.entries(DICOS)) {
    assert.deepEqual(Object.keys(dico).sort(), Object.keys(reference).sort(), `${code} : clés différentes de l'anglais`);
    for (const cle of Object.keys(reference)) {
      assert.deepEqual(parametres(dico[cle]), parametres(reference[cle]), `${code} ${cle} : paramètres`);
      assert.deepEqual(balises(dico[cle]), balises(reference[cle]), `${code} ${cle} : balises`);
      assert.ok(typeof dico[cle] === "object" || dico[cle].trim(), `${code} ${cle} : texte vide`);
    }
  }
});

/** Rendre les clés citées par une page (data-i18n, data-i18n-html, data-i18n-attr). */
function cles_page(source) {
  const directes = [...source.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map((m) => m[1]);
  const attributs = [...source.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(";").map((paire) => paire.split(":")[1]));
  return [...directes, ...attributs];
}

/** Rendre les clés citées par le code : t("…") dans src/. */
function cles_code() {
  const fichiers = (dossier) => readdirSync(join(RACINE, dossier), {withFileTypes: true}).flatMap((e) => (e.isDirectory() ? fichiers(join(dossier, e.name)) : e.name.endsWith(".js") ? [join(dossier, e.name)] : []));
  // Toute chaîne littérale qui commence par un espace de noms de clé (vue., page., commun., cli.) est une clé :
  // passée à t() directement, ou rangée dans une table puis traduite à l'affichage.
  return [...fichiers("src"), ...fichiers("outils")].flatMap((f) => [...lire(f).matchAll(/["'`]((?:vue|page|commun|cli)\.[a-z0-9_.]+)["'`]/g)].map((m) => m[1]));
}

test("langues : toute clé citée par les pages et par le code existe ; aucune clé du dictionnaire n'est orpheline", () => {
  const citees = new Set([...PAGES.flatMap((p) => cles_page(lire(p))), ...cles_code()]);
  for (const cle of citees) assert.ok(cle in DICOS.en, `clé absente des dictionnaires : ${cle}`);
  for (const cle of Object.keys(DICOS.en)) assert.ok(citees.has(cle), `clé inutilisée : ${cle}`);
});

test("langues : les pages n'ont aucun texte visible ni attribut lisible hors dictionnaire", () => {
  for (const page of PAGES) {
    let source = lire(page).replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, "");
    // Les éléments traduits sont vidés, puis toute balise ôtée : il ne doit rester ni lettre ni attribut lisible.
    for (let avant = ""; avant !== source;) {
      avant = source;
      source = source.replace(/(<(\w+)[^>]*\sdata-i18n(?:-html)?="[^"]*"[^>]*>)(?:(?!<\2[\s>])[\s\S])*?<\/\2>/g, "$1</$2>");
    }
    for (const balise of source.match(/<[a-z][^>]*>/g) ?? []) {
      const traduits = (/data-i18n-attr="([^"]+)"/.exec(balise)?.[1] ?? "").split(";").map((p) => p.split(":")[0]);
      for (const [, attribut, valeur] of balise.matchAll(/\s(title|aria-label|placeholder|alt)="([^"]*)"/g)) {
        if (/\p{L}{2}/u.test(valeur)) assert.ok(traduits.includes(attribut), `${page} : ${attribut}="${valeur}" hors dictionnaire`);
      }
    }
    const reste = source.replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/g, " ");
    const mots = reste.match(/\p{L}{2,}/gu) ?? [];
    assert.deepEqual(mots, [], `${page} : texte hors dictionnaire`);
  }
});

test("langues : paramètres, pluriels, secours en anglais et clé manquante visible", () => {
  installer_langue("fr", {"essai.n": {one: "{n} drone", other: "{n} drones"}, "essai.p": "Bonjour {nom}"}, {"essai.seul": "Only"});
  assert.equal(t("essai.n", {n: 1}), "1 drone");
  assert.equal(t("essai.n", {n: 3}), "3 drones");
  assert.equal(t("essai.p", {nom: "Égide"}), "Bonjour Égide");
  assert.equal(t("essai.seul"), "Only");
  assert.equal(t("essai.absente"), "⟦essai.absente⟧");
  installer_langue("fr", {});
});

test("langues : l'anglais par défaut, l'adresse puis la mémoire priment, un code inconnu est ignoré", () => {
  assert.equal(choisir_langue(), "en");
  assert.equal(choisir_langue({memorisee: "fr"}), "fr");
  assert.equal(choisir_langue({adresse: "?lang=en", memorisee: "fr"}), "en");
  assert.equal(choisir_langue({adresse: "?lang=xx", memorisee: "zz"}), "en");
});

// Catalogue (lot 27.4) : traductions à côté des fichiers, qui ne changent pas — ni leur empreinte.
import {aide_unite, installer_catalogue, meta_traduite, nom_unite, sans_mention, sources_unite, traduire_index} from "../src/catalogue_langue.js";
import {couverture_langues} from "../outils/valider.js";

test("catalogue : chaque unité, algorithme et scénario public a sa traduction anglaise, conforme à son fichier", async () => {
  for (const r of await couverture_langues()) {
    assert.deepEqual(r.defauts, [], `${r.fichier} : défauts`);
    assert.deepEqual(r.manquants, [], `${r.fichier} : entrées manquantes`);
  }
});

test("catalogue : noms, aides et fiches traduits sans toucher aux originaux ; repli sur le français", () => {
  const anglais = JSON.parse(lire("langues/catalogue.en.json"));
  installer_catalogue(anglais);
  try {
    assert.equal(nom_unite("capteurs/radars/fra_ajonc_300", "Ajonc 300 (FRA, notionnel)"), "Gorse 300 (FRA, notional)");
    assert.equal(nom_unite("prive/mon_radar", "Mon radar"), "Mon radar", "une unité privée garde son nom");
    assert.equal(sources_unite("prive/x", ["a"])[0], "a");
    const fichiers = {_unite: {_aide: {nom: "Nom affiche de l'unite."}}, "a/b": {herite_de: "_unite", _aide: {nom: "Nom propre."}}};
    assert.equal(aide_unite(["_unite", "a/b"], fichiers, "nom", "Nom propre."), "Nom propre.", "l'aide du fichier le plus proche, non traduite, l'emporte");
    assert.equal(aide_unite(["_unite"], fichiers, "nom", "x"), "Displayed name of the unit.");
    const meta = {nom: "Piste la plus proche", parametres: {altitude: {unite: "m", aide: "Altitude"}}, equations: []};
    const traduite = meta_traduite("global/allocation/plus_proche", meta);
    assert.equal(traduite.nom, "Nearest track");
    assert.equal(traduite.parametres.altitude.unite, "m");
    assert.equal(meta.nom, "Piste la plus proche", "la fiche d'origine ne change pas");
    assert.equal(traduire_index("algos/index.json", [{id: "global/allocation/plus_proche", nom: "x"}])[0].nom, "Nearest track");
    assert.deepEqual(traduire_index("cartes/index.json", [{id: "a", nom: "b"}]), [{id: "a", nom: "b"}]);
  } finally {
    installer_catalogue(null);
  }
  assert.equal(nom_unite("capteurs/radars/fra_ajonc_300", "Ajonc 300 (FRA, notionnel)"), "Ajonc 300 (FRA, notionnel)", "en français, le fichier");
  assert.equal(sans_mention("Gorse 300 (FRA, notional)"), "Gorse 300");
  assert.equal(sans_mention("Liaison filaire (notionnelle)"), "Liaison filaire");
});
