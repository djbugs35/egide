// Archétypes de modèles 3D (MODELE § 23) : formes paramétrées par classe (mètres, Y haut, +Z avant), assemblées à partir de
// maillage.js. Chaque fonction rend {parties, reperes}, les repères plaçant d'éventuels marquages. Aucun système réel ici.
import {boite, corps, couleur, cylindre, miroir, plaque, tourner_y} from "./maillage.js";
import {ANTENNE, METAL, NOIR, PEINT, PNEU, VITRE} from "./peinture.js";

const SOMBRE = couleur("#3a3f36");
const CLAIR = couleur("#c9ccc9");
const SOMBRE_CARGO = couleur("#4d5358");

const paire = (partie) => [partie, miroir(partie)];
const section = (z, y, largeur, hauteur, x) => ({z, y, largeur, hauteur, ...(x === undefined ? {} : {x})});

/** Rendre les pales d'une hélice de `rayon` (m) autour de `centre`, axe Z (propulsive) ou Y (rotor de multirotor). */
function helice(centre, rayon, nombre, axe = "z") {
  const corde = rayon * 0.09;
  return Array.from({length: nombre}, (_, k) => {
    const a = (k * 2 * Math.PI) / nombre + 0.4;
    const [u, v] = axe === "z" ? [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0]] : [[Math.cos(a), 0, Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)]];
    const point = (r, w) => centre.map((c, i) => c + u[i] * r + v[i] * w);
    return plaque([point(0, corde), point(rayon, corde * 0.5), point(rayon, -corde * 0.5), point(0, -corde)], Math.max(0.004, rayon * 0.02), NOIR);
  });
}

/** Rendre un missile d'emport le long de Z, avec ses ailettes. */
function missile_emport(x, y, z, longueur, rayon) {
  const [pointe, queue] = [z + longueur / 2, z - longueur / 2];
  const ogive = Math.min(0.3, longueur / 8);
  const parties = [cylindre([x, y, queue], [x, y, pointe - ogive], rayon, CLAIR, {segments: 10}), cylindre([x, y, pointe - ogive], [x, y, pointe], rayon, NOIR, {rb: 0.005, segments: 10})];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ecart = rayon * 3.2;
    parties.push(plaque([[x + dx * rayon, y + dy * rayon, queue + longueur / 7], [x + dx * ecart, y + dy * ecart, queue + longueur / 20], [x + dx * ecart, y + dy * ecart, queue], [x + dx * rayon, y + dy * rayon, queue]], 0.02, CLAIR));
  }
  return parties;
}

// Bords de la voilure, en fractions de la longueur : avant et arrière à l'emplanture, avant et arrière au saumon.
const VOILURES = {
  delta: [0.15, -0.46, -0.37, -0.48], fleche: [0.05, -0.28, -0.24, -0.33], trap: [0.06, -0.22, -0.16, -0.24],
  droite: [0.04, -0.12, 0.01, -0.09], variable: [0.1, -0.3, -0.33, -0.4],
};

/** Rendre la voilure gauche et droite d'après sa forme, l'envergure `E`, la longueur `L` et la demi-largeur `r` du fuselage. */
function voilure(forme, L, E, r, y, epaisseur) {
  const [a, b, c, d] = VOILURES[forme].map((f) => f * L);
  return paire(plaque([[r, y, a], [E / 2, y - E * 0.012, c], [E / 2, y - E * 0.012, d], [r, y, b]], epaisseur, PEINT));
}

/** Rendre les parties motrices d'un chasseur : nacelles, tuyères, entrées d'air. */
function propulsion(L, x, ry, entree, partiesCorps) {
  const parties = [];
  for (const cx of x) {
    if (x.length > 1) parties.push(corps([section(L * 0.02, -ry * 0.5, ry * 1.25, ry * 1.1, cx), section(-L * 0.34, -ry * 0.1, ry * 1.3, ry * 1.15, cx), section(-L * 0.46, 0, ry * 1.05, ry * 0.95, cx)], PEINT, 18));
    parties.push(cylindre([cx, 0, -L * 0.46], [cx, 0, -L / 2], ry * 0.5, METAL, {rb: ry * 0.42, segments: 16}), cylindre([cx, 0, -L * 0.495], [cx, 0, -L / 2 - 0.02], ry * 0.33, NOIR, {segments: 16}));
  }
  const [zEntree, yEntree] = [L * 0.2, -ry * 0.65];
  if (entree === "menton") parties.push(boite([0, -ry * 1.05, L * 0.1], [ry * 1.2, ry * 0.6, L * 0.08], PEINT), boite([0, -ry * 1.05, L * 0.145], [ry * 0.95, ry * 0.42, 0.04], NOIR));
  else if (entree) partiesCorps.push(...paire(boite([ry * 0.95, yEntree, zEntree - L * 0.06], [ry * 0.8, ry * 0.7, L * 0.12], PEINT)), ...paire(boite([ry * 0.95, yEntree, zEntree], [ry * 0.6, ry * 0.5, 0.04], NOIR)));
  return parties;
}

