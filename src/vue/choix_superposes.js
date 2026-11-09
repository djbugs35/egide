// Petite liste ouverte au curseur quand un clic tombe sur des unités superposées (MODELE § 12). DOM seul : quelles unités
// proposer se décide dans edition.js, ce qu'on fait du choix dans editeur.js.

/** Rendre la liste de choix rattachée au conteneur `vue` : {ouvrir, fermer, est_ouvert}. */
export function creer_choix_superposes(vue) {
  let racine = null;

  /** Fermer la liste ; rendre vrai si elle était ouverte. */
  function fermer() {
    if (!racine) return false;
    racine.remove();
    racine = null;
    return true;
  }

  /**
   * Ouvrir la liste au point `p` ({x, y} en px dans `vue`).
   *
   * @param {{x: number, y: number}} p point d'ouverture.
   * @param {{libelle: string, valeur: *}[]} options lignes proposées, dans l'ordre.
   * @param {function(*): void} au_choix appelée avec la `valeur` de la ligne cliquée.
   */
  function ouvrir(p, options, au_choix) {
    fermer();
    racine = document.createElement("div");
    racine.className = "choix-superposes";
    racine.setAttribute("role", "group");
    racine.setAttribute("aria-label", "Unités superposées à cet endroit");
    // Sans cela, l'écouteur global de la barre d'espace annulerait l'activation du bouton au clavier.
    racine.addEventListener("keydown", (e) => (e.key === " " || e.key === "Enter") && e.stopPropagation());
    for (const {libelle, valeur} of options) {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.textContent = libelle;
      bouton.addEventListener("click", () => {
        fermer();
        au_choix(valeur);
      });
      racine.append(bouton);
    }
    vue.append(racine);
    const [largeur, hauteur] = [racine.offsetWidth, racine.offsetHeight];
    racine.style.left = `${Math.max(0, Math.min(p.x, vue.clientWidth - largeur))}px`;
    racine.style.top = `${Math.max(0, Math.min(p.y, vue.clientHeight - hauteur))}px`;
    racine.querySelector("button").focus();
  }

  return {ouvrir, fermer, est_ouvert: () => racine !== null};
}
