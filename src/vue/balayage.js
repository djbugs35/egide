// Panneau de balayage : une clé, une liste de valeurs, N raids par valeur, courbes et tableau des résultats.
import {format_decimal, format_intervalle} from "./format.js";
import {SERIES, dessiner_courbes, texte_infobulle} from "./graphique.js";
import {REGLAGES, unite_reglage} from "./reglages.js";
import {t} from "../i18n.js";

// Réglages proposés au balayage, avec des valeurs de départ qui couvrent leur plage utile.
const PROPOSITIONS = {
  avions_laser: "0, 10, 20, 30, 50, 75, 100",
  avions_ir: "0, 10, 20, 35, 50",
  vitesse_mise_a_poste: "350, 400, 450, 500, 550, 600, 650",
  altitude_avions: "300, 1000, 2000, 3000, 5000",
  postes: "0, 50, 100, 200, 300, 400",
  concentration: "50, 100, 200, 300, 500, 1000",
  eclatement: "0, 30, 60, 90, 120",
  vitesse_drones: "200, 400, 600, 800, 1000",
};

const reglage_de = (id) => REGLAGES.find((r) => r.id === id);

function libelle_reglage(id) {
  const reglage = reglage_de(id);
  return `${t(reglage.libelle)}${unite_reglage(reglage) ? ` (${unite_reglage(reglage)})` : ""}`;
}

function tableau_resultats(points, id) {
  const entete = `<tr><th>${libelle_reglage(id)}</th>${SERIES.map((s) => `<th>${t(s.libelle)}</th>`).join("")}</tr>`;
  const lignes = points.map((p) => `<tr><td>${format_decimal(p.valeur)}</td>${SERIES.map((s) => `<td>${format_intervalle(p.resume[s.cle])}</td>`).join("")}</tr>`);
  return `<table>${entete}${lignes.join("")}</table>`;
}

/**
 * Brancher le panneau `racine` : `courant()` rend {brut, fichiers} du scénario affiché, `infobulle` l'élément de survol.
 */
export function brancher_balayage(racine, courant, infobulle) {
  const choix = racine.querySelector("[name='cle_balayee']");
  const valeurs = racine.querySelector("[name='valeurs']");
  const tirages = racine.querySelector("[name='tirages']");
  const bouton = racine.querySelector("[data-action='balayer']");
  const etat = racine.querySelector("[data-champ='progression']");
  const courbes = racine.querySelector("[data-zone='courbes']");
  const table = racine.querySelector("[data-zone='table']");
  choix.innerHTML = Object.keys(PROPOSITIONS).map((id) => `<option value="${id}">${libelle_reglage(id)}</option>`).join("");
  valeurs.value = PROPOSITIONS[choix.value];
  choix.addEventListener("change", () => (valeurs.value = PROPOSITIONS[choix.value]));
  let travailleur = null;
  bouton.addEventListener("click", () => {
    travailleur?.terminate();
    const id = choix.value;
    const liste = valeurs.value.split(/[;,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const points = [];
    const survol = (point, x, y) => montrer(infobulle, point && texte_infobulle(point, libelle_reglage(id)), x, y);
    travailleur = new Worker(new URL("./balayage_travailleur.js", import.meta.url), {type: "module"});
    travailleur.addEventListener("message", ({data}) => {
      if (data.type === "fin") {
        etat.textContent = t("vue.balayage.termine", {n: liste.length, tirages: tirages.value});
        return;
      }
      points.push(data);
      points.sort((a, b) => a.valeur - b.valeur);
      etat.textContent = t("vue.balayage.avancement", {n: points.length, total: liste.length});
      dessiner_courbes(courbes, points, libelle_reglage(id), survol);
      table.innerHTML = tableau_resultats(points, id);
    });
    etat.textContent = t("vue.balayage.avancement", {n: 0, total: liste.length});
    const {brut, fichiers} = courant();
    travailleur.postMessage({brut, fichiers, chemins: reglage_de(id).chemins, valeurs: liste, tirages: Number(tirages.value)});
  });
}

/** Afficher `texte` dans l'infobulle près de (x, y), ou la cacher si `texte` est vide. */
export function montrer(infobulle, texte, x, y) {
  infobulle.hidden = !texte;
  if (!texte) return;
  infobulle.textContent = texte;
  const marge = 14;
  const {innerWidth: largeur, innerHeight: hauteur} = window;
  infobulle.style.left = `${Math.min(x + marge, largeur - infobulle.offsetWidth - 8)}px`;
  infobulle.style.top = `${Math.min(y + marge, hauteur - infobulle.offsetHeight - 8)}px`;
}