/** Rendre un chasseur : voilure, un ou deux réacteurs, une ou deux dérives, plans canards, emports. */
export function chasseur({L, E, H, aile = "trap", moteurs = 2, ecart = 0.09, derives = 1, canard = false, biplace = false, entree = "laterale", empennage = aile !== "delta", furtif = false}) {
  const r = L * 0.075;
  const parties = [corps([section(L / 2, 0.02 * L, 0.02, 0.02), section(L * 0.46, 0.02 * L, r * 0.5, r * 0.5), section(L * 0.32, 0.015 * L, r * 1.3, r * 1.35), section(L * 0.15, 0.005 * L, r * 1.8, r * 1.75), section(-L * 0.1, 0, r * 2.5, r * 1.6), section(-L * 0.38, 0, r * 2.2, r * 1.35), section(-L * 0.46, 0, r * 1.7, r * 1.2)], PEINT, 28)];
  parties.push(corps([section(L / 2, 0.02 * L, 0.01, 0.01), section(L * 0.46, 0.02 * L, r * 0.52, r * 0.52), section(L * 0.42, 0.018 * L, r * 0.9, r * 0.92)], furtif ? PEINT : couleur("#4b5158"), 20));
  const longueurVerriere = biplace ? L * 0.26 : L * 0.17;
  const zv = L * 0.28;
  parties.push(corps([section(zv + longueurVerriere * 0.45, r * 0.62, r * 0.25, r * 0.15), section(zv + longueurVerriere * 0.15, r * 1.0, r * 0.95, r * 0.75), section(zv - longueurVerriere * 0.35, r * 1.02, r * 0.85, r * 0.6), section(zv - longueurVerriere * 0.6, r * 0.8, r * 0.3, r * 0.2)], VITRE, 18));
  const x = moteurs === 1 ? [0] : [-ecart * E, ecart * E];
  parties.push(...propulsion(L, x, r, entree, parties));
  parties.push(...voilure(aile, L, E, r * 1.1, -0.01 * L, L * 0.012));
  if (canard) parties.push(...paire(plaque([[r * 0.9, r * 0.2, L * 0.2], [E * 0.2, r * 0.3, L * 0.09], [E * 0.2, r * 0.3, L * 0.04], [r * 0.9, r * 0.2, L * 0.09]], L * 0.006, PEINT)));
  if (empennage) parties.push(...paire(plaque([[r * 1.1, 0, -L * 0.34], [E * 0.26, -L * 0.012, -L * 0.45], [E * 0.26, -L * 0.012, -L * 0.5], [r * 1.1, 0, -L * 0.47]], L * 0.008, PEINT)));
  for (const xd of derives === 1 ? [0] : [-ecart * E * 1.1, ecart * E * 1.1]) {
    const penche = derives === 2 ? Math.sign(xd) * H * 0.1 : 0;
    parties.push(plaque([[xd, r * 0.6, -L * 0.2], [xd + penche, H * 0.72, -L * 0.4], [xd + penche, H * 0.72, -L * 0.47], [xd, r * 0.6, -L * 0.43]], L * 0.009, PEINT));
  }
  if (!furtif) {
    for (const f of [0.95, 0.62, 0.4]) parties.push(...paire(boite([(f * E) / 2, -L * 0.03, -L * 0.18], [0.08, 0.12, L * 0.14], METAL)), ...[-1, 1].flatMap((signe) => missile_emport((signe * f * E) / 2, -L * 0.055, -L * 0.17, L * 0.2, 0.09)));
  }
  return {parties, reperes: {aile: [E * 0.3, -L * 0.22, Math.min(E * 0.045, 0.6)], derive: {x: derives === 1 ? 0 : ecart * E * 1.1, z: -L * 0.42, y: H * 0.5}}, pas: L / 13};
}

