// Écriture des modèles 3D en glTF binaire (outils/modeles3d/maillage.js).
import assert from "node:assert/strict";
import {readdir} from "node:fs/promises";
import test from "node:test";
import {boite, couleur, cylindre, ecrire_glb, miroir, tourner_y} from "../outils/modeles3d/maillage.js";
import {bruit, encoder_png, habiller, hasard} from "../outils/modeles3d/texture.js";
import {ARCHETYPES} from "../outils/modeles3d/archetypes.js";
import {CLASSES, construire_classe} from "../outils/modeles3d/classes.js";
import {chemin_modele} from "../src/moteur/catalogue.js";
import {decoder_png} from "../src/vue/png.js";

/** Rendre la couleur [r, g, b] du texel situé au centre du triangle d'indice `i` d'une partie dépliée. */
function texel_du_triangle({rgba, largeur}, partie, i) {
  const [u, v] = [0, 1].map((k) => (partie[i].uv[k] + partie[i + 1].uv[k] + partie[i + 2].uv[k]) / 3);
  const position = (Math.floor(v * largeur) * largeur + Math.floor(u * largeur)) * 4;
  return [...rgba.subarray(position, position + 3)];
}

test("une image encodée en PNG se relit à l'identique", async () => {
  const rgb = Uint8Array.from({length: 4 * 4 * 3}, (_, i) => (i * 37) % 256);
  const {largeur, hauteur, rgba} = await decoder_png(encoder_png(rgb, 4));
  assert.deepEqual([largeur, hauteur], [4, 4]);
  assert.deepEqual([...rgba].filter((_, i) => i % 4 !== 3), [...rgb]);
});

test("chaque face reçoit la peinture calculée à sa position 3D", async () => {
  const {parties, png} = habiller([boite([0, 0, 0], [2, 2, 2], [1, 1, 1])], ({p}) => (p[1] > 0.5 ? [1, 0, 0] : [0, 0, 1]), 64);
  const image = await decoder_png(png);
  const partie = parties[0];
  for (let i = 0; i < partie.length; i += 3) {
    if (partie[i].n[1] > 0.9) assert.deepEqual(texel_du_triangle(image, partie, i), [255, 0, 0]);
    if (partie[i].n[1] < -0.9) assert.deepEqual(texel_du_triangle(image, partie, i), [0, 0, 255]);
  }
});

test("une partie survolée par une autre garde sa propre peinture", async () => {
  // Projetées ensemble, les pales d'un rotor imprimaient leur couleur sur le toit qu'elles survolent : chaque partie a ses îlots.
  const [toit, pale] = [[0.25, 0.25, 0.25], [0.5, 0.5, 0.5]];
  const {parties, png} = habiller([boite([0, 0, 0], [2, 1, 2], toit), boite([0, 3, 0], [2, 0.1, 0.5], pale)], ({c}) => (c === toit ? [1, 0, 0] : [0, 1, 0]), 128);
  const image = await decoder_png(png);
  const dessus = parties[0].findIndex((s, i) => i % 3 === 0 && s.n[1] > 0.9);
  assert.deepEqual(texel_du_triangle(image, parties[0], dessus), [255, 0, 0]);
});

test("les parties dépliées sont blanches et leurs coordonnées restent dans l'image", () => {
  const {parties} = habiller([cylindre([0, 0, 0], [0, 0, 3], 1, blanc)], () => [0.5, 0.5, 0.5], 64);
  for (const {uv, c} of parties[0]) {
    assert.deepEqual(c, [1, 1, 1]);
    assert.ok(uv.every((v) => v >= 0 && v <= 1));
  }
});

test("un .glb texturé déclare ses coordonnées et embarque l'image à l'endroit annoncé", () => {
  const {parties, png} = habiller([boite([0, 0, 0], [1, 1, 1], blanc)], () => [0.5, 0.5, 0.5], 32);
  const glb = ecrire_glb("essai", parties, png);
  const json = lire_json(glb);
  assert.equal(json.meshes[0].primitives[0].attributes.TEXCOORD_0, 3);
  assert.equal(json.materials[0].pbrMetallicRoughness.baseColorTexture.index, 0);
  const vue = json.bufferViews[json.images[0].bufferView];
  const debutBinaire = 20 + new DataView(glb.buffer).getUint32(12, true) + 8;
  assert.deepEqual([...glb.subarray(debutBinaire + vue.byteOffset, debutBinaire + vue.byteOffset + vue.byteLength)], [...png]);
  assert.equal(glb.length % 4, 0);
});

