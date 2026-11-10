// Bruitages du raid (MODELE § 30) : échantillons de sons/ (calculés par outils/sons/generer.js), joués avec de légères
// variations de hauteur et de volume, derrière un compresseur. Coupés par défaut ; bouton Son ou touche M.

// Volume relatif et écart minimal (ms) entre deux sons d'une même sorte : un essaim tire des centaines de coups, sans
// cet écart le mélange deviendrait un grondement continu.
const SORTES = {
  explosion: {volume: 0.9, ecart: 250},
  interception: {volume: 0.55, ecart: 150},
  lancement: {volume: 0.45, ecart: 220},
  roquette: {volume: 0.35, ecart: 160},
  radio: {volume: 0.5, ecart: 600},
  alerte: {volume: 0.55, ecart: 2000},
};
const VOIX_MAX = 10;
const VOLUME_GENERAL = 0.7;

/** Rendre le compte des sons à jouer pour un lot d'évènements du journal. Pur, testé. */
export function sons_du_lot(lot, avec_radio = false) {
  const compte = Object.fromEntries(Object.keys(SORTES).map((s) => [s, 0]));
  compte.radio = avec_radio ? 1 : 0;
  for (const e of lot) {
    if (e.type === "impact") compte.explosion++;
    if (e.type === "incident" && e.debut) compte.alerte++;
    if (e.type === "tir") {
      compte[e.couche === "sol" ? "lancement" : "roquette"]++;
      if (e.detruit) compte.interception++;
    }
  }
  return compte;
}

/** Charger et décoder la banque de sons, {sorte: [AudioBuffer…]} ; une sorte illisible reste muette. */
async function charger_banque(contexte) {
  const racine = new URL("../../sons/", import.meta.url);
  const index = await (await fetch(new URL("index.json", racine))).json();
  const banque = {};
  for (const [sorte, fichiers] of Object.entries(index)) {
    const tampons = await Promise.all(fichiers.map(async (f) => contexte.decodeAudioData(await (await fetch(new URL(f, racine))).arrayBuffer()).catch(() => null)));
    banque[sorte] = tampons.filter(Boolean);
  }
  return banque;
}

/** Rendre la console de sons : {actif(), basculer(), jouer(compte)} ; rien ne sonne avant un geste de l'utilisateur. */
export function creer_sons(actif_initial = false) {
  let actif = actif_initial;
  let contexte = null;
  let entree = null;
  let banque = null;
  let voix = 0;
  const derniers = {};

  function preparer() {
    if (contexte || typeof AudioContext === "undefined") return;
    contexte = new AudioContext();
    // Le compresseur tient le mélange quand une salve d'explosions tombe en même temps.
    entree = contexte.createDynamicsCompressor();
    entree.threshold.value = -18;
    entree.ratio.value = 6;
    const general = contexte.createGain();
    general.gain.value = VOLUME_GENERAL;
    entree.connect(general).connect(contexte.destination);
    charger_banque(contexte).then((b) => (banque = b)).catch(() => (banque = {}));
  }

  function jouer_une(sorte) {
    const variantes = banque?.[sorte];
    if (!variantes?.length || voix >= VOIX_MAX) return;
    const source = contexte.createBufferSource();
    // Variante, hauteur et volume tirés sans graine : purement sonore, cela n'a pas à suivre le raid.
    source.buffer = variantes[Math.floor(Math.random() * variantes.length)];
    source.playbackRate.value = 0.9 + 0.2 * Math.random();
    const gain = contexte.createGain();
    gain.gain.value = SORTES[sorte].volume * (0.8 + 0.4 * Math.random());
    source.connect(gain).connect(entree);
    voix++;
    source.onended = () => voix--;
    source.start();
  }

  return {
    actif: () => actif,
    basculer() {
      actif = !actif;
      if (actif) {
        preparer();
        contexte?.resume().catch(() => {});
      }
      return actif;
    },
    /** Jouer au plus un son de chaque sorte du compte, en respectant l'écart minimal de chaque sorte. */
    jouer(compte) {
      if (!actif) return;
      preparer();
      if (!contexte) return;
      if (contexte.state === "suspended") contexte.resume().catch(() => {});
      const maintenant = performance.now();
      for (const [sorte, n] of Object.entries(compte)) {
        if (!n || !SORTES[sorte] || maintenant - (derniers[sorte] ?? -Infinity) < SORTES[sorte].ecart) continue;
        derniers[sorte] = maintenant;
        jouer_une(sorte);
      }
    },
  };
}