/** Rendre un gros porteur : voilure, deux à quatre moteurs, radar dorsal facultatif. */
export function avion_large({L, E, H, haute = false, moteurs = 4, helice = false, radome = null, canons = false}) {
  const r = L * 0.055;
  const yAile = haute ? r * 0.85 : -r * 0.5;
  const parties = [corps([section(L / 2, -r * 0.2, 0.05, 0.05), section(L * 0.46, -r * 0.1, r * 1.1, r * 1.1), section(L * 0.38, 0, r * 1.9, r * 1.9), section(-L * 0.25, 0, r * 2, r * 2), section(-L * 0.45, r * 0.5, r * 0.8, r * 0.9), section(-L / 2, r * 0.7, 0.1, 0.1)], PEINT, 28)];
  parties.push(corps([section(L * 0.43, r * 0.62, r * 0.3, r * 0.2), section(L * 0.4, r * 0.78, r * 1.2, r * 0.45), section(L * 0.37, r * 0.72, r * 1.3, r * 0.4)], VITRE, 14));
  parties.push(...paire(plaque([[r * 0.9, yAile, L * 0.1], [E / 2, yAile + r * 0.6, -L * 0.14], [E / 2, yAile + r * 0.6, -L * 0.2], [r * 0.9, yAile, -L * 0.12]], L * 0.012, PEINT)));
  parties.push(...paire(plaque([[r * 0.3, r * 0.7, -L * 0.36], [E * 0.2, r * 0.9, -L * 0.45], [E * 0.2, r * 0.9, -L * 0.49], [r * 0.3, r * 0.7, -L * 0.46]], L * 0.008, PEINT)));
  parties.push(plaque([[0, r * 1.5, -L * 0.3], [0, H * 0.72, -L * 0.45], [0, H * 0.72, -L * 0.5], [0, r * 1.5, -L * 0.46]], L * 0.008, PEINT));
  const positions = moteurs === 2 ? [0.32] : [0.26, 0.48];
  for (const f of positions) {
    const x = (f * E) / 2;
    const y = yAile + (haute ? 0 : -r * 0.45) + f * r * 0.6;
    const z = L * 0.08 - f * L * 0.2;
    parties.push(...paire(cylindre([x, y, z - L * 0.07], [x, y, z + L * 0.04], r * 0.42, PEINT, {segments: 14})));
    if (helice) {
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + 0.4;
        parties.push(...paire(plaque([[x + Math.cos(a) * 0.05, y + Math.sin(a) * 0.05, z + L * 0.045], [x + Math.cos(a) * L * 0.1, y + Math.sin(a) * L * 0.1, z + L * 0.05], [x + Math.cos(a) * L * 0.1 - Math.sin(a) * 0.1, y + Math.sin(a) * L * 0.1 + Math.cos(a) * 0.1, z + L * 0.05], [x - Math.sin(a) * 0.1, y + Math.cos(a) * 0.1, z + L * 0.045]], 0.03, NOIR)));
      }
    } else parties.push(...paire(cylindre([x, y, z + L * 0.04], [x, y, z + L * 0.045], r * 0.28, NOIR, {segments: 14})));
  }
  const dessus = r * 1.0;
  if (radome === "rotodome") parties.push(cylindre([0, dessus + r * 0.9, -L * 0.14], [0, dessus + r * 1.05, -L * 0.14], L * 0.11, CLAIR, {segments: 32}), ...paire(cylindre([r * 0.3, dessus, -L * 0.14], [r * 0.3, dessus + r * 0.9, -L * 0.14], 0.12, METAL, {segments: 8})));
  if (radome === "planche") parties.push(boite([0, dessus + r * 0.6, -L * 0.1], [0.4, r * 0.7, L * 0.25], CLAIR), ...paire(boite([0.12, dessus + r * 0.2, -L * 0.1], [0.14, r * 0.6, L * 0.08], METAL)));
  if (canons) for (const z of [L * 0.05, -L * 0.08]) parties.push(cylindre([-r * 2, -r * 0.2, z], [-r * 3.2, -r * 0.2, z], 0.12, NOIR, {segments: 10}));
  return {parties, reperes: {aile: [E * 0.3, -L * 0.04, Math.min(E * 0.03, 0.9)], derive: {x: 0, z: -L * 0.44, y: H * 0.5}}, pas: L / 22};
}

/** Rendre un drone longue endurance : corps fin, voile droite d'allongement élevé, queue en V, hélice ou réacteur. */
export function drone_male({L, E, H = L * 0.25, queue = "v", reacteur = false}) {
  const r = Math.max(0.12, L * 0.07);
  const parties = [corps([section(L / 2, 0, 0.02, 0.02), section(L * 0.4, r * 0.15, r * 1.4, r * 1.6), section(L * 0.1, r * 0.2, r * 1.7, r * 1.9), section(-L * 0.3, 0, r * 0.9, r * 1.0), section(-L * 0.45, 0, r * 0.45, r * 0.5)], PEINT, 22)];
  parties.push(corps([section(L * 0.48, r * 0.1, 0.02, 0.02), section(L * 0.42, r * 0.15, r * 0.9, r * 0.9), section(L * 0.34, r * 0.15, r * 1.1, r * 1.0)], NOIR, 14));
  parties.push(...paire(plaque([[r * 0.5, r * 0.7, L * 0.12], [E / 2, r * 0.75, L * 0.06], [E / 2, r * 0.75, L * 0.01], [r * 0.5, r * 0.7, -L * 0.04]], Math.max(0.02, L * 0.012), PEINT)));
  if (queue === "t") {
    parties.push(plaque([[0, r * 0.4, -L * 0.3], [0, H * 0.7, -L * 0.42], [0, H * 0.7, -L * 0.47], [0, r * 0.4, -L * 0.46]], L * 0.01, PEINT));
    parties.push(...paire(plaque([[0.02, H * 0.7, -L * 0.42], [E * 0.1, H * 0.7, -L * 0.45], [E * 0.1, H * 0.7, -L * 0.47], [0.02, H * 0.7, -L * 0.47]], L * 0.008, PEINT)));
  } else {
    const signe = queue === "vinv" ? -1 : 1;
    parties.push(...paire(plaque([[r * 0.2, signe * r * 0.1, -L * 0.3], [E * 0.13, signe * H * 0.6, -L * 0.42], [E * 0.13, signe * H * 0.6, -L * 0.47], [r * 0.2, signe * r * 0.1, -L * 0.45]], L * 0.009, PEINT)));
  }
  if (reacteur) parties.push(cylindre([0, r * 0.75, -L * 0.15], [0, r * 0.75, L * 0.02], r * 0.5, PEINT, {segments: 14}), cylindre([0, r * 0.75, L * 0.02], [0, r * 0.75, L * 0.022], r * 0.4, NOIR, {segments: 14}));
  else parties.push(...helice([0, 0, -L * 0.47], L * 0.1, 3), cylindre([0, 0, -L * 0.45], [0, 0, -L * 0.48], r * 0.3, METAL, {segments: 10}));
  return {parties, reperes: {aile: [E * 0.28, L * 0.04, Math.min(E * 0.03, 0.35)], derive: null}, pas: Math.max(0.2, L / 11)};
}

