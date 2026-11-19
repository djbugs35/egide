// Langue de l'interface dans le navigateur : choix (adresse, mémoire), chargement des dictionnaires de langues/,
// traduction de la page (attributs data-i18n, data-i18n-html, data-i18n-attr) et sélecteur. Changer de langue
// recharge la page : chaque module écrit ensuite ses textes dans la nouvelle langue, sans état à défaire.
import {choisir_langue, installer_langue, langue, LANGUE_PAR_DEFAUT, LANGUES, t} from "../i18n.js";

const CLE = "egide.langue";

function memorisee() {
  try {
    return globalThis.localStorage?.getItem(CLE) ?? null;
  } catch {
    return null;
  }
}

/** Mémoriser la langue choisie ; rendre faux si le navigateur refuse. */
export function memoriser_langue(code) {
  try {
    globalThis.localStorage?.setItem(CLE, code);
    return true;
  } catch {
    return false;
  }
}

/** Choisir la langue, charger son dictionnaire et celui de secours avec `lire_json(chemin)`, l'installer ; rendre son code. */
export async function charger_langue(lire_json) {
  const code = choisir_langue({adresse: location.search, memorisee: memorisee()});
  const secours = await lire_json(`langues/${LANGUE_PAR_DEFAUT}.json`);
  installer_langue(code, code === LANGUE_PAR_DEFAUT ? secours : await lire_json(`langues/${code}.json`), secours);
  return code;
}

/** Traduire les éléments annotés sous `racine` dans la langue installée. */
export function traduire_page(racine = document) {
  if (racine === document) document.documentElement.lang = langue();
  for (const element of racine.querySelectorAll("[data-i18n]")) element.textContent = t(element.dataset.i18n);
  // Contenu à balises de mise en forme (gras, touches) : il vient de nos fichiers de langue, pas de l'utilisateur.
  for (const element of racine.querySelectorAll("[data-i18n-html]")) element.innerHTML = t(element.dataset.i18nHtml);
  for (const element of racine.querySelectorAll("[data-i18n-attr]")) {
    for (const paire of element.dataset.i18nAttr.split(";")) {
      const [attribut, cle] = paire.split(":");
      element.setAttribute(attribut, t(cle));
    }
  }
}

/** Remplir le sélecteur de langue `choix` et recharger la page dans la langue choisie. */
export function brancher_choix_langue(choix) {
  if (!choix) return;
  choix.innerHTML = Object.entries(LANGUES).map(([code, {nom}]) => `<option value="${code}">${nom}</option>`).join("");
  choix.value = langue();
  choix.addEventListener("change", () => {
    memoriser_langue(choix.value);
    const adresse = new URL(location.href);
    adresse.searchParams.delete("lang");
    location.replace(adresse.href);
  });
}
