// Lecture de la ligne de commande commune aux outils qui simulent : options connues, et valeurs du scénario par chemin.

/**
 * Rendre {options, modifications} de `liste` (« --cle valeur »…). Une clé de `defauts` est une option, convertie en nombre
 * si son défaut en est un ; toute autre clé est un chemin du scénario.
 */
export function lire_arguments(liste, defauts) {
  const options = {...defauts};
  const modifications = {};
  for (let i = 0; i < liste.length; i += 2) {
    const cle = liste[i].replace(/^--/, "");
    const valeur = liste[i + 1];
    if (cle in options) options[cle] = typeof defauts[cle] === "number" ? Number(valeur) : valeur;
    else modifications[cle] = Number.isNaN(Number(valeur)) ? valeur : Number(valeur);
  }
  return {options, modifications};
}
