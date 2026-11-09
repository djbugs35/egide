// Décodage PNG sans canvas (MODELE § 23). Relire une image par getImageData donne des pixels légèrement bruités dans les
// navigateurs à protection anti-pistage (Brave) : sur une tuile terrarium, un seul bit de rouge vaut 256 m d'altitude.

const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CANAUX = {2: 3, 3: 1, 6: 4};

/** Rendre les blocs utiles d'un PNG : {entete (DataView d'IHDR), palette, donnees (morceaux d'IDAT)}. */
function lire_blocs(octets) {
  if (SIGNATURE_PNG.some((valeur, i) => octets[i] !== valeur)) throw new Error("pas un fichier PNG");
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const blocs = {entete: null, palette: null, donnees: []};
  for (let curseur = SIGNATURE_PNG.length; curseur + 8 <= octets.length;) {
    const taille = vue.getUint32(curseur);
    const type = String.fromCharCode(...octets.subarray(curseur + 4, curseur + 8));
    const contenu = octets.subarray(curseur + 8, curseur + 8 + taille);
    if (type === "IHDR") blocs.entete = new DataView(contenu.buffer, contenu.byteOffset, contenu.byteLength);
    else if (type === "PLTE") blocs.palette = contenu;
    else if (type === "IDAT") blocs.donnees.push(contenu);
    else if (type === "IEND") break;
    curseur += 12 + taille;
  }
  if (!blocs.entete) throw new Error("PNG sans en-tête");
  return blocs;
}

/** Rendre le prédicteur de Paeth du format PNG : parmi gauche, haut et haut-gauche, le plus proche de leur combinaison. */
function paeth(gauche, haut, haut_gauche) {
  const estimation = gauche + haut - haut_gauche;
  const [ecart_g, ecart_h, ecart_hg] = [Math.abs(estimation - gauche), Math.abs(estimation - haut), Math.abs(estimation - haut_gauche)];
  if (ecart_g <= ecart_h && ecart_g <= ecart_hg) return gauche;
  return ecart_h <= ecart_hg ? haut : haut_gauche;
}

/** Rendre les échantillons bruts de l'image, lignes bout à bout, après annulation du filtre de chaque ligne. */
function defiltrer(brut, largeur, hauteur, canaux) {
  const pas = largeur * canaux;
  const sortie = new Uint8Array(pas * hauteur);
  for (let ligne = 0; ligne < hauteur; ligne++) {
    const filtre = brut[ligne * (pas + 1)];
    const source = ligne * (pas + 1) + 1;
    const debut = ligne * pas;
    for (let i = 0; i < pas; i++) {
      const gauche = i >= canaux ? sortie[debut + i - canaux] : 0;
      const haut = ligne > 0 ? sortie[debut + i - pas] : 0;
      const haut_gauche = ligne > 0 && i >= canaux ? sortie[debut + i - pas - canaux] : 0;
      const prediction = [0, gauche, haut, (gauche + haut) >> 1, paeth(gauche, haut, haut_gauche)][filtre];
      if (prediction === undefined) throw new Error(`filtre PNG inconnu : ${filtre}`);
      sortie[debut + i] = (brut[source + i] + prediction) & 0xff;
    }
  }
  return sortie;
}

/** Rendre les échantillons convertis en RGBA opaque ou non, selon le type de couleur du PNG. */
function vers_rgba(echantillons, type_couleur, palette, nombre_pixels) {
  if (type_couleur === 6) return Uint8ClampedArray.from(echantillons);
  const rgba = new Uint8ClampedArray(nombre_pixels * 4).fill(255);
  for (let p = 0; p < nombre_pixels; p++) {
    for (let canal = 0; canal < 3; canal++) {
      rgba[p * 4 + canal] = type_couleur === 3 ? palette[echantillons[p] * 3 + canal] : echantillons[p * 3 + canal];
    }
  }
  return rgba;
}

async function decompresser(morceaux) {
  const flux = new Blob(morceaux).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

/**
 * Rendre {largeur, hauteur, rgba} d'un PNG 8 bits non entrelacé, en couleurs directes ou à palette.
 *
 * @param {Uint8Array} octets le fichier PNG complet.
 * @returns {Promise<{largeur: number, hauteur: number, rgba: Uint8ClampedArray}>} pixels exacts, ligne par ligne depuis le haut.
 */
export async function decoder_png(octets) {
  const {entete, palette, donnees} = lire_blocs(octets);
  const [largeur, hauteur, profondeur, type_couleur, entrelacement] = [entete.getUint32(0), entete.getUint32(4), entete.getUint8(8), entete.getUint8(9), entete.getUint8(12)];
  const canaux = CANAUX[type_couleur];
  if (profondeur !== 8 || canaux === undefined || entrelacement !== 0) throw new Error(`PNG non pris en charge (profondeur ${profondeur}, couleur ${type_couleur}, entrelacement ${entrelacement})`);
  const echantillons = defiltrer(await decompresser(donnees), largeur, hauteur, canaux);
  return {largeur, hauteur, rgba: vers_rgba(echantillons, type_couleur, palette, largeur * hauteur)};
}
