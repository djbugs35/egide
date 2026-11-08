// Suite de conformité : s'applique d'elle-même à tout algorithme et toute unité déposés, publics ou privés (prive/).
// Un nouveau fichier n'a besoin d'aucun test écrit à la main pour être vérifié sur ces points.
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {chemin_algo, INTERDITS, ROLES, ROLES_BRANCHES, ROLES_D_UNITE} from "../src/moteur/algos.js";
import {charger_unites, chemin_icone, unite_brute, unite_si} from "../src/moteur/catalogue.js";
import {RACINE, ids_unites_disque, lire_fichier} from "../src/moteur/catalogue_node.js";
import {OUTILS} from "../src/moteur/outils.js";
import {creer_hasard} from "../src/moteur/hasard.js";
import {index_algos, index_cartes, index_scenarios, index_unites} from "../outils/indexer.js";
import {REGISTRE, scenario} from "./aide_scenario.js";
import {PAYS} from "../src/vue/pays.js";
import {FAMILLES, schemas} from "../outils/schemas.js";
import {reconnaitre, valider_fichier} from "../outils/valider.js";


const FICHIERS = await charger_unites(ids_unites_disque(), lire_fichier);

for (const [id, module] of Object.entries(REGISTRE)) {
  test(`conformité algorithme ${id} : fiche complète, rôle tenu, aucune dépendance cachée`, () => {
    assert.ok(Object.keys(ROLES).includes(module.meta.role));
    const source = readFileSync(join(RACINE, chemin_algo(id)), "utf-8");
    for (const motif of INTERDITS) assert.ok(!motif.test(source), `${id} contient ${motif}`);
    const dossier = id.replace(/^prive\//, "").split("/");
    if (dossier[0] === "global") assert.equal(dossier[1], module.meta.role, "rangé sous algos/global/<rôle>/");
  });
}

for (const id of ids_unites_disque()) {
  test(`conformité unité ${id} : valide, algorithmes existants, de bon rôle, paramètres présents`, () => {
    const unite = unite_brute(id, FICHIERS);
    if (id.split("/").at(-1).startsWith("_")) return;
    const valeurs = unite_si(id, FICHIERS);
    for (const [role, idAlgo] of Object.entries(unite.algos ?? {})) {
      const module = REGISTRE[idAlgo];
      assert.ok(module, `${id} cite un algorithme absent : ${idAlgo}`);
      assert.equal(module.meta.role, role, `${idAlgo} est rangé sous le rôle ${role}`);
      if (ROLES_D_UNITE.includes(role)) {
        for (const parametre of Object.keys(module.meta.parametres)) assert.ok(parametre in valeurs, `${id} : ${idAlgo} lit « ${parametre} »`);
      }
    }
    // Icône de jeu : un fichier de icones/ ; pays : un code ISO 3166 à trois lettres connu de l'interface.
    if (valeurs.icone) assert.doesNotThrow(() => readFileSync(join(RACINE, chemin_icone(valeurs.icone))), `${id} : icône absente icones/${valeurs.icone}.svg`);
    if (valeurs.pays) assert.ok(valeurs.pays in PAYS, `${id} : pays inconnu « ${valeurs.pays} » (src/vue/pays.js)`);
  });
}

test("conformité : tous les rôles branchés sur le moteur ont au moins un algorithme public", () => {
  const roles = new Set(Object.values(REGISTRE).map((module) => module.meta.role));
  for (const role of ROLES_BRANCHES) assert.ok(roles.has(role), role);
});

test("conformité comportement : même graine, même essaim ; route finissant sur la cible visée", () => {
  const s = scenario();
  const cibles = [OUTILS.geo_deg(47.2, 2.4), OUTILS.geo_deg(46.8, 2.9)];
  // Contexte générique : il fournit tout ce qu'un comportement public peut lire, plan de vol compris.
  const plan = [OUTILS.geo_deg(48.5, 0.5, 100), OUTILS.geo_deg(47.8, 1.6, 100)];
  const contexte = {rouge: {...s.rouge, plan_de_vol: plan}, cibles, rayon_apparition: 250_000, origine: s.theatre.origine, caps: [0.3, 2.1], cap_commun: 4};
  for (const [id, module] of Object.entries(REGISTRE).filter(([, m]) => m.meta.role === "comportement")) {
    const tirer = () => [0, 1, 1, 0].map((cible) => module.planifier_drone(contexte, cible, creer_hasard(5), OUTILS));
    assert.deepEqual(tirer(), tirer(), id);
    for (const [i, cible] of [0, 1, 1, 0].entries()) assert.deepEqual(tirer()[i].route.at(-1), cibles[cible], id);
  }
});

test("conformité mouvement : jamais plus loin que demandé, altitude conservée, entrées intactes", () => {
  const depart = OUTILS.geo_deg(47, 2.5, 300);
  const but = OUTILS.direct(depart, 1.2, 5_000);
  const route = Object.freeze([Object.freeze({geo: but, ecef: OUTILS.vers_ecef({...but, alt: 300})})]);
  const mobile = Object.freeze({geo: depart, ecef: OUTILS.vers_ecef(depart)});
  for (const [id, module] of Object.entries(REGISTRE).filter(([, m]) => m.meta.role === "mouvement" && !m.meta.trajectoire_propre)) {
    for (const pas of [0, 100, 4_999, 20_000]) {
      const suivant = module.avancer(mobile, route, pas, OUTILS);
      assert.ok(OUTILS.distance_oblique(mobile.ecef, suivant.ecef) <= pas + 1e-6, `${id} pas ${pas}`);
      assert.ok(Math.abs(suivant.geo.alt - 300) < 1e-9, id);
    }
  }
});

test("conformité pistage : chaque drone connu compte dans exactement une piste", () => {
  const drones = Array.from({length: 40}, (_, i) => {
    const geo = OUTILS.direct(OUTILS.geo_deg(47, 2.5, 100), i * 0.3, 1_000 * i);
    return Object.freeze({geo, ecef: OUTILS.vers_ecef(geo), vitesse: {x: 0, y: 0, z: 0}});
  });
  for (const [id, module] of Object.entries(REGISTRE).filter(([, m]) => m.meta.role === "pistage")) {
    assert.equal(module.pister(drones, OUTILS).reduce((somme, piste) => somme + piste.effectif, 0), 40, id);
  }
});

test("index : unites/index.json et algos/index.json sont à jour (sinon : node outils/indexer.js)", async () => {
  assert.deepEqual(JSON.parse(readFileSync(join(RACINE, "unites", "index.json"), "utf-8")), index_unites());
  assert.deepEqual(JSON.parse(readFileSync(join(RACINE, "algos", "index.json"), "utf-8")), await index_algos());
  assert.deepEqual(JSON.parse(readFileSync(join(RACINE, "cartes", "index.json"), "utf-8")), index_cartes());
  assert.deepEqual(JSON.parse(readFileSync(join(RACINE, "scenarios", "index.json"), "utf-8")), index_scenarios());
  for (const [nom, schema] of Object.entries(schemas())) assert.deepEqual(JSON.parse(readFileSync(join(RACINE, "schemas", nom), "utf-8")), schema, `schemas/${nom}`);
});

test("formats : chaque unité publique respecte le schéma de sa famille (clés connues bien typées, clés requises)", () => {
  const tous = schemas();
  for (const [nom, , dossier] of FAMILLES) {
    const {properties, required} = tous[`unite.${nom}.schema.json`];
    for (const id of ids_unites_disque().filter((i) => `unites/${i}/`.startsWith(dossier) && !i.split("/").at(-1).startsWith("_"))) {
      const fichier = JSON.parse(readFileSync(join(RACINE, "unites", `${id}.json`), "utf-8"));
      for (const cle of required) assert.ok(cle in fichier, `${id} : clé requise ${cle}`);
      for (const [cle, valeur] of Object.entries(fichier)) {
        const attendu = properties[cle]?.type;
        if (!attendu || valeur === null) continue;
        const reel = Array.isArray(valeur) ? "array" : Number.isInteger(valeur) ? "integer" : typeof valeur;
        const types = [attendu].flat();
        assert.ok(types.includes(reel) || (reel === "integer" && types.includes("number")), `${id} : ${cle} est ${reel}, ${types.join("|")} attendu`);
      }
    }
  }
});

test("formats : outils/valider.js accepte le catalogue et refuse un fichier fautif en nommant le défaut", async () => {
  const bons = await Promise.all(["unites/capteurs/radars/fra_ajonc_300.json", "unites/liaisons/satellite_notionnelle.json", "algos/global/allocation/plus_proche.js", "scenarios/reference.json"]
    .map((f) => valider_fichier(join(RACINE, f))));
  assert.ok(bons.every((r) => r.valide), JSON.stringify(bons.filter((r) => !r.valide)));
  assert.deepEqual(reconnaitre("prive/unites/sites/postes/x.json"), {genre: "unite", id: "prive/sites/postes/x"});
  assert.deepEqual(reconnaitre("prive/algos/allocation/y.js"), {genre: "algo", id: "prive/allocation/y"});
});

test("conformité cartes : chaque source n'emploie que des clés documentées, et toute source tierce est attribuée", () => {
  const aide = JSON.parse(readFileSync(join(RACINE, "cartes", "_format.json"), "utf-8"))._aide;
  for (const {id} of index_cartes()) {
    const source = JSON.parse(readFileSync(join(RACINE, "cartes", `${id}.json`), "utf-8"));
    for (const cle of Object.keys(source)) assert.ok(cle in aide, `${id} : clé non documentée « ${cle} »`);
    assert.ok(["raster", "raster-dem", "vector", "aucun"].includes(source.type), id);
    if (source.type !== "aucun") {
      assert.ok(source.attribution, `${id} : attribution manquante`);
      assert.ok(source.tuiles || source.tilejson, `${id} : ni tuiles ni tilejson`);
    }
  }
});

test("renvois au modèle : chaque « MODELE § x » du code, des algorithmes et des analyses existe dans docs/MODELE.md", async () => {
  const {readdirSync} = await import("node:fs");
  const modele = readFileSync(join(RACINE, "docs", "MODELE.md"), "utf-8");
  const sections = new Set([...modele.matchAll(/^##\s+(\d+)\s·/gm)].map((m) => m[1]).concat([...modele.matchAll(/^###\s+(\d+\.\d+)\s/gm)].map((m) => m[1])));
  const fichiers = ["src", "algos", "analyse"].flatMap((dossier) => readdirSync(join(RACINE, dossier), {recursive: true})
    .filter((f) => /\.(js|py)$/.test(f)).map((f) => join(RACINE, dossier, f)));
  const manquants = [];
  for (const fichier of fichiers) {
    readFileSync(fichier, "utf-8").split("\n").forEach((texte, numero) => {
      if (!texte.includes("MODELE")) return;
      for (const [, section] of texte.matchAll(/§\s*(\d+(?:\.\d+)?)/g)) {
        if (!sections.has(section)) manquants.push(`${fichier.slice(RACINE.length)}:${numero + 1} → § ${section}`);
      }
    });
  }
  assert.deepEqual(manquants, [], "renvois vers des sections absentes");
  assert.ok(fichiers.length > 30 && sections.size > 30);
});
