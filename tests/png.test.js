// Décodage PNG sans canvas de la vue 3D et du profil (MODELE § 23).
import assert from "node:assert/strict";
import test from "node:test";
import {deflateSync} from "node:zlib";
import {decoder_png} from "../src/vue/png.js";

/** Rendre un bloc PNG ; la somme de contrôle est laissée à zéro, le décodeur ne la lit pas. */
function bloc(type, contenu) {
  const tete = Buffer.alloc(8);
  tete.writeUInt32BE(contenu.length);
  tete.write(type, 4, "latin1");
  return Buffer.concat([tete, contenu, Buffer.alloc(4)]);
}

/** Rendre un PNG 8 bits à partir de ses lignes déjà filtrées (premier octet : numéro du filtre). */
function png(largeur, hauteur, type_couleur, lignes, {palette = null, entrelacement = 0} = {}) {
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete.set([8, type_couleur, 0, 0, entrelacement], 8);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const blocs = [bloc("IHDR", entete), ...(palette ? [bloc("PLTE", Buffer.from(palette))] : []), bloc("IDAT", deflateSync(Buffer.from(lignes.flat()))), bloc("IEND", Buffer.alloc(0))];
  return new Uint8Array(Buffer.concat([signature, ...blocs]));
}

test("le décodeur rend exactement les pixels d'une image RGB non filtrée, canal alpha opaque", async () => {
  const {largeur, hauteur, rgba} = await decoder_png(png(2, 1, 2, [[0, 128, 3, 7, 131, 232, 128]]));
  assert.deepEqual([largeur, hauteur], [2, 1]);
  assert.deepEqual([...rgba], [128, 3, 7, 255, 131, 232, 128, 255]);
});

test("le décodeur annule chacun des quatre filtres PNG", async () => {
  // Un pixel gris par canal unique répété : la première ligne fixe les références, chaque ligne suivante en utilise un filtre.
  const lignes = [
    [0, 10, 20, 30, 40, 50, 60],
    [1, 11, 21, 31, 1, 2, 3],
    [2, 1, 2, 3, 4, 5, 6],
    [3, 5, 5, 5, 3, 3, 3],
    [4, 1, 1, 1, 2, 2, 2],
  ];
  const {rgba} = await decoder_png(png(2, 5, 2, lignes));
  const lignes_rgb = Array.from({length: 5}, (_, y) => [0, 1].flatMap((x) => [...rgba.subarray(4 * (y * 2 + x), 4 * (y * 2 + x) + 3)]));
  assert.deepEqual(lignes_rgb[1], [11, 21, 31, 12, 23, 34]); // Sub : pixel de gauche ajouté.
  assert.deepEqual(lignes_rgb[2], [12, 23, 34, 16, 28, 40]); // Up : pixel du haut ajouté.
  assert.deepEqual(lignes_rgb[3], [11, 16, 22, 16, 25, 34]); // Average : moyenne de gauche et du haut.
  // Paeth : au premier pixel, seul le haut existe ; au second, 16 + 16 − 11 = 21 est le plus près du haut (16).
  assert.deepEqual(lignes_rgb[4], [12, 17, 23, 18, 27, 36]);
});

test("le décodeur résout une image à palette", async () => {
  const {rgba} = await decoder_png(png(2, 1, 3, [[0, 1, 0]], {palette: [9, 8, 7, 200, 201, 202]}));
  assert.deepEqual([...rgba], [200, 201, 202, 255, 9, 8, 7, 255]);
});

test("le décodeur garde le canal alpha d'une image RGBA", async () => {
  const {rgba} = await decoder_png(png(1, 1, 6, [[0, 1, 2, 3, 77]]));
  assert.deepEqual([...rgba], [1, 2, 3, 77]);
});

test("le décodeur refuse une image entrelacée au lieu de rendre des pixels faux", async () => {
  await assert.rejects(decoder_png(png(1, 1, 2, [[0, 1, 2, 3]], {entrelacement: 1})), /non pris en charge/);
});

test("le décodeur refuse un fichier qui n'est pas un PNG", async () => {
  await assert.rejects(decoder_png(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), /pas un fichier PNG/);
});
