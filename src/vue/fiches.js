// Fiches du catalogue (jalon 4) : chaque unité et chaque algorithme expliqués — fidélité, équations, hypothèses,
// domaine de validité, sources, lignée, paramètres et code. Rendu en HTML par des fonctions pures, testées.
import {origine_des_cles, unite_brute} from "../moteur/catalogue.js";
import {chemin_algo} from "../moteur/algos.js";
import {chemin_unite} from "../moteur/catalogue.js";
import {libelle_unite} from "../moteur/unites.js";
import {t} from "../i18n.js";
import {aide_unite, nom_algo, nom_unite, sources_unite} from "../catalogue_langue.js";

const META_UNITE = ["nom", "fidelite", "sources", "herite_de", "algos"];
export const LIBELLES_FIDELITE = {
  notionnel: "vue.fidelite.notionnel",
  cinematique: "vue.fidelite.cinematique",
  point_masse: "vue.fidelite.point_masse",
  "6ddl": "vue.fidelite.6ddl",
};

/** Rendre un texte sûr pour l'insérer en HTML (les fichiers privés ne sont pas sous notre contrôle). */
export const echapper = (texte) => String(texte).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);

const lien_unite = (id, nom) => `<a href="#unite/${encodeURIComponent(id)}">${echapper(nom_unite(id, nom))}</a>`;
const lien_algo = (id, nom) => `<a href="#algo/${encodeURIComponent(id)}">${echapper(nom_algo(id, nom))}</a>`;
/** Rendre le libellé traduit d'un niveau de fidélité. */
export const libelle_fidelite = (niveau) => (LIBELLES_FIDELITE[niveau] ? t(LIBELLES_FIDELITE[niveau]) : "");
const badge = (classe, texte, titre = "") => `<span class="badge ${classe}" title="${echapper(titre)}">${echapper(texte)}</span>`;
const liste = (elements) => (elements.length ? `<ul>${elements.map((e) => `<li>${e}</li>`).join("")}</ul>` : "<p class=\"vide\">—</p>");

/**
 * Rendre, pour chaque algorithme, ce qui l'utilise : unités (par rôle) et réglages du scénario de référence.
 * `unites` : {id: unité fusionnée} ; `scenario` : scénario v2 brut.
 */
export function utilisations(unites, scenario) {
  const usages = {};
  const noter = (idAlgo, texte) => (usages[idAlgo] ??= []).push(texte);
  for (const [id, unite] of Object.entries(unites)) {
    for (const [role, idAlgo] of Object.entries(unite.algos ?? {})) noter(idAlgo, {unite: id, role});
  }
  const {conduite} = scenario.bleu;
  noter(conduite.pistage, {reglage: "bleu.conduite.pistage"});
  noter(conduite.allocation, {reglage: "bleu.conduite.allocation"});
  return usages;
}

