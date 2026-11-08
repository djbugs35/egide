// PNG minimal sans dépendance, avec le zlib de Node (RFC 2083) : décodeur 8 bits RVB ou RVBA non entrelacé pour lire les
// tuiles de relief terrarium, encodeur 16 bits en niveaux de gris pour exporter les cartes de hauteur.
import {deflateSync, inflateSync} from "node:zlib";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function paeth(a, b, c) {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Rendre {largeur, hauteur, canaux, pixels} d'un PNG 8 bits RVB(A) non entrelacé. Lève une erreur sinon. */
export function decoder_png(octets) {
  if (!SIGNATURE.every((o, i) => octets[i] === o)) throw new Error("pas un PNG");
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let [position, largeur, hauteur, canaux] = [8, 0, 0, 0];
  const donnees = [];
  while (position < octets.length) {
    const longueur = vue.getUint32(position);
    const type = String.fromCharCode(...octets.subarray(position + 4, position + 8));
    const corps = octets.subarray(position + 8, position + 8 + longueur);
    if (type === "IHDR") {
      [largeur, hauteur] = [vue.getUint32(position + 8), vue.getUint32(position + 12)];
      const [profondeur, couleur, entrelace] = [corps[8], corps[9], corps[12]];
      if (profondeur !== 8 || ![2, 6].includes(couleur) || entrelace) throw new Error("PNG non pris en charge (8 bits RVB ou RVBA, non entrelacé)");
      canaux = couleur === 2 ? 3 : 4;
    } else if (type === "IDAT") donnees.push(corps);
    else if (type === "IEND") break;
    position += 12 + longueur;
  }
  const brut = inflateSync(Buffer.concat(donnees));
  const ligne = largeur * canaux;
  const pixels = new Uint8Array(ligne * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (ligne + 1)];
    for (let x = 0; x < ligne; x++) {
      const valeur = brut[y * (ligne + 1) + 1 + x];
      const a = x >= canaux ? pixels[y * ligne + x - canaux] : 0;
      const b = y > 0 ? pixels[(y - 1) * ligne + x] : 0;
      const c = x >= canaux && y > 0 ? pixels[(y - 1) * ligne + x - canaux] : 0;
      const predit = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filtre];
      if (predit === undefined) throw new Error(`filtre PNG inconnu ${filtre}`);
      pixels[y * ligne + x] = (valeur + predit) & 255;
    }
  }
  return {largeur, hauteur, canaux, pixels};
}

const TABLE_CRC = Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(octets) {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type, corps) {
  const typeEtCorps = Buffer.concat([Buffer.from(type, "ascii"), corps]);
  const [longueur, somme] = [Buffer.alloc(4), Buffer.alloc(4)];
  longueur.writeUInt32BE(corps.length);
  somme.writeUInt32BE(crc32(typeEtCorps));
  return Buffer.concat([longueur, typeEtCorps, somme]);
}

/** Rendre les octets d'un PNG 16 bits en niveaux de gris ; `valeurs` (0 à 65 535) : ligne par ligne depuis le haut de l'image. */
export function encoder_png_gris16(largeur, hauteur, valeurs) {
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  // Profondeur 16, couleur 0 (gris) ; compression, filtrage et entrelacement aux valeurs par défaut.
  entete[8] = 16;
  const ligne = 1 + 2 * largeur;
  const brut = Buffer.alloc(ligne * hauteur);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) brut.writeUInt16BE(valeurs[y * largeur + x], y * ligne + 1 + 2 * x);
  }
  return Buffer.concat([Buffer.from(SIGNATURE), bloc("IHDR", entete), bloc("IDAT", deflateSync(brut)), bloc("IEND", Buffer.alloc(0))]);
}
