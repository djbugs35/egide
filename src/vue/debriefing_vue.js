// Affichage du débriefing de fin de raid (MODELE § 28) dans son tiroir : chaque barre porte son nombre.
import {CAUSES} from "./debriefing.js";
import {format_entier} from "./format.js";

const echapper = (texte) => String(texte).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
const pourcent = (x) => `${Math.round(100 * x)} %`;
const minutes = (s) => `${Math.floor(s / 60)} min`;

/** Rendre une ligne « libellé, barre, valeur », la barre rapportée à `maximum`. */
function barre(libelle, valeur, maximum, titre = "") {
  const largeur = maximum ? (100 * valeur) / maximum : 0;
  return `<li title="${echapper(titre)}"><span>${echapper(libelle)}</span><span class="barre"><i style="inline-size:${largeur}%"></i></span><b>${format_entier(valeur)}</b></li>`;
}

function bloc_note(d) {
  return `<div class="debrief-note note-${d.note}" title="Taux d'interception ${pourcent(d.taux)} : A ≥ 95 %, B ≥ 85 %, C ≥ 70 %, D ≥ 50 % (MODELE § 28.1)">
    <strong>${d.note}</strong>
    <dl><div><dt>Menaces</dt><dd>${format_entier(d.menaces)}</dd></div><div><dt>Interceptées</dt><dd>${format_entier(d.interceptees)} (${pourcent(d.taux)})</dd></div>
    <div><dt>Frappes</dt><dd>${format_entier(d.frappes)}</dd></div><div><dt>Durée</dt><dd>${minutes(d.duree)}</dd></div></dl></div>`;
}

function bloc_causes(d) {
  if (!d.frappes) return "<p class=\"note\">Aucune frappe : rien n'a passé.</p>";
  return `<ol class="debrief-barres">${Object.entries(CAUSES).map(([cle, libelle]) => barre(libelle, d.causes[cle], d.frappes)).join("")}</ol>`;
}

function bloc_cibles(d) {
  const touchees = d.cibles.filter((c) => c.frappes > 0).sort((a, b) => b.frappes - a.frappes);
  if (!touchees.length) return "";
  const maximum = touchees[0].frappes;
  return `<h3>Frappes par cible</h3><ol class="debrief-barres">${touchees.map((c) => barre(c.nom, c.frappes, maximum, `Cause dominante : ${CAUSES[c.cause]}`)).join("")}</ol>`;
}

function bloc_tireurs(d) {
  if (!d.tireurs.length) return "";
  const lignes = d.tireurs.map((t) => `<tr><td>${echapper(t.nom)}</td><td>${format_entier(t.tirs)}</td><td>${format_entier(t.coups)}</td><td>${pourcent(t.reussite)}</td>
    <td>${t.epuises ? `${format_entier(t.epuises)} à sec, dès ${minutes(t.premier_epuisement)}` : "—"}</td></tr>`).join("");
  return `<h3>Tireurs</h3><table class="debrief-table"><thead><tr><th>Unité</th><th>Tirs</th><th>Coups</th><th>Réussite</th><th>Épuisés</th></tr></thead><tbody>${lignes}</tbody></table>`;
}

function bloc_chronologie(d) {
  if (!d.frappes) return "";
  const maximum = Math.max(...d.chronologie.map((c) => c.frappes));
  const colonnes = d.chronologie.map((c) => `<span title="${minutes(c.debut)} à ${minutes(c.debut + 300)} : ${c.frappes} frappes" style="block-size:${maximum ? (100 * c.frappes) / maximum : 0}%"></span>`).join("");
  return `<h3>Frappes par tranche de 5 min</h3><div class="debrief-chrono" role="img" aria-label="Frappes par tranche de 5 minutes, maximum ${maximum}">${colonnes}</div>
    <p class="note">De 0 à ${minutes(d.chronologie.length * 300)} ; pic : ${format_entier(maximum)} frappes en 5 min.</p>`;
}

/** Remplir `racine` avec le débriefing `d` ; null : le raid n'est pas fini. */
export function afficher_debriefing(racine, d) {
  if (!d) {
    racine.innerHTML = "<p class=\"note\">Le débriefing s'affiche à la fin du raid.</p>";
    return;
  }
  const constats = d.points_faibles.length ? `<h3>Points faibles</h3><ul class="debrief-constats">${d.points_faibles.map((p) => `<li>${echapper(p)}</li>`).join("")}</ul>` : "";
  racine.innerHTML = `${bloc_note(d)}${constats}<h3>Pourquoi ça a frappé</h3>${bloc_causes(d)}${bloc_cibles(d)}${bloc_tireurs(d)}${bloc_chronologie(d)}`;
}