/** Rendre le HTML de la fiche de l'unité `id` (fichiers bruts du catalogue, index des algorithmes {id: meta}). */
export function fiche_unite(id, fichiers, metas) {
  const unite = unite_brute(id, fichiers);
  const origines = origine_des_cles(id, fichiers);
  const parametres = Object.keys(unite).filter((cle) => !cle.startsWith("_") && !META_UNITE.includes(cle) && cle !== "id");
  const lignes = parametres.map((cle) => {
    const valeur = unite[cle];
    const affichee = cle === "emport" ? lien_unite(valeur, fichiers[valeur]?.nom) : `${echapper(valeur)}${libelle_unite(cle) ? ` ${libelle_unite(cle)}` : ""}`;
    const origine = origines[cle] === id ? t("vue.fichecat.elle_meme") : lien_unite(origines[cle], fichiers[origines[cle]]?.nom);
    return `<tr><th scope="row"><code>${echapper(cle)}</code></th><td>${affichee}</td><td>${echapper(aide_unite(unite._lignee, fichiers, cle, unite._aide[cle] ?? ""))}</td><td>${origine}</td></tr>`;
  });
  const algos = Object.entries(unite.algos ?? {}).map(([role, idAlgo]) => `<tr><th scope="row">${echapper(role)}</th><td>${lien_algo(idAlgo, metas[idAlgo]?.nom)}</td></tr>`);
  const nom = nom_unite(id, unite.nom);
  return `<header><h2>${echapper(nom)}</h2>
    ${badge(`fidelite-${unite.fidelite}`, unite.fidelite, libelle_fidelite(unite.fidelite))}
    <p class="chemin">${t("vue.fichecat.fichier")} <a href="${echapper(chemin_unite(id))}"><code>${echapper(chemin_unite(id))}</code></a></p></header>
    <section><h3>${t("vue.fichecat.lignee")}</h3><p class="lignee">${unite._lignee.map((a) => (a === id ? `<b>${echapper(nom)}</b>` : lien_unite(a, fichiers[a]?.nom))).join(" → ")}</p></section>
    <section><h3>${t("vue.fichecat.sources")}</h3>${liste(sources_unite(id, unite.sources).map(echapper))}</section>
    <section><h3>${t("vue.fichecat.parametres")}</h3><table><thead><tr><th>${t("vue.fichecat.cle")}</th><th>${t("vue.fichecat.valeur")}</th><th>${t("vue.fichecat.signification")}</th><th>${t("vue.fichecat.fixe_par")}</th></tr></thead><tbody>${lignes.join("")}</tbody></table></section>
    <section><h3>${t("vue.fichecat.algorithmes")}</h3>${algos.length ? `<table><tbody>${algos.join("")}</tbody></table>` : `<p class="vide">${t("vue.fichecat.aucun_algo")}</p>`}</section>`;
}

/** Rendre le HTML de la fiche de l'algorithme `id`, de fiche `meta`, avec ses `usages` (voir utilisations). */
export function fiche_algo(id, meta, usages = [], fichiers = {}) {
  const parametres = Object.entries(meta.parametres).map(([cle, p]) => `<tr><th scope="row"><code>${echapper(cle)}</code></th><td>${echapper(p.unite || "—")}</td><td>${echapper(p.aide)}</td></tr>`);
  const usage = usages.map((u) => (u.unite ? t("vue.fichecat.usage_unite", {unite: lien_unite(u.unite, fichiers[u.unite]?.nom), role: echapper(u.role)}) : t("vue.fichecat.usage_scenario", {reglage: echapper(u.reglage)})));
  return `<header><h2>${echapper(meta.nom)}</h2>
    ${badge("role", meta.role)} ${badge(`fidelite-${meta.fidelite}`, meta.fidelite, libelle_fidelite(meta.fidelite))}
    <p class="chemin">${t("vue.fichecat.code")} <a href="${echapper(chemin_algo(id))}"><code>${echapper(chemin_algo(id))}</code></a></p></header>
    <section><p class="description">${echapper(meta.description)}</p></section>
    <section><h3>${t("vue.fichecat.equations")}</h3>${meta.equations.length ? `<div class="equations">${meta.equations.map((e) => `<p>${echapper(e)}</p>`).join("")}</div>` : `<p class="vide">${t("vue.fichecat.aucune_equation")}</p>`}</section>
    <section><h3>${t("vue.fichecat.hypotheses")}</h3>${liste(meta.hypotheses.map(echapper))}</section>
    <section><h3>${t("vue.fichecat.domaine")}</h3><p>${echapper(meta.domaine_validite)}</p></section>
    <section><h3>${t("vue.fichecat.parametres_lus")}</h3>${parametres.length ? `<table><thead><tr><th>${t("vue.fichecat.cle")}</th><th>${t("vue.fichecat.unite")}</th><th>${t("vue.fichecat.signification")}</th></tr></thead><tbody>${parametres.join("")}</tbody></table>` : `<p class="vide">${t("vue.fichecat.aucun")}</p>`}</section>
    <section><h3>${t("vue.fichecat.references")}</h3>${liste(meta.references.map(echapper))}</section>
    <section><h3>${t("vue.fichecat.utilise_par")}</h3>${liste(usage)}</section>`;
}