/** Rendre une aile volante furtive, avec ou sans dérives. */
export function aile_volante({L, E, H = L * 0.14, derives = 0}) {
  const parties = [corps([section(L / 2, 0, 0.05, 0.03), section(L * 0.2, 0, L * 0.2, H * 0.8), section(-L * 0.25, 0, L * 0.18, H * 0.55), section(-L / 2, 0, L * 0.05, H * 0.1)], PEINT, 22)];
  parties.push(...paire(plaque([[L * 0.08, 0, L * 0.35], [E / 2, 0, -L * 0.28], [E / 2, 0, -L * 0.36], [L * 0.08, 0, -L * 0.25]], H * 0.15, PEINT)));
  parties.push(boite([0, H * 0.32, L * 0.2], [L * 0.12, H * 0.08, 0.05], NOIR), cylindre([0, 0, -L * 0.47], [0, 0, -L / 2], L * 0.05, NOIR, {segments: 14}));
  for (const signe of derives ? [-1, 1] : []) parties.push(plaque([[signe * L * 0.18, H * 0.3, -L * 0.28], [signe * L * 0.28, H, -L * 0.42], [signe * L * 0.28, H, -L * 0.48], [signe * L * 0.18, H * 0.3, -L * 0.45]], L * 0.012, PEINT));
  return {parties, reperes: {aile: [E * 0.28, -L * 0.15, Math.min(E * 0.03, 0.35)], derive: null}, pas: L / 9};
}

/** Rendre un drone à voilure delta et hélice propulsive, dérives en bout d'aile. */
export function drone_delta({L, E, H = L * 0.2}) {
  const r = L * 0.075;
  const parties = [corps([section(L / 2, 0, 0.02, 0.02), section(L * 0.42, 0, r * 1.5, r * 1.5), section(-L * 0.25, 0, r * 1.7, r * 1.5), section(-L * 0.45, 0, r * 0.8, r * 0.8)], PEINT, 18)];
  parties.push(...paire(plaque([[r * 0.7, 0, L * 0.3], [E / 2, 0, -L * 0.36], [E / 2, 0, -L * 0.47], [r * 0.7, 0, -L * 0.45]], L * 0.015, PEINT)));
  parties.push(...paire(plaque([[E / 2, 0, -L * 0.32], [E / 2, H * 0.6, -L * 0.4], [E / 2, H * 0.6, -L * 0.47], [E / 2, 0, -L * 0.47]], L * 0.012, PEINT)));
  parties.push(cylindre([0, 0, -L * 0.45], [0, 0, -L * 0.48], r * 0.7, METAL, {segments: 12}));
  parties.push(...helice([0, 0, -L * 0.49], L * 0.1, 2));
  return {parties, reperes: {aile: [E * 0.26, -L * 0.2, Math.min(E * 0.04, 0.2)], derive: null}, pas: Math.max(0.12, L / 8)};
}

/** Rendre un petit multirotor : corps, bras en croix, moteurs et hélices, charge sous le ventre. */
export function multirotor({L, E = L, charge = true}) {
  const parties = [boite([0, 0, 0], [L * 0.3, L * 0.12, L * 0.45], PEINT)];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const [x, z] = [(sx * E) / 2.2, (sz * E) / 2.2];
    parties.push(cylindre([0, 0, 0], [x, 0, z], L * 0.025, NOIR, {segments: 8}), cylindre([x, 0, z], [x, L * 0.08, z], L * 0.05, METAL, {segments: 10}), ...helice([x, L * 0.09, z], E * 0.22, 2, "y"));
  }
  if (charge) parties.push(cylindre([0, -L * 0.1, L * 0.22], [0, -L * 0.1, -L * 0.22], L * 0.07, METAL, {segments: 12}), boite([0, L * 0.09, L * 0.16], [L * 0.08, L * 0.06, L * 0.08], NOIR));
  return {parties, reperes: {aile: null, derive: null}, pas: Math.max(0.06, L / 6)};
}

