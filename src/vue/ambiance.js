// Mise en scène des dégâts (MODELE § 30) : niveau de dégâts d'une cible et panache de fumée animé. Pur, testé.

export const LIBELLES_DEGATS = ["intacte", "touchée", "endommagée", "en flammes"];
const SEUILS = [0.2, 0.6];
// Une bouffée met 3 s à monter et se dissiper ; décalées entre elles, elles font une colonne continue.
const PERIODE_MS = 3000;
const HAUTEUR_PAR_NIVEAU_M = 450;
const DERIVE_M = 180;

/** Rendre le niveau de dégâts (0 à 3) d'une cible frappée `frappes` fois, `reference` étant la concentration maximale. */
export function niveau_degats(frappes, reference) {
  if (frappes <= 0) return 0;
  if (frappes >= SEUILS[1] * reference) return 3;
  return frappes >= SEUILS[0] * reference ? 2 : 1;
}

/**
 * Rendre les bouffées du panache d'une cible à l'instant `maintenant` (ms) : position relative en mètres (est, haut),
 * rayon (m), opacité et couleur. `graine` décale le panache d'une cible à l'autre, pour qu'ils ne battent pas ensemble.
 */
export function panache(niveau, graine, maintenant) {
  if (niveau === 0) return [];
  const nombre = 2 + 3 * niveau;
  return Array.from({length: nombre}, (_, i) => {
    const phase = (((maintenant + graine * 397) / PERIODE_MS + i / nombre) % 1 + 1) % 1;
    const flamme = niveau === 3 && phase < 0.18;
    return {
      est: phase * DERIVE_M * niveau,
      haut: phase * HAUTEUR_PAR_NIVEAU_M * niveau,
      rayon: 40 + 160 * phase * niveau,
      opacite: (1 - phase) * (flamme ? 0.95 : 0.65),
      // Vue de dessus sur une image satellite, une fumée claire se détache mieux qu'une fumée noire.
      couleur: flamme ? "#ff8a3d" : niveau === 1 ? "#e4e2dc" : "#b9b5ae",
    };
  });
}
