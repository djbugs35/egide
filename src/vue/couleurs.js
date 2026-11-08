// Couleurs de l'interface, seule source : le canevas les lit ici, la feuille de style les reçoit en variables CSS.
// La couleur suit l'entité partout (scope, tableau de bord, courbes) : ami = avions, hostile = drones, sol = postes.
// Les trois couleurs de série passent le validateur de palette (daltonisme, contraste ≥ 3:1) sur `fond`.
export const COULEURS = {
  fond: "#18222d",
  panneau: "#1e2a37",
  trait: "#2e3d4d",
  grille: "#253240",
  texte: "#e3eaf1",
  texte_secondaire: "#93a4b5",
  ami: "#4a98e8",
  hostile: "#e5574b",
  sol: "#b8860b",
  inconnu: "#7d8b99",
  eclat: "#fff1cc",
  // Sélection de l'éditeur : hors palette de séries, pour ne jamais se confondre avec une entité.
  selection: "#f2f2f2",
  // Enveloppes des objets (MODELE § 25) : la détection garde la couleur « ami » des radars.
  conduite: "#e8c547",
  interception: "#57c785",
  resultante: "#b48ee8",
  instrumentee: "#9aa6b2",
  menaces: ["#5ab4e8", "#e87a5a", "#e85ab4", "#c8e85a", "#5ae8c8"],
};

/** Publier les couleurs en variables CSS (--fond, --ami…) sur l'élément racine. */
export function publier_couleurs(racine) {
  for (const [nom, valeur] of Object.entries(COULEURS)) racine.style.setProperty(`--${nom.replace("_", "-")}`, valeur);
}
