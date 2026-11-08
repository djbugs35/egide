// Vérification de l'installation : lecture des versions, recherche de Godot, rapport (docs/PLAN_JEU.md, étape 1).
import assert from "node:assert/strict";
import {join} from "node:path";
import test from "node:test";
import {candidats_godot, chemin_python, extraire_version, resumer, texte_rapport, trouver_godot, version_suffisante} from "../outils/verifier_installation.js";

const ligne = (statut, remede = null) => ({libelle: "Essai", statut, detail: "détail", remede});

test("version : lue dans les formats de Node, Python et Godot", () => {
  assert.deepEqual(extraire_version("v22.11.0"), [22, 11, 0]);
  assert.deepEqual(extraire_version("Python 3.12.4"), [3, 12, 4]);
  assert.deepEqual(extraire_version("4.7.2.stable.official.ed1daf0bf"), [4, 7, 2]);
  assert.deepEqual(extraire_version("Godot 4.4"), [4, 4, 0]);
  assert.equal(extraire_version("commande introuvable"), null);
});

test("version : comparée au majeur puis au mineur, sans confondre 4.10 et 4.1", () => {
  assert.ok(version_suffisante([4, 10, 0], [4, 4]));
  assert.ok(version_suffisante([5, 0, 0], [4, 4]));
  assert.ok(version_suffisante([3, 12, 0], [3, 12]));
  assert.ok(!version_suffisante([3, 11, 9], [3, 12]));
  assert.ok(!version_suffisante([3, 99, 0], [4, 4]));
});

test("Python : l'environnement du projet est rangé différemment sous Windows", () => {
  assert.equal(chemin_python("/r", "darwin"), join("/r", ".venv", "bin", "python"));
  assert.equal(chemin_python("/r", "win32"), join("/r", ".venv", "Scripts", "python.exe"));
});

test("Godot : la variable EGIDE_GODOT passe devant, et l'application macOS est essayée", () => {
  const candidats = candidats_godot({EGIDE_GODOT: "/mon/godot"}, "darwin", "/m");
  assert.equal(candidats[0], "/mon/godot");
  assert.ok(candidats.includes("/Applications/Godot.app/Contents/MacOS/Godot"));
  assert.ok(candidats_godot({LOCALAPPDATA: "C:/L"}, "win32", "/m").some((c) => c.endsWith("godot.exe")));
});

test("Godot : le premier candidat qui répond une version est retenu ; aucun ne répond, rien n'est retenu", () => {
  const sonder = (c) => ({b: "4.7.2.stable", c: "4.1.0"})[c] ?? null;
  assert.deepEqual(trouver_godot(["a", "b", "c"], sonder), {commande: "b", version: [4, 7, 2]});
  assert.equal(trouver_godot(["a"], sonder), null);
});

test("rapport : seul un échec empêche d'être prêt, pas un avertissement ni une information", () => {
  assert.deepEqual(resumer([ligne("ok"), ligne("avertissement"), ligne("info")]), {pret: true, echecs: 0, avertissements: 1});
  assert.equal(resumer([ligne("ok"), ligne("echec")]).pret, false);
});

test("rapport : le remède s'affiche sous un contrôle en défaut, jamais sous un contrôle réussi", () => {
  const defaut = texte_rapport([ligne("echec", "faire ceci")]);
  assert.match(defaut, /→ faire ceci/);
  assert.match(defaut, /pas prêt : 1 contrôle en échec/);
  const reussi = texte_rapport([ligne("ok", "faire cela")]);
  assert.doesNotMatch(reussi, /faire cela/);
  assert.match(reussi, /Égide est prêt\./);
});
