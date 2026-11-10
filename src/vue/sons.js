// Sons synthétisés dans le navigateur (MODELE § 30) : aucun fichier, coupés par la touche M.

const ESPACEMENT_MS = 120;
const VOLUME = 0.3;

/** Rendre le compte des sons à jouer pour un lot d'évènements du journal : {impact, eclat, tir, radio}. Pur, testé. */
export function sons_du_lot(lot, avec_radio = false) {
  const compte = {impact: 0, eclat: 0, tir: 0, radio: avec_radio ? 1 : 0};
  for (const e of lot) {
    if (e.type === "impact") compte.impact++;
    if (e.type === "tir") {
      compte.tir++;
      if (e.detruit) compte.eclat++;
    }
  }
  return compte;
}

/** Rendre une source de bruit blanc d'une durée `duree` (s), jouée une fois. */
function bruit(contexte, duree) {
  const tampon = contexte.createBuffer(1, Math.ceil(contexte.sampleRate * duree), contexte.sampleRate);
  const donnees = tampon.getChannelData(0);
  // Bruit audio, hors simulation : il n'a pas à suivre la graine du raid.
  for (let i = 0; i < donnees.length; i++) donnees[i] = Math.random() * 2 - 1;
  const source = contexte.createBufferSource();
  source.buffer = tampon;
  return source;
}

/** Jouer un son court : bruit filtré ou balayage de fréquence, avec son enveloppe. */
function jouer(contexte, sortie, sorte) {
  const t = contexte.currentTime;
  const gain = contexte.createGain();
  gain.connect(sortie);
  const reglages = {
    impact: {duree: 0.7, filtre: ["lowpass", 180], niveau: 0.9},
    eclat: {duree: 0.18, filtre: ["highpass", 900], niveau: 0.35},
    tir: {duree: 0.22, balayage: [900, 280], niveau: 0.12},
    radio: {duree: 0.09, filtre: ["bandpass", 1800], niveau: 0.2, bip: 1250},
  }[sorte];
  gain.gain.setValueAtTime(reglages.niveau, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + reglages.duree);
  if (reglages.balayage) {
    const oscillateur = contexte.createOscillator();
    oscillateur.frequency.setValueAtTime(reglages.balayage[0], t);
    oscillateur.frequency.exponentialRampToValueAtTime(reglages.balayage[1], t + reglages.duree);
    oscillateur.connect(gain);
    oscillateur.start(t);
    oscillateur.stop(t + reglages.duree);
    return;
  }
  const source = bruit(contexte, reglages.duree);
  const filtre = contexte.createBiquadFilter();
  [filtre.type, filtre.frequency.value] = reglages.filtre;
  source.connect(filtre).connect(gain);
  source.start(t);
  if (reglages.bip) {
    const bip = contexte.createOscillator();
    bip.frequency.value = reglages.bip;
    bip.connect(gain);
    bip.start(t + reglages.duree);
    bip.stop(t + reglages.duree + 0.06);
  }
}

/** Rendre la console de sons : {actif(), basculer(), jouer(compte)} ; rien ne sonne avant un geste de l'utilisateur. */
export function creer_sons(actif_initial = true) {
  let actif = actif_initial;
  let contexte = null;
  let sortie = null;
  const derniers = {};
  return {
    actif: () => actif,
    basculer() {
      actif = !actif;
      return actif;
    },
    /** Jouer au plus un son de chaque sorte du compte {impact, eclat, tir, radio}, espacés de 120 ms par sorte. */
    jouer(compte) {
      if (!actif || typeof AudioContext === "undefined") return;
      contexte ??= new AudioContext();
      if (contexte.state === "suspended") contexte.resume().catch(() => {});
      if (!sortie) {
        sortie = contexte.createGain();
        sortie.gain.value = VOLUME;
        sortie.connect(contexte.destination);
      }
      const maintenant = performance.now();
      for (const [sorte, n] of Object.entries(compte)) {
        if (!n || maintenant - (derniers[sorte] ?? -Infinity) < ESPACEMENT_MS) continue;
        derniers[sorte] = maintenant;
        jouer(contexte, sortie, sorte);
      }
    },
  };
}
