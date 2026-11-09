// Construction de maillages 3D par le code et écriture en glTF binaire (.glb), sans dépendance. Conventions glTF : mètres,
// Y vers le haut, +Z vers l'avant de l'objet. Une partie est une liste de sommets {p, n, c} pris trois par trois.
// Rien ici ne décrit un système réel : les définitions d'objets privés vivent sous prive/.

const moins = (a, b) => a.map((v, i) => v - b[i]);
const plus = (a, b) => a.map((v, i) => v + b[i]);
const fois = (a, k) => a.map((v) => v * k);
const scalaire = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const vectoriel = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
const unitaire = (a) => fois(a, 1 / (Math.hypot(...a) || 1));

/** Rendre la couleur [r, g, b] linéaire (celle qu'attend glTF) d'une teinte hexadécimale sRGB « #rrggbb ». */
export function couleur(hexa) {
  return [1, 3, 5].map((i) => {
    const s = Number.parseInt(hexa.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
}

/** Rendre les trois sommets d'un triangle, retournés au besoin pour que sa face avant regarde du côté des normales. */
function triangle(a, b, c, teinte, na, nb = na, nc = na) {
  const normale_face = vectoriel(moins(b, a), moins(c, a));
  const moyenne = plus(plus(na, nb), nc);
  const sommets = [{p: a, n: na, c: teinte}, {p: b, n: nb, c: teinte}, {p: c, n: nc, c: teinte}];
  return scalaire(normale_face, moyenne) < 0 ? [sommets[0], sommets[2], sommets[1]] : sommets;
}

const quad = (a, b, c, d, teinte, na, nb = na, nc = na, nd = na) => [...triangle(a, b, c, teinte, na, nb, nc), ...triangle(a, c, d, teinte, na, nc, nd)];

/** Rendre un pavé droit de `centre` et de `taille` [x, y, z] (m). */
export function boite(centre, [lx, ly, lz], teinte) {
  const coin = (sx, sy, sz) => plus(centre, [(sx * lx) / 2, (sy * ly) / 2, (sz * lz) / 2]);
  return [1, -1].flatMap((s) => [
    quad(coin(s, -1, -1), coin(s, 1, -1), coin(s, 1, 1), coin(s, -1, 1), teinte, [s, 0, 0]),
    quad(coin(-1, s, -1), coin(1, s, -1), coin(1, s, 1), coin(-1, s, 1), teinte, [0, s, 0]),
    quad(coin(-1, -1, s), coin(1, -1, s), coin(1, 1, s), coin(-1, 1, s), teinte, [0, 0, s]),
  ]).flat();
}

/** Rendre une plaque d'épaisseur `epaisseur` (m) sur le quadrilatère `coins` : aile, dérive, panneau d'antenne. */
export function plaque(coins, epaisseur, teinte) {
  const normale = unitaire(vectoriel(moins(coins[1], coins[0]), moins(coins[3], coins[0])));
  const dessus = coins.map((c) => plus(c, fois(normale, epaisseur / 2)));
  const dessous = coins.map((c) => plus(c, fois(normale, -epaisseur / 2)));
  const centre = fois(coins.reduce(plus, [0, 0, 0]), 1 / 4);
  const tranches = coins.flatMap((_, i) => {
    const j = (i + 1) % 4;
    const milieu = fois(plus(coins[i], coins[j]), 1 / 2);
    return quad(dessus[i], dessus[j], dessous[j], dessous[i], teinte, unitaire(moins(milieu, centre)));
  });
  return [...quad(...dessus, teinte, normale), ...quad(...dessous, teinte, fois(normale, -1)), ...tranches];
}

/** Rendre deux vecteurs unitaires perpendiculaires à l'axe et entre eux. */
function base_orthogonale(axe) {
  const appui = Math.abs(axe[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = unitaire(vectoriel(axe, appui));
  return [u, vectoriel(axe, u)];
}

/** Rendre un cylindre ou un cône de `a` à `b`, de rayons `ra` et `rb` (m), fermé à ses deux bouts. */
export function cylindre(a, b, ra, teinte, {rb = ra, segments = 16} = {}) {
  const axe = unitaire(moins(b, a));
  const [u, v] = base_orthogonale(axe);
  const radial = (k) => plus(fois(u, Math.cos((2 * Math.PI * k) / segments)), fois(v, Math.sin((2 * Math.PI * k) / segments)));
  const sommets = [];
  for (let k = 0; k < segments; k++) {
    const [ri, rj] = [radial(k), radial(k + 1)];
    const [ai, aj, bi, bj] = [plus(a, fois(ri, ra)), plus(a, fois(rj, ra)), plus(b, fois(ri, rb)), plus(b, fois(rj, rb))];
    sommets.push(...quad(ai, aj, bj, bi, teinte, ri, rj, rj, ri), ...triangle(a, ai, aj, teinte, fois(axe, -1)), ...triangle(b, bi, bj, teinte, axe));
  }
  return sommets;
}

/**
 * Rendre un corps fuselé, suite de sections elliptiques le long de Z, fermé aux deux bouts.
 *
 * @param {{z: number, y: number, x?: number, largeur: number, hauteur: number}[]} sections du nez à la queue, ou l'inverse (m).
 * @param {number[]} teinte couleur linéaire.
 * @param {number} segments facettes du tour.
 */
export function corps(sections, teinte, segments = 24) {
  const point = (s, k) => {
    const angle = (2 * Math.PI * k) / segments;
    return [(s.x ?? 0) + (Math.cos(angle) * s.largeur) / 2, s.y + (Math.sin(angle) * s.hauteur) / 2, s.z];
  };
  const normale = (s, k) => {
    const angle = (2 * Math.PI * k) / segments;
    return unitaire([Math.cos(angle) / Math.max(s.largeur, 0.01), Math.sin(angle) / Math.max(s.hauteur, 0.01), 0]);
  };
  const sommets = [];
  for (let i = 0; i + 1 < sections.length; i++) {
    const [s, t] = [sections[i], sections[i + 1]];
    for (let k = 0; k < segments; k++) sommets.push(...quad(point(s, k), point(s, k + 1), point(t, k + 1), point(t, k), teinte, normale(s, k), normale(s, k + 1), normale(t, k + 1), normale(t, k)));
  }
  const fermer = (s, sens) => Array.from({length: segments}, (_, k) => triangle([s.x ?? 0, s.y, s.z], point(s, k), point(s, k + 1), teinte, [0, 0, sens])).flat();
  const sens = Math.sign(sections[0].z - sections.at(-1).z);
  return [...sommets, ...fermer(sections[0], sens), ...fermer(sections.at(-1), -sens)];
}

/** Rendre la partie vue dans le miroir du plan médian x = 0 : la voilure droite d'après la gauche. */
export function miroir(partie) {
  const reflechis = partie.map(({p: [x, y, z], n: [nx, ny, nz], c}) => ({p: [-x, y, z], n: [-nx, ny, nz], c}));
  // Un miroir inverse le sens de parcours des triangles : on échange deux sommets de chacun pour garder les faces vers l'extérieur.
  return reflechis.map((_, i) => reflechis[i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i]);
}

/** Rendre la partie tournée d'un angle `angle` (rad) autour de l'axe Y passant par `pivot` [x, z]. */
export function tourner_y(partie, angle, [px, pz] = [0, 0]) {
  const [co, si] = [Math.cos(angle), Math.sin(angle)];
  const tourner = ([x, y, z], [cx, cz]) => [cx + (x - cx) * co + (z - cz) * si, y, cz - (x - cx) * si + (z - cz) * co];
  return partie.map(({p, n, c}) => ({p: tourner(p, [px, pz]), n: tourner(n, [0, 0]), c}));
}

const remplir = (taille, octet) => new Uint8Array((4 - (taille % 4)) % 4).fill(octet);

/**
 * Rendre le fichier .glb d'un objet : un seul maillage, couleurs par sommet, ce que lisent CesiumJS comme Godot.
 *
 * @param {string} nom nom du nœud glTF.
 * @param {object[][]} parties listes de sommets, assemblées dans l'ordre ; dépliés (clé `uv`) s'ils portent une texture.
 * @param {Uint8Array} [png] texture de l'objet, multipliée par la couleur des sommets.
 * @returns {Uint8Array} le fichier complet.
 */
export function ecrire_glb(nom, parties, png) {
  const sommets = parties.flat();
  if (sommets.length === 0 || sommets.length % 3 !== 0) throw new Error(`maillage invalide : ${sommets.length} sommets`);
  const flottants_par_sommet = png ? 11 : 9;
  const flottants = new Float32Array(sommets.length * flottants_par_sommet);
  sommets.forEach(({p, n, c, uv}, i) => flottants.set(png ? [...p, ...n, ...c, ...uv] : [...p, ...n, ...c], i * flottants_par_sommet));
  const min = [0, 1, 2].map((a) => sommets.reduce((m, s) => Math.min(m, s.p[a]), Infinity));
  const max = [0, 1, 2].map((a) => sommets.reduce((m, s) => Math.max(m, s.p[a]), -Infinity));
  const accesseur = (byteOffset, extra = {}) => ({bufferView: 0, byteOffset, componentType: 5126, count: sommets.length, type: "VEC3", ...extra});
  const fin_sommets = flottants.byteLength + (png ? remplir(flottants.byteLength, 0).length : 0);
  const avec_texture = png
    ? {textures: [{sampler: 0, source: 0}], images: [{bufferView: 1, mimeType: "image/png"}], samplers: [{magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071}]}
    : {};
  const json = {
    asset: {version: "2.0", generator: "egide/outils/modeles3d"}, scene: 0, scenes: [{nodes: [0]}], nodes: [{name: nom, mesh: 0}],
    meshes: [{name: nom, primitives: [{attributes: {POSITION: 0, NORMAL: 1, COLOR_0: 2, ...(png ? {TEXCOORD_0: 3} : {})}, material: 0}]}],
    materials: [{name: "peinture", pbrMetallicRoughness: {baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.1, roughnessFactor: 0.7, ...(png ? {baseColorTexture: {index: 0}} : {})}}],
    accessors: [accesseur(0, {min, max}), accesseur(12), accesseur(24), ...(png ? [accesseur(36, {type: "VEC2"})] : [])],
    bufferViews: [{buffer: 0, byteLength: flottants.byteLength, byteStride: flottants_par_sommet * 4, target: 34962}, ...(png ? [{buffer: 0, byteOffset: fin_sommets, byteLength: png.length}] : [])],
    buffers: [{byteLength: fin_sommets + (png ? png.length : 0)}],
    ...avec_texture,
  };
  const texte = new TextEncoder().encode(JSON.stringify(json));
  const [bourrage, tailleJson] = [remplir(texte.length, 0x20), texte.length + remplir(texte.length, 0x20).length];
  const tailleBinaire = json.buffers[0].byteLength;
  const tailleBloc = tailleBinaire + remplir(tailleBinaire, 0).length;
  const fichier = new Uint8Array(12 + 8 + tailleJson + 8 + tailleBloc);
  const vue = new DataView(fichier.buffer);
  [0x46546c67, 2, fichier.length].forEach((v, i) => vue.setUint32(i * 4, v, true));
  vue.setUint32(12, tailleJson, true);
  vue.setUint32(16, 0x4e4f534a, true);
  fichier.set(texte, 20);
  fichier.set(bourrage, 20 + texte.length);
  vue.setUint32(20 + tailleJson, tailleBloc, true);
  vue.setUint32(24 + tailleJson, 0x004e4942, true);
  fichier.set(new Uint8Array(flottants.buffer), 28 + tailleJson);
  if (png) fichier.set(png, 28 + tailleJson + fin_sommets);
  return fichier;
}