/** Rendre une munition rôdeuse : corps cylindrique, deux paires d'ailes en X ou en tandem, hélice arrière. */
export function rodeur({L, E, D = L * 0.11}) {
  const r = D / 2;
  const parties = [cylindre([0, 0, -L * 0.45], [0, 0, L * 0.34], r, PEINT, {segments: 16}), cylindre([0, 0, L * 0.34], [0, 0, L / 2], r, NOIR, {rb: 0.01, segments: 16}), cylindre([0, 0, L * 0.3], [0, 0, L * 0.31], r * 1.02, SOMBRE, {segments: 16})];
  for (const z of [L * 0.2, -L * 0.28]) for (const k of [0, 1, 2, 3]) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const [cx, cy] = [Math.cos(a), Math.sin(a)];
    parties.push(plaque([[cx * r, cy * r, z], [(cx * E) / 2, (cy * E) / 2, z - L * 0.05], [(cx * E) / 2, (cy * E) / 2, z - L * 0.12], [cx * r, cy * r, z - L * 0.1]], 0.012, PEINT));
  }
  parties.push(...helice([0, 0, -L * 0.49], E * 0.16, 2));
  return {parties, reperes: {aile: null, derive: null}, pas: Math.max(0.1, L / 7)};
}

/** Rendre une munition à longue portée : croisière ailée, balistique étagée, planeur hypersonique ou intercepteur. */
export function munition({L, D, type = "croisiere", E = D * 3}) {
  const r = D / 2;
  const parties = [];
  if (type === "planeur") {
    parties.push(corps([section(L / 2, 0, 0.01, 0.01), section(-L * 0.4, r * 0.3, D * 1.6, D * 0.55), section(-L / 2, r * 0.3, D * 1.7, D * 0.5)], PEINT, 18));
    parties.push(...paire(plaque([[D * 0.5, r * 0.5, -L * 0.38], [D * 0.95, r, -L * 0.46], [D * 0.95, r, -L / 2], [D * 0.5, r * 0.5, -L / 2]], 0.04, PEINT)));
    return {parties, reperes: {aile: null, derive: null}, pas: L / 8};
  }
  const nez = type === "croisiere" ? L * 0.1 : L * 0.16;
  parties.push(cylindre([0, 0, -L / 2], [0, 0, L / 2 - nez], r, PEINT, {segments: 22}), cylindre([0, 0, L / 2 - nez], [0, 0, L / 2], r, type === "croisiere" ? PEINT : CLAIR, {rb: 0.01, segments: 22}));
  if (type === "balistique") for (const f of [0.15, -0.15]) parties.push(cylindre([0, 0, L * f - 0.02], [0, 0, L * f + 0.02], r * 1.03, NOIR, {segments: 22}));
  if (type === "croisiere") {
    parties.push(...paire(plaque([[r * 0.8, 0, L * 0.08], [E / 2, 0, -L * 0.02], [E / 2, 0, -L * 0.07], [r * 0.8, 0, -L * 0.04]], 0.03, PEINT)));
    parties.push(boite([0, -r * 0.95, -L * 0.32], [r * 1.1, r * 0.55, L * 0.14], SOMBRE), cylindre([0, 0, -L / 2], [0, 0, -L / 2 - 0.02], r * 0.6, NOIR, {segments: 14}));
  }
  // Une nacelle de brouillage n'a pas de gouverne.
  const nb = type === "pod" ? 0 : 4;
  for (let k = 0; k < nb; k++) {
    const a = ((k + (type === "croisiere" ? 0.5 : 0)) * Math.PI) / 2;
    const [cx, cy] = [Math.cos(a), Math.sin(a)];
    const ecart = r * (type === "croisiere" ? 2.2 : 2);
    parties.push(plaque([[cx * r, cy * r, -L * 0.33], [cx * ecart, cy * ecart, -L * 0.43], [cx * ecart, cy * ecart, -L * 0.49], [cx * r, cy * r, -L * 0.49]], 0.03, PEINT));
    if (type === "intercepteur") parties.push(plaque([[cx * r, cy * r, L * 0.1], [cx * ecart * 0.7, cy * ecart * 0.7, L * 0.04], [cx * ecart * 0.7, cy * ecart * 0.7, 0], [cx * r, cy * r, 0]], 0.02, PEINT));
  }
  return {parties, reperes: {aile: null, derive: null}, pas: L / 9};
}

/** Rendre un hélicoptère générique : cabine, poutre, rotors, patins. */
export function helico({L, D}) {
  const parties = [corps([section(L * 0.32, 1.4, 0.3, 0.3), section(L * 0.24, 1.6, 1.8, 1.8), section(L * 0.05, 1.8, 2, 2), section(-L * 0.1, 2.0, 1.2, 1.1), section(-L * 0.5, 2.3, 0.3, 0.3)], PEINT, 24)];
  parties.push(corps([section(L * 0.33, 1.5, 0.2, 0.2), section(L * 0.26, 1.75, 1.7, 1.2), section(L * 0.14, 2.05, 1.8, 1)], VITRE, 18));
  parties.push(plaque([[0, 2.4, -L * 0.4], [0, 3.6, -L * 0.48], [0, 3.6, -L * 0.53], [0, 2.3, -L * 0.5]], 0.1, PEINT));
  parties.push(cylindre([0, 2.9, 0], [0, 3.7, 0], 0.14, METAL, {segments: 12}));
  for (let k = 0; k < 4; k++) parties.push(tourner_y(boite([D / 4, 3.7, 0], [D / 2, 0.04, 0.32], NOIR), (k * Math.PI) / 2 + 0.4));
  for (const x of [-1.2, 1.2]) parties.push(cylindre([x, 0.08, 2.2], [x, 0.08, -2], 0.05, METAL, {segments: 8}), cylindre([x, 0.08, 1.2], [x * 0.6, 1.1, 1.2], 0.05, METAL, {segments: 8}));
  return {parties, reperes: {aile: null, derive: {x: 0, z: -L * 0.47, y: 3}}, pas: L / 16};
}

