// Préréglages enregistrés dans ce navigateur et export du scénario affiché en JSON.

const CLE_STOCKAGE = "egide.prereglages";

/** Rendre les préréglages enregistrés ({nom: modifications}) ; vide si le stockage est indisponible. */
export function lire_prereglages() {
  try {
    return JSON.parse(localStorage.getItem(CLE_STOCKAGE) ?? "{}");
  } catch {
    // Navigation privée ou stockage bloqué : l'outil reste utilisable, sans mémoire.
    return {};
  }
}

/** Enregistrer `modifications` sous `nom` ; rend faux si le navigateur refuse d'enregistrer. */
export function enregistrer_prereglage(nom, modifications) {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify({...lire_prereglages(), [nom]: modifications}));
    return true;
  } catch {
    return false;
  }
}

/** Faire télécharger `brut` (scénario complet, avec son bloc _aide) sous le nom `nomFichier`. */
export const exporter_scenario = (brut, nomFichier) => telecharger(new Blob([`${JSON.stringify(brut, null, 2)}\n`], {type: "application/json"}), nomFichier);

/** Télécharger le texte d'un rejeu, compressé en gzip (docs/FORMATS.md § 6). */
export async function exporter_rejeu(texte, nomFichier) {
  const flux = new Blob([texte]).stream().pipeThrough(new CompressionStream("gzip"));
  telecharger(await new Response(flux).blob(), nomFichier);
}

function telecharger(contenu, nomFichier) {
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(contenu);
  lien.download = nomFichier;
  lien.click();
  URL.revokeObjectURL(lien.href);
}
