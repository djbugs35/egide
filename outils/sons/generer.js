// Banque de bruitages (MODELE § 30) : synthèse hors ligne, à graine, de sons de défense aérienne, écrits en WAV 16 bits
// dans sons/. Rien n'est enregistré ni emprunté : chaque son est calculé ici. Lancer : node outils/sons/generer.js
import {mkdir, rename, writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {creer_hasard} from "../../src/moteur/hasard.js";

export const FREQUENCE = 44_100;
const DOSSIER = new URL("../../sons/", import.meta.url);
const CRETE = 0.89;

const echantillons = (duree) => new Float32Array(Math.round(FREQUENCE * duree));
const temps = (i) => i / FREQUENCE;

/** Rendre un bruit blanc de `duree` s, tiré à `hasard`. */
function bruit(hasard, duree) {
  const sortie = echantillons(duree);
  for (let i = 0; i < sortie.length; i++) sortie[i] = hasard.uniforme(-1, 1);
  return sortie;
}

/**
 * Filtrer `signal` par un biquad (formules de R. Bristow-Johnson) dont la fréquence de coupure suit `coupure(t)` (Hz),
 * recalculé tous les 32 échantillons : assez pour un balayage sans artefact audible.
 */
function filtrer(signal, type, coupure, q = 0.707) {
  const sortie = new Float32Array(signal.length);
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  let c = null;
  for (let i = 0; i < signal.length; i++) {
    if (i % 32 === 0) {
      const w = (2 * Math.PI * Math.min(coupure(temps(i)), FREQUENCE * 0.45)) / FREQUENCE;
      const alpha = Math.sin(w) / (2 * q);
      const cos = Math.cos(w);
      const b = {
        passe_bas: [(1 - cos) / 2, 1 - cos, (1 - cos) / 2],
        passe_haut: [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2],
        passe_bande: [alpha, 0, -alpha],
      }[type];
      const a0 = 1 + alpha;
      c = [b[0] / a0, b[1] / a0, b[2] / a0, (-2 * cos) / a0, (1 - alpha) / a0];
    }
    const y = c[0] * signal[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    [x2, x1, y2, y1] = [x1, signal[i], y1, y];
    sortie[i] = y;
  }
  return sortie;
}

/** Appliquer une enveloppe : montée linéaire de `attaque` s, puis décroissance exponentielle de constante `tau` s. */
function enveloppe(signal, attaque, tau, debut = 0) {
  return signal.map((v, i) => {
    const t = temps(i) - debut;
    if (t < 0) return 0;
    return v * (t < attaque ? t / attaque : Math.exp(-(t - attaque) / tau));
  });
}

/** Rendre la somme de `couches` [signal, gain], à la longueur de la plus longue. */
function mixer(...couches) {
  const sortie = echantillons(Math.max(...couches.map(([s]) => s.length)) / FREQUENCE);
  for (const [signal, gain] of couches) for (let i = 0; i < signal.length; i++) sortie[i] += signal[i] * gain;
  return sortie;
}

/** Rendre une sinusoïde dont la fréquence suit `frequence(t)` (Hz), phase intégrée pour un glissement sans clic. */
function glissando(duree, frequence) {
  const sortie = echantillons(duree);
  let phase = 0;
  for (let i = 0; i < sortie.length; i++) {
    phase += (2 * Math.PI * frequence(temps(i))) / FREQUENCE;
    sortie[i] = Math.sin(phase);
  }
  return sortie;
}

const saturer = (signal, k) => signal.map((v) => Math.tanh(v * k) / Math.tanh(k));

/**
 * Rendre `signal` réverbéré : quatre filtres en peigne parallèles puis deux passe-tout (réverbération de Schroeder),
 * mêlés au son direct dans la proportion `humide`. `taille` allonge les retards : 1 pour une grande salle, plus pour un
 * paysage ouvert où l'écho des reliefs revient tard.
 */
function reverberer(signal, humide, taille = 1, queue = 1.5) {
  const longueur = signal.length + Math.round(queue * FREQUENCE);
  const entree = new Float32Array(longueur);
  entree.set(signal);
  const peigne = (retard, retour) => {
    const sortie = new Float32Array(longueur);
    for (let i = 0; i < longueur; i++) sortie[i] = entree[i] + (i >= retard ? retour * sortie[i - retard] : 0);
    return sortie;
  };
  const retards = [1557, 1617, 1491, 1422].map((r) => Math.round(r * taille));
  let somme = new Float32Array(longueur);
  for (const r of retards) {
    const p = peigne(r, 0.84);
    for (let i = 0; i < longueur; i++) somme[i] += p[i] / 4;
  }
  for (const r of [225, 556]) {
    const sortie = new Float32Array(longueur);
    for (let i = 0; i < longueur; i++) sortie[i] = -0.5 * somme[i] + (i >= r ? somme[i - r] + 0.5 * sortie[i - r] : 0);
    somme = sortie;
  }
  return entree.map((v, i) => (1 - humide) * v + humide * somme[i]);
}

/** Rendre des éclats de débris : impulsions brèves, de plus en plus rares, filtrées vers l'aigu. */
function debris(hasard, duree, densite) {
  const sortie = echantillons(duree);
  let t = 0.02;
  while (t < duree) {
    const debut = Math.round(t * FREQUENCE);
    const longueur = Math.round(hasard.uniforme(0.002, 0.008) * FREQUENCE);
    const force = hasard.uniforme(0.3, 1) * Math.exp(-t / (duree / 2));
    for (let i = 0; i < longueur && debut + i < sortie.length; i++) sortie[debut + i] += hasard.uniforme(-1, 1) * force * (1 - i / longueur);
    t += hasard.uniforme(0.5, 1.5) / (densite * Math.exp(-t / (duree / 3)));
  }
  return filtrer(sortie, "passe_haut", () => 1500);
}

/** Explosion au sol, proche : coup grave, souffle qui s'assourdit, débris, écho du paysage. */
function explosion(hasard) {
  const sous = enveloppe(glissando(1.2, (t) => 32 + 45 * Math.exp(-t / 0.12)), 0.004, 0.35);
  const souffle = enveloppe(filtrer(bruit(hasard, 2.2), "passe_bas", (t) => 250 + 4200 * Math.exp(-t / 0.18)), 0.006, 0.5);
  const grave = enveloppe(filtrer(bruit(hasard, 2.2), "passe_bas", () => 120), 0.01, 0.8);
  const son = saturer(mixer([sous, 1.1], [souffle, 0.9], [grave, 1.4], [debris(hasard, 1.6, 45), 0.35]), 2.2);
  return reverberer(son, 0.32, 2.2, 2.2);
}

/** Interception en vol, plus loin : claquement sec, souffle bref, roulement d'écho. */
function interception(hasard) {
  const claque = enveloppe(filtrer(bruit(hasard, 0.2), "passe_haut", () => 1800), 0.0015, 0.018);
  const souffle = enveloppe(filtrer(bruit(hasard, 1.2), "passe_bas", (t) => 500 + 3500 * Math.exp(-t / 0.08)), 0.003, 0.22);
  const sous = enveloppe(glissando(0.6, (t) => 45 + 50 * Math.exp(-t / 0.06)), 0.003, 0.16);
  const son = saturer(mixer([claque, 0.9], [souffle, 0.8], [sous, 0.7], [debris(hasard, 0.8, 30), 0.2]), 1.8);
  return reverberer(son, 0.38, 2.6, 1.8);
}

/** Départ de missile : allumage sourd puis rugissement du moteur qui s'éloigne, avec son battement irrégulier. */
function depart_missile(hasard, duree = 2.2, aigu = 1) {
  const allumage = enveloppe(filtrer(bruit(hasard, 0.4), "passe_bas", () => 700), 0.003, 0.05);
  const flutter = filtrer(bruit(hasard, duree), "passe_bas", () => 18).map((v) => 1 + 2.5 * v);
  const moteur = filtrer(bruit(hasard, duree), "passe_bande", (t) => aigu * (500 + 700 * Math.exp(-t / 0.5)), 0.8).map((v, i) => v * flutter[i]);
  const monte = moteur.map((v, i) => {
    const t = temps(i);
    return v * Math.min(1, t / (0.12 * duree)) * Math.exp(-Math.max(0, t - 0.25 * duree) / (0.3 * duree));
  });
  const grondement = enveloppe(filtrer(bruit(hasard, duree), "passe_bas", () => 160), 0.05, 0.45 * duree);
  const son = saturer(mixer([allumage, 0.9], [monte, 2.6], [grondement, 0.9]), 1.6);
  return reverberer(son, 0.25, 2.0, 1.4);
}

/** Squelch de radio : déclic d'ouverture, souffle bande étroite, déclic de fermeture. */
function radio(hasard) {
  const souffle = enveloppe(filtrer(bruit(hasard, 0.22), "passe_bande", () => 1400, 1.1), 0.004, 0.06);
  const declic = (debut) => enveloppe(filtrer(bruit(hasard, 0.03), "passe_haut", () => 2500), 0.0005, 0.003, debut);
  return mixer([souffle, 0.7], [declic(0), 0.6], [declic(0.16), 0.4]);
}

/** Alerte de console : deux tons doux alternés, aux harmoniques impaires d'un signal carré adouci. */
function alerte() {
  const ton = (f, debut) => enveloppe(mixer([glissando(0.6, () => f), 1], [glissando(0.6, () => 3 * f), 0.25], [glissando(0.6, () => 5 * f), 0.08]), 0.01, 0.09, debut);
  return reverberer(mixer([ton(660, 0), 0.5], [ton(880, 0.16), 0.5], [ton(660, 0.32), 0.5], [ton(880, 0.48), 0.5]), 0.15, 1, 0.6);
}

/** Ramener la crête du son à CRETE, et adoucir sa fin pour qu'il ne claque pas en s'arrêtant. */
function finir(signal) {
  const crete = signal.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const fondu = Math.round(0.05 * FREQUENCE);
  return signal.map((v, i) => (v / crete) * CRETE * Math.min(1, (signal.length - i) / fondu));
}

/** Rendre le fichier WAV (PCM 16 bits, mono) d'un signal dans [-1, 1]. */
export function encoder_wav(signal) {
  const octets = new Uint8Array(44 + signal.length * 2);
  const vue = new DataView(octets.buffer);
  const texte = (decalage, chaine) => [...chaine].forEach((c, i) => vue.setUint8(decalage + i, c.charCodeAt(0)));
  texte(0, "RIFF");
  vue.setUint32(4, 36 + signal.length * 2, true);
  texte(8, "WAVEfmt ");
  [[16, 16, 4], [20, 1, 2], [22, 1, 2], [24, FREQUENCE, 4], [28, FREQUENCE * 2, 4], [32, 2, 2], [34, 16, 2]].forEach(([d, v, n]) => (n === 4 ? vue.setUint32(d, v, true) : vue.setUint16(d, v, true)));
  texte(36, "data");
  vue.setUint32(40, signal.length * 2, true);
  signal.forEach((v, i) => vue.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true));
  return octets;
}

// Sorte de son, nombre de variantes et fabrique : plusieurs variantes évitent l'effet mitraillette d'un son répété.
export const BANQUE = {
  explosion: [3, (h) => explosion(h)],
  interception: [3, (h) => interception(h)],
  lancement: [2, (h) => depart_missile(h)],
  roquette: [2, (h) => depart_missile(h, 0.9, 1.7)],
  radio: [2, (h) => radio(h)],
  alerte: [1, () => alerte()],
};

/** Rendre les signaux finis de la banque, {sorte: [signal…]}, calculés à graine fixe : la banque se recalcule à l'identique. */
export function calculer_banque() {
  return Object.fromEntries(Object.entries(BANQUE).map(([sorte, [n, fabrique]], rang) =>
    [sorte, Array.from({length: n}, (_, v) => finir(fabrique(creer_hasard(1000 * (rang + 1) + v))))]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir(DOSSIER, {recursive: true});
  const index = {};
  for (const [sorte, signaux] of Object.entries(calculer_banque())) {
    index[sorte] = [];
    for (const [v, signal] of signaux.entries()) {
      const nom = `${sorte}_${v + 1}.wav`;
      await writeFile(new URL(`${nom}.tmp`, DOSSIER), encoder_wav(signal));
      await rename(new URL(`${nom}.tmp`, DOSSIER), new URL(nom, DOSSIER));
      index[sorte].push(nom);
    }
  }
  await writeFile(new URL("index.json.tmp", DOSSIER), `${JSON.stringify(index, null, 2)}\n`);
  await rename(new URL("index.json.tmp", DOSSIER), new URL("index.json", DOSSIER));
  console.log(Object.entries(index).map(([s, l]) => `${s} ×${l.length}`).join(", "));
}