// --- Matériels au sol : un train roulant, puis une liste de charges posées sur le plateau. ---

/** Rendre un train roulant : porteur à roues avec cabine, chenillé, remorque ou socle fixe. */
function train(type, L) {
  const parties = [];
  if (type === "socle") {
    parties.push(boite([0, 0.08, 0], [Math.max(3, L), 0.16, Math.max(3, L)], couleur("#8a8a84")));
    return {parties, y: 0.16, zAvant: L / 2, zArriere: -L / 2};
  }
  if (type === "pont") {
    parties.push(boite([0, 0.1, 0], [Math.max(4, L), 0.2, Math.max(4, L)], PEINT));
    return {parties, y: 0.2, zAvant: L / 2, zArriere: -L / 2};
  }
  if (type === "chenilles") {
    parties.push(boite([0, 1.25, 0], [3, 1, L], PEINT));
    for (const x of [-1.5, 1.5]) {
      parties.push(boite([x, 0.55, 0], [0.5, 0.75, L], PNEU));
      for (let i = 0; i < 6; i++) parties.push(cylindre([x - 0.28, 0.5, L * (0.4 - (i * 0.8) / 5)], [x + 0.28, 0.5, L * (0.4 - (i * 0.8) / 5)], 0.34, METAL, {segments: 14}));
    }
    parties.push(boite([0, 1.5, L / 2 - 0.2], [1.2, 0.3, 0.05], VITRE));
    return {parties, y: 1.75, zAvant: L / 2 - 1, zArriere: -L / 2};
  }
  const essieux = {remorque: 2, "4x4": 2, "6x6": 3, "8x8": 4}[type];
  parties.push(boite([0, 1.2, 0], [2.4, 0.5, L], PEINT), boite([0, 1.5, 0], [2.45, 0.1, L - 0.2], SOMBRE));
  const zc = L / 2 - 1.05;
  if (type !== "remorque") {
    parties.push(boite([0, 2.15, zc], [2.5, 1.75, 2.1], PEINT), boite([0, 2.6, zc + 1.06], [2.25, 0.72, 0.04], VITRE), boite([0, 1.55, zc + 1.06], [2.15, 0.32, 0.05], NOIR));
    parties.push(...paire(boite([1.26, 2.6, zc + 0.32], [0.03, 0.62, 0.8], VITRE)), ...paire(boite([1.3, 3, zc + 0.92], [0.22, 0.1, 0.1], NOIR)));
  }
  for (let i = 0; i < essieux; i++) {
    const z = L / 2 - 1.5 - (i * (L - 3)) / Math.max(1, essieux - 1);
    for (const x of [-1.2, 1.2]) {
      parties.push(cylindre([x - 0.2, 0.62, z], [x + 0.2, 0.62, z], 0.62, PNEU, {segments: 20}));
      parties.push(cylindre([x + Math.sign(x) * 0.2, 0.62, z], [x + Math.sign(x) * 0.24, 0.62, z], 0.28, METAL, {segments: 12}));
    }
  }
  return {parties, y: 1.55, zAvant: type === "remorque" ? L / 2 : zc - 1.05, zArriere: -L / 2};
}

