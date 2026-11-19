// Affichage du débriefing de fin de raid (MODELE § 28) dans son tiroir : chaque barre porte son nombre.
import {CAUSES} from "./debriefing.js";
import {format_entier} from "./format.js";
import {t} from "../i18n.js";

const echapper = (texte) => String(texte).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
const pourcent = (x) => t("vue.commun.pourcent", {p: Math.round(100 * x)});
const minutes = (s) => t("vue.commun.minutes", {n: Math.floor(s / 60)});

/** Rendre une ligne « libellé, barre, valeur », la barre rapportée à `maximum`. */
function barre(libelle, valeur, maximum, titre = "") {
  const largeur = maximum ? (100 * valeur) / maximum : 0;
  return `<li title="${echapper(titre)}"><span>${echapper(libelle)}</span><span class="barre"><i style="inline-size:${largeur}%"></i></span><b>${format_entier(valeur)}</b></li>`;
}

function bloc_note(d) {
  return `<div class="debrief-note note-${d.note}" title="${echapper(t("vue.debrief.bareme", {p: pourcent(d.taux)}))}">
    <strong>${d.note}</strong>
    <dl><div><dt>${t("vue.debrief.menaces")}</dt><dd>${format_entier(d.menaces)}</dd></div><div><dt>${t("vue.debrief.interceptees")}</dt><dd>${format_entier(d.interceptees)} (${pourcent(d.taux)})</dd></div>
    <div><dt>${t("vue.debrief.frappes")}</dt><dd>${format_entier(d.frappes)}</dd></div><div><dt>${t("vue.debrief.duree")}</dt><dd>${minutes(d.duree)}</dd></div></dl></div>`;
}

function bloc_causes(d) {
  if (!d.frappes) return `<p class="note">${t("vue.debrief.aucune_frappe")}</p>`;
  return `<ol class="debrief-barres">${Object.entries(CAUSES).map(([cle, libelle]) => barre(t(libelle), d.causes[cle], d.frappes)).join("")}</ol>`;
}

function bloc_cibles(d) {
  const touchees = d.cibles.filter((c) => c.frappes > 0).sort((a, b) => b.frappes - a.frappes);
  if (!touchees.length) return "";
  const maximum = touchees[0].frappes;
  return `<h3>${t("vue.debrief.par_cible")}</h3><ol class="debrief-barres">${touchees.map((c) => barre(c.nom, c.frappes, maximum, t("vue.debrief.cause_dominante", {cause: t(CAUSES[c.cause])}))).join("")}</ol>`;
}

function bloc_tireurs(d) {
  if (!d.tireurs.length) return "";
  const lignes = d.tireurs.map((x) => `<tr><td>${echapper(x.nom)}</td><td>${format_entier(x.tirs)}</td><td>${format_entier(x.coups)}</td><td>${pourcent(x.reussite)}</td>
    <td>${x.epuises ? t("vue.debrief.a_sec", {n: format_entier(x.epuises), t: minutes(x.premier_epuisement)}) : "—"}</td></tr>`).join("");
  return `<h3>${t("vue.debrief.tireurs")}</h3><table class="debrief-table"><thead><tr><th>${t("vue.debrief.unite")}</th><th>${t("vue.debrief.tirs")}</th><th>${t("vue.debrief.coups")}</th><th>${t("vue.debrief.reussite")}</th><th>${t("vue.debrief.epuises")}</th></tr></thead><tbody>${lignes}</tbody></table>`;
}

function bloc_chronologie(d) {
  if (!d.frappes) return "";
  const maximum = Math.max(...d.chronologie.map((c) => c.frappes));
  const colonnes = d.chronologie.map((c) => `<span title="${echapper(t("vue.debrief.tranche", {de: minutes(c.debut), a: minutes(c.debut + 300), n: c.frappes}))}" style="block-size:${maximum ? (100 * c.frappes) / maximum : 0}%"></span>`).join("");
  return `<h3>${t("vue.debrief.chrono_titre")}</h3><div class="debrief-chrono" role="img" aria-label="${echapper(t("vue.debrief.chrono_aria", {n: maximum}))}">${colonnes}</div>
    <p class="note">${t("vue.debrief.chrono_note", {fin: minutes(d.chronologie.length * 300), n: format_entier(maximum)})}</p>`;
}

/** Remplir `racine` avec le débriefing `d` ; null : le raid n'est pas fini. */
export function afficher_debriefing(racine, d) {
  if (!d) {
    racine.innerHTML = `<p class="note">${t("vue.debrief.attente")}</p>`;
    return;
  }
  const constats = d.points_faibles.length ? `<h3>${t("vue.debrief.points_faibles")}</h3><ul class="debrief-constats">${d.points_faibles.map((p) => `<li>${echapper(p)}</li>`).join("")}</ul>` : "";
  racine.innerHTML = `${bloc_note(d)}${constats}<h3>${t("vue.debrief.pourquoi")}</h3>${bloc_causes(d)}${bloc_cibles(d)}${bloc_tireurs(d)}${bloc_chronologie(d)}`;
}