test("le bruit reste dans [0, 1] et se rejoue à l'identique", () => {
  for (let i = 0; i < 200; i++) {
    const v = bruit(i * 0.37, i * 0.11, -i * 0.73);
    assert.ok(v >= 0 && v <= 1);
    assert.equal(v, bruit(i * 0.37, i * 0.11, -i * 0.73));
  }
  assert.equal(hasard(1, 2, 3), hasard(1, 2, 3));
  assert.notEqual(hasard(1, 2, 3), hasard(1, 2, 4));
});

/** Rendre l'objet JSON embarqué dans un .glb. */
function lire_json(glb) {
  const vue = new DataView(glb.buffer);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + vue.getUint32(12, true))));
}

const blanc = couleur("#ffffff");

/** Rendre vrai si chaque triangle a sa face avant du côté de ses normales. */
function faces_coherentes(partie) {
  for (let i = 0; i < partie.length; i += 3) {
    const [a, b, c] = [partie[i].p, partie[i + 1].p, partie[i + 2].p];
    const [u, v] = [b.map((x, k) => x - a[k]), c.map((x, k) => x - a[k])];
    const normale = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (normale[0] * partie[i].n[0] + normale[1] * partie[i].n[1] + normale[2] * partie[i].n[2] < 0) return false;
  }
  return true;
}

test("un .glb a l'en-tête du format et des blocs alignés sur quatre octets", () => {
  const glb = ecrire_glb("essai", [boite([0, 0, 0], [1, 2, 3], blanc)]);
  const vue = new DataView(glb.buffer);
  assert.equal(vue.getUint32(0, true), 0x46546c67);
  assert.equal(vue.getUint32(4, true), 2);
  assert.equal(vue.getUint32(8, true), glb.length);
  assert.equal(vue.getUint32(12, true) % 4, 0);
  assert.equal(glb.length % 4, 0);
});

test("le maillage écrit déclare les bornes réelles de ses positions et un sommet par ligne", () => {
  const json = lire_json(ecrire_glb("essai", [boite([1, 0, 0], [2, 4, 6], blanc)]));
  assert.deepEqual(json.accessors[0].min, [0, -2, -3]);
  assert.deepEqual(json.accessors[0].max, [2, 2, 3]);
  assert.equal(json.accessors[0].count, 36);
  assert.deepEqual(Object.keys(json.meshes[0].primitives[0].attributes), ["POSITION", "NORMAL", "COLOR_0"]);
});

test("un maillage vide est refusé plutôt qu'écrit", () => {
  assert.throws(() => ecrire_glb("vide", []), /maillage invalide/);
});

test("les faces d'un pavé, d'un cylindre et de leur miroir regardent vers l'extérieur", () => {
  const pave = boite([0.5, 0, 0], [1, 1, 1], blanc);
  const tube = cylindre([1, 0, 0], [3, 0, 1], 0.4, blanc, {rb: 0.2});
  for (const partie of [pave, tube, miroir(pave), miroir(tube)]) assert.ok(faces_coherentes(partie));
});

test("un quart de tour autour de Y envoie +X sur -Z et laisse les hauteurs", () => {
  const [{p}] = tourner_y([{p: [1, 5, 0], n: [1, 0, 0], c: blanc}], Math.PI / 2);
  assert.ok(Math.abs(p[0]) < 1e-9 && p[1] === 5 && Math.abs(p[2] + 1) < 1e-9);
});

test("la conversion sRGB vers linéaire conserve les extrêmes", () => {
  assert.deepEqual(couleur("#000000"), [0, 0, 0]);
  assert.deepEqual(couleur("#ffffff"), [1, 1, 1]);
});

test("une icône publique a son modèle sous modeles/, une icône privée sous prive/modeles/", () => {
  assert.equal(chemin_modele("drone_delta"), "modeles/drone_delta.glb");
  assert.equal(chemin_modele("prive/essai"), "prive/modeles/essai.glb");
});

test("chaque archétype rend un maillage complet, aux normales et positions finies", () => {
  for (const [nom, reglages] of Object.entries(CLASSES)) {
    const {forme, ...reste} = reglages;
    const {parties} = ARCHETYPES[forme](reste);
    const sommets = parties.flat();
    assert.ok(sommets.length > 0 && sommets.length % 3 === 0, nom);
    assert.ok(sommets.every(({p, n}) => [...p, ...n].every(Number.isFinite)), nom);
  }
});

test("toutes les icônes publiques ont une classe de modèle", async () => {
  const icones = (await readdir(new URL("../icones/", import.meta.url))).map((f) => f.slice(0, -4));
  assert.deepEqual(icones.filter((icone) => !CLASSES[icone]), []);
});

test("une classe se cuit en .glb texturé", () => {
  const glb = construire_classe("drone_helice");
  assert.equal(lire_json(glb).images.length, 1);
});