const CHARGES = {
  /** Antenne plane relevée, pivot et bras de maintien. */
  radar({l = 6, h = 4.5, incl = 0.3, z = -1, haut = 0}, y0) {
    const [pied, zc] = [y0 + haut, z];
    const point = (x, s) => [x, pied + 0.7 + s * Math.cos(incl), zc - 0.2 - s * Math.sin(incl)];
    const parties = [cylindre([0, pied, zc], [0, pied + 0.35, zc], 0.7, METAL, {segments: 20}), boite([0, pied + 0.55, zc], [1.4, 0.3, 1.1], SOMBRE)];
    parties.push(plaque([point(-l / 2, 0), point(l / 2, 0), point(l / 2, h), point(-l / 2, h)], 0.2, ANTENNE));
    parties.push(...paire(cylindre([1.1, pied + 0.9, zc + 0.4], point(1.4, h * 0.6), 0.07, METAL, {segments: 8})));
    return parties;
  },
  /** Grand réseau fixe en dalle inclinée sur pieds. */
  dalle({l = 20, h = 10, incl = 0.4, z = 0}, y0) {
    const point = (x, s) => [x, y0 + 1 + s * Math.cos(incl), z - s * Math.sin(incl)];
    return [plaque([point(-l / 2, 0), point(l / 2, 0), point(l / 2, h), point(-l / 2, h)], 0.5, ANTENNE), ...[-0.4, 0.4].flatMap((f) => [cylindre([f * l, y0, z - 1], point(f * l, h * 0.7), 0.25, METAL, {segments: 10})])];
  },
  /** Parabole de transmission sur affût. */
  parabole({r = 1.5, z = -1}, y0) {
    const c = [0, y0 + r + 0.8, z];
    return [cylindre([0, y0, z], c, 0.12, METAL, {segments: 10}), cylindre([c[0], c[1], c[2] + 0.2], [c[0], c[1] + r * 0.2, c[2] - 0.15], r, CLAIR, {rb: r * 0.35, segments: 28})];
  },
  /** Mât télescopique et antennes-fouets. */
  mat({h = 12, z = -1}, y0) {
    return [cylindre([0, y0, z], [0, y0 + h, z], 0.09, METAL, {rb: 0.04, segments: 8}), cylindre([-1, y0 + h * 0.8, z], [1, y0 + h * 0.8, z], 0.02, METAL, {segments: 6}), cylindre([0, y0 + h, z], [0, y0 + h + 0.3, z], 0.15, NOIR, {segments: 10}), cylindre([0.9, y0, z + 1.5], [0.9, y0 + 3.5, z + 1.5], 0.012, NOIR, {segments: 6})];
  },
  /** Abri technique, ouïes et porte latérale. */
  abri({l = 5, h = 2.3, z = -1}, y0) {
    const parties = [boite([0, y0 + h / 2, z], [2.4, h, l], PEINT), ...paire(boite([1.21, y0 + h * 0.5, z + l * 0.25], [0.03, h * 0.7, 0.9], SOMBRE))];
    for (let i = 0; i < 5; i++) parties.push(...paire(boite([1.21, y0 + h * 0.3 + i * 0.25, z - l * 0.25], [0.04, 0.08, 1], NOIR)));
    parties.push(boite([0, y0 + h + 0.06, z - l * 0.2], [1, 0.12, 1], SOMBRE));
    return parties;
  },
  /** Conteneurs de missiles dressés à la verticale. */
  lanceur_v({rangees = 2, colonnes = 4, h = 6.5, cote = 0.56, z = -3}, y0) {
    const parties = [boite([0, y0 + 0.2, z], [2.4, 0.4, rangees * cote + 0.4], SOMBRE)];
    for (let r = 0; r < rangees; r++) {
      for (let c = 0; c < colonnes; c++) {
        const [x, zc] = [(c - (colonnes - 1) / 2) * (cote + 0.04), z + (r - (rangees - 1) / 2) * (cote + 0.05)];
        parties.push(boite([x, y0 + 0.4 + h / 2, zc], [cote, h, cote], PEINT), cylindre([x, y0 + 0.4 + h, zc], [x, y0 + 0.43 + h, zc], cote * 0.4, CLAIR, {segments: 14}));
        for (const yb of [0.25, 0.6, 0.9]) parties.push(boite([x, y0 + 0.4 + h * yb, zc], [cote + 0.04, 0.07, cote + 0.04], SOMBRE));
      }
    }
    return parties;
  },
  /** Faisceau de tubes ou de caissons inclinés sur un affût orientable. */
  lanceur_i({n = 4, angle = 0.65, L = 6, D = 0.7, carre = true, z = -2}, y0) {
    const parties = [cylindre([0, y0, z], [0, y0 + 0.4, z], 1.1, METAL, {segments: 20}), boite([0, y0 + 0.7, z], [2.2, 0.35, 1.8], SOMBRE)];
    // Berceau sous le faisceau : sans lui, les tubes flottent au-dessus de leur affût dès qu'ils sont peu relevés.
    parties.push(cylindre([0, y0 + 0.8, z + 1], [0, y0 + 0.8 + Math.sin(angle) * L * 0.8, z + 1 - Math.cos(angle) * L * 0.8], 0.22, METAL, {segments: 6}));
    const colonnes = n <= 4 ? 2 : Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const x = ((i % colonnes) - (colonnes - 1) / 2) * (D + 0.06);
      const etage = Math.floor(i / colonnes) * (D + 0.06);
      const y = y0 + 0.95 + D / 2 + etage;
      const a = [x, y, z + 1];
      const b = [x, y + Math.sin(angle) * L, z + 1 - Math.cos(angle) * L];
      if (carre) parties.push(cylindre(a, b, D / 2, PEINT, {segments: 4}));
      else parties.push(cylindre(a, b, D / 2, PEINT, {segments: 14}), cylindre(b, [b[0], b[1] + 0.02, b[2] - 0.02], D * 0.36, CLAIR, {segments: 14}));
    }
    return parties;
  },
  /** Tourelle à canons, tubes multiples, radar de veille en tête. */
  canon({tubes = 2, long = 3, calibre = 0.09, z = -0.5, radar: avec_radar = true}, y0) {
    const parties = [cylindre([0, y0, z], [0, y0 + 0.35, z], 1.2, METAL, {segments: 22}), boite([0, y0 + 1, z], [2.1, 1.1, 2.2], PEINT)];
    for (let i = 0; i < tubes; i++) {
      const x = (i - (tubes - 1) / 2) * 0.45 + (tubes > 2 ? 0 : Math.sign(i - 0.5) * 0.7);
      parties.push(cylindre([x, y0 + 1.2, z + 1], [x, y0 + 1.2 + long * 0.55, z + 1 + long * 0.82], calibre, METAL, {segments: 10}));
    }
    if (avec_radar) parties.push(cylindre([0, y0 + 1.55, z], [0, y0 + 2.1, z], 0.08, METAL, {segments: 8}), boite([0, y0 + 2.25, z], [1.6, 0.5, 0.2], ANTENNE));
    return parties;
  },
  /** Tourelle à canon rotatif sous dôme, montage naval ou de point. */
  ciws({h = 3, z = 0}, y0) {
    return [cylindre([0, y0, z], [0, y0 + 1.1, z], 1.1, PEINT, {rb: 0.9, segments: 22}), cylindre([0, y0 + 1.1, z], [0, y0 + h * 0.8, z], 0.75, CLAIR, {rb: 0.55, segments: 22}), cylindre([0, y0 + h * 0.8, z], [0, y0 + h, z], 0.55, CLAIR, {rb: 0.1, segments: 22}), ...[-0.14, 0, 0.14].map((x) => cylindre([x, y0 + 0.8, z + 0.6], [x, y0 + 1.2, z + 2.4], 0.05, METAL, {segments: 8}))];
  },
  /** Tourelle de tir laser ou optronique. */
  laser({r = 0.6, z = -1}, y0) {
    return [cylindre([0, y0, z], [0, y0 + 0.9, z], 0.8, METAL, {segments: 18}), boite([0, y0 + 1.3, z], [1.6, 0.9, 1.6], PEINT), cylindre([0, y0 + 1.4, z + 0.7], [0, y0 + 1.75, z + 1.3], r, NOIR, {segments: 22}), cylindre([0, y0 + 1.75, z + 1.3], [0, y0 + 1.76, z + 1.32], r * 0.8, VITRE, {segments: 22})];
  },
  /** Dôme de radôme sur tour. */
  dome({r = 4, h = 8, z = 0}, y0) {
    const pieds = [[-1, 0], [1, 0], [0, 1]].map(([x, dz]) => cylindre([x, y0, z + dz], [x, y0 + h, z + dz], 0.15, METAL, {segments: 8}));
    const tranches = Array.from({length: 10}, (_, i) => {
      const [a, b] = [i, i + 1].map((k) => -Math.PI / 2 + (k * Math.PI) / 10);
      const hauteur = (angle) => y0 + h + r + Math.sin(angle) * r;
      return cylindre([0, hauteur(a), z], [0, hauteur(b), z], Math.max(0.02, Math.cos(a) * r), CLAIR, {rb: Math.max(0.02, Math.cos(b) * r), segments: 24});
    });
    return [...pieds, ...tranches];
  },
  /** Silo vertical : trappes au ras du pont. */
  silos({rangees = 2, colonnes = 4, z = 0}, y0) {
    const parties = [boite([0, y0 + 0.2, z], [colonnes * 0.8 + 0.4, 0.4, rangees * 0.8 + 0.4], PEINT)];
    for (let r = 0; r < rangees; r++) for (let c = 0; c < colonnes; c++) parties.push(boite([(c - (colonnes - 1) / 2) * 0.8, y0 + 0.42, z + (r - (rangees - 1) / 2) * 0.8], [0.68, 0.05, 0.68], SOMBRE_CARGO));
    return parties;
  },
  /** Tube portable sur trépied, opérateur absent. */
  trepied({L: l = 1.6, z = 0}, y0) {
    return [cylindre([0, y0 + 1, z], [0, y0 + 1.4, z + l], 0.05, PEINT, {segments: 10}), ...[[0.4, 0.3], [-0.4, 0.3], [0, -0.5]].map(([x, dz]) => cylindre([0, y0 + 1, z], [x, y0, z + dz], 0.03, METAL, {segments: 6})), boite([0, y0 + 1.1, z + 0.5], [0.2, 0.3, 0.3], NOIR)];
  },
};

/**
 * Rendre un matériel au sol : train roulant et charges.
 *
 * @param {object} params
 * @param {number} params.L longueur (m).
 * @param {string} params.train « 8x8 », « 6x6 », « 4x4 », « chenilles », « remorque », « socle » ou « pont ».
 * @param {[string, object][]} params.charges nom de charge et réglages.
 */
export function sol({L, train: type = "8x8", charges}) {
  const roulant = train(type, L);
  const parties = [...roulant.parties];
  for (const [nom, reglages] of charges) parties.push(...CHARGES[nom](reglages, roulant.y));
  return {parties, reperes: {flanc: {y: roulant.y + 1, z: roulant.zAvant - 0.4}, avant: L / 2, arriere: -L / 2}, pas: 1.2};
}

/** Rendre l'objet décrit par `{forme, ...reglages}` en appelant son archétype. */
export const ARCHETYPES = {chasseur, avion_large, drone_male, aile_volante, drone_delta, multirotor, rodeur, munition, helico, sol};
