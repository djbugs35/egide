// Inspecteur « pourquoi » (jalon 4) : au clic sur une entité, son état en direct et l'explication de ce qu'elle fait —
// pourquoi un avion va là, ce qu'un drone a subi, comment une cible est défendue. Rendu par des fonctions pures, testées.
import {inverse, vers_degres} from "../moteur/geodesie.js";
import {COULEURS} from "./couleurs.js";
import {ecran} from "./ecran.js";
import {echapper, LIBELLES_FIDELITE} from "./fiches.js";
import {format_decimal, format_duree, format_entier} from "./format.js";
import {ms_vers_kmh} from "../moteur/unites.js";
import {positions_radars} from "../moteur/radars.js";
import {couverture_reelle} from "../moteur/terrain.js";
import {libelle_noeud} from "./reseau_vue.js";
import {chaine_drone} from "./journal.js";
import {NOMS_VECTEURS} from "./infobulles.js";

const ETATS = {orbite: "en orbite", ralliement: "en route vers son point", engagement: "au contact d'un drone",
  poste: "à poste, en attente", retour: "retour vers son orbite"};

const lien_fiche = (genre, id, texte) => `<a href="catalogue.html#${genre}/${encodeURIComponent(id)}" target="_blank" rel="noopener">${echapper(texte)}</a>`;
const fidelite = (niveau) => `<span class="badge fidelite-${niveau}" title="${echapper(LIBELLES_FIDELITE[niveau] ?? "")}">${echapper(niveau)}</span>`;
const ligne = (cle, valeur) => `<tr><th scope="row">${cle}</th><td>${valeur}</td></tr>`;
const position = (geo) => `${vers_degres(geo.lat).toFixed(3).replace(".", ",")}° N, ${vers_degres(geo.lon).toFixed(3).replace(".", ",")}° E`;
const pourcent = (p) => `${format_decimal(100 * p)} %`;

function pourquoi_avion(avion) {
  const decision = avion.decision;
  if (avion.acces === null && !avion.ordre) {
    return "<p><b>Hors liaison</b> : la conduite ne peut pas le joindre (docs/MODELE.md § 15.2). Il finit sa dernière mission, puis reste où il est ; il n'engage que les drones qui passent à sa portée.</p>";
  }
  if (avion.ordre) return `<p>Il exécute un <b>ordre</b> donné dans l'éditeur : il rallie son point, et la conduite ne le réaffecte pas avant son arrivée.</p>`;
  if (!decision?.explication) return "<p>La conduite ne l'a pas encore affecté : aucune piste n'était connue.</p>";
  const {explication: x, t} = decision;
  if (!decision.point) {
    return `<p>À ${format_duree(t)}, ${x.pistes_connues} pistes étaient connues, aucune atteignable en moins de 15 min à sa vitesse : il est revenu vers son orbite.</p>`;
  }
  const r = x.retenue;
  const alternatives = x.alternatives.map((a) => `<li>piste de ${a.effectif} drones, score ${format_decimal(a.score)}, atteinte en ${format_duree(a.delai)}</li>`).join("");
  return `<p>À ${format_duree(t)}, la conduite l'a envoyé intercepter une piste de <b>${r.effectif} drones</b>, atteinte en
    <b>${format_duree(r.delai)}</b>. Score = effectif / (1 + avions déjà envoyés là) = ${r.effectif} / (1 + ${r.deja_affectes}) =
    <b>${format_decimal(r.score)}</b>, le meilleur parmi ${x.pistes_atteignables} pistes atteignables sur ${x.pistes_connues} connues.</p>
    ${alternatives ? `<p>Meilleures alternatives écartées :</p><ul>${alternatives}</ul>` : ""}`;
}

function inspection_avion(avion, monde) {
  const {groupe} = avion;
  const vitesse = avion.etat === "engagement" ? groupe.vitesse_engagement : ["ralliement", "retour"].includes(avion.etat) ? groupe.vitesse_mise_a_poste : 0;
  return `<h3>${NOMS_VECTEURS[avion.type ?? "avion"]} ${avion.id + 1}${avion.perdu ? " (perdu en interceptant)" : ""}</h3>
    <p>${lien_fiche("unite", groupe.id, groupe.nom)} ${fidelite(groupe.fidelite)}</p>
    <table>${[
      ligne("État", avion.munitions === 0 ? "à court de munitions" : ETATS[avion.etat]),
      ligne("Position", position(avion.geo)),
      ligne("Altitude", `${format_entier(avion.geo.alt)} m`),
      ligne("Vitesse", vitesse ? `${format_entier(ms_vers_kmh(vitesse))} km/h` : "en orbite"),
      ligne("Arme", `${lien_fiche("unite", groupe.arme.id, groupe.arme.nom)}, ${avion.munitions} sur ${groupe.emport_nombre}`),
      ligne("Liaison", acces_texte(monde, avion)),
    ].join("")}</table>
    <h4>Pourquoi va-t-il là ?</h4>${pourquoi_avion(avion, monde)}
    <h4>Modèles</h4><ul>
      <li>Mouvement : ${lien_fiche("algo", groupe.algos.mouvement, groupe.algos.mouvement)}</li>
      <li>Tir : ${lien_fiche("algo", groupe.arme.algos.tir, groupe.arme.algos.tir)}</li>
      <li>Allocation : ${lien_fiche("algo", monde.scenario.conduite.allocation, monde.scenario.conduite.allocation)}</li></ul>`;
}

/** Rendre la synthèse des tirs subis par un drone : nombre, Pk, probabilité de survie à ces tirs et issue. */
export function tirs_subis(monde, idDrone) {
  const tirs = (monde.evenements ?? []).filter((e) => e.type === "tir" && e.drone === idDrone);
  const survie = tirs.reduce((p, tir) => p * (1 - tir.pk), 1);
  return {tirs, survie, detruit_par: tirs.find((tir) => tir.detruit) ?? null};
}

/** Rendre la section « Pourquoi a-t-il changé de route ? » d'un drone de l'essaim réactif (MODELE § 22). */
function reactions_drone(drone, monde) {
  const reactions = (monde.evenements ?? []).filter((e) => e.type === "reaction" && e.drone === drone.id);
  const cible = (k) => (monde.cibles[k]?.conduite ? "le CDC" : `C${k + 1}`);
  const lignes = reactions.map((e) => (e.nature === "reaffectation"
    ? `<li>${format_duree(e.t)} : quitte ${cible(e.de)} pour ${cible(e.vers)} — l'essaim y perd moins de drones et y a déjà frappé (survie estimée (F + 1) / (F + P + 2)).</li>`
    : `<li>${format_duree(e.t)} : contourne un site défendu où l'essaim a perdu ${e.foyer.pertes} drones (détour à ${position(e.point)}).</li>`));
  return `<h4>Pourquoi a-t-il changé de route ?</h4>${lignes.length ? `<ul>${lignes.join("")}</ul>` : "<p>Il garde sa route : rien de ce que sait l'essaim ne vaut un détour ou une autre cible.</p>"}`;
}

function inspection_drone(drone, monde) {
  const {rouge} = monde.scenario;
  const {tirs, survie, detruit_par: fatal} = tirs_subis(monde, drone.id);
  const etat = !drone.vivant ? `détruit à ${format_duree(fatal?.t ?? monde.t)} (${fatal?.couche === "air" ? "par un avion" : "au sol"})`
    : drone.arrive ? "a frappé sa cible" : monde.t < drone.depart ? `part à ${format_duree(drone.depart)}` : "en vol";
  const restant = drone.vivant && !drone.arrive
    ? drone.route.reduce((somme, point, i) => somme + inverse(i ? drone.route[i - 1].geo : drone.geo, point.geo).distance, 0) : 0;
  const detail = tirs.map((tir) => `<li>${format_duree(tir.t)} : tir ${tir.couche === "air" ? "air" : "sol"}, Pk ${format_decimal(tir.pk)}${tir.esquive ? ` (esquive : Pk de l'arme × ${format_decimal(1 - tir.esquive)})` : ""} — ${tir.detruit ? "<b>détruit</b>" : "manqué"}</li>`).join("");
  return `<h3>Drone ${drone.id + 1}, vise C${drone.cible + 1}</h3>
    <p>${lien_fiche("unite", rouge.id, rouge.nom)} ${fidelite(rouge.fidelite)}</p>
    <table>${[
      ligne("État", etat),
      ligne("Détecté", drone.detection === null ? "pas encore" : `à ${format_duree(drone.detection)}`),
      ligne("Reste à parcourir", restant ? `${format_decimal(restant / 1000)} km, ${format_duree(restant / rouge.vitesse)}` : "—"),
      ligne("Altitude", `${format_entier(drone.geo.alt)} m`),
    ].join("")}</table>
    <h4>Chaîne de l'information</h4><ol class="chaine">${chaine_drone(monde, drone.id).map((e) => `<li>${e.instant ? `<b>${e.instant}</b> ` : ""}${e.texte}</li>`).join("")}</ol>
    <h4>Tirs subis</h4>${tirs.length ? `<ul>${detail}</ul>
      <p>Probabilité de survivre à ces ${tirs.length} tirs : Π(1 − Pk) = <b>${pourcent(survie)}</b>.</p>` : "<p>Aucun pour l'instant.</p>"}
    ${rouge.reaction ? reactions_drone(drone, monde) : ""}
    <h4>Modèles</h4><ul>
      <li>Comportement : ${lien_fiche("algo", rouge.comportement, rouge.comportement)}</li>
      ${rouge.reaction ? `<li>Réaction : ${lien_fiche("algo", rouge.reaction, rouge.reaction)}</li>` : ""}
      <li>Mouvement : ${lien_fiche("algo", rouge.algos.mouvement, rouge.algos.mouvement)}</li>
      <li>Détection : ${lien_fiche("algo", monde.scenario.radar.algos.detection, monde.scenario.radar.algos.detection)}</li></ul>`;
}

function inspection_cible(indice, monde) {
  const {sol, rouge} = monde.scenario;
  const postes = monde.postes.filter((poste) => poste.cible === indice);
  const munitions = postes.reduce((somme, poste) => somme + poste.munitions, 0);
  const cadence = sol.portee / rouge.vitesse / sol.engagements_par_passage;
  return `<h3>Cible C${indice + 1}</h3>
    <table>${[
      ligne("Position", position(monde.cibles[indice].geo)),
      ligne("Postes sol", `${postes.length} × ${lien_fiche("unite", sol.id, sol.nom)}`),
      ligne("Munitions", `${format_entier(munitions)} restantes`),
      ligne("Frappes reçues", format_entier(monde.fuites[indice])),
    ].join("")}</table>
    <h4>Comment est-elle défendue ?</h4>
    <p>Chaque poste tire sur le drone le plus proche dans sa bulle de ${format_decimal(sol.portee / 1000)} km, un tir toutes les
    ${format_decimal(cadence)} s : un drone met ${format_decimal(sol.portee / rouge.vitesse)} s à traverser la bulle, où le poste
    doit loger ses ${sol.engagements_par_passage} engagements. Pk ${format_decimal(sol.pk)} par tir.</p>
    <h4>Modèles</h4><ul><li>Tir sol : ${lien_fiche("algo", sol.algos.tir_sol, sol.algos.tir_sol)}</li></ul>`;
}

/** Rendre le HTML de l'inspection de `cible` ({type: avion|drone|cible, id}) dans le monde. */
function portees_relief(monde, indice) {
  const portees = couverture_reelle(monde.reseau.masques[indice], monde.reseau.grille, monde.reseau.hauteur_drones).map((c) => c.portee / 1000);
  const masques = portees.filter((p) => p < 0.99 * Math.max(...portees)).length;
  return `vue de ${format_entier(Math.min(...portees))} à ${format_entier(Math.max(...portees))} km selon l'azimut ; masquée par le relief sur ${masques}° de tour`;
}

function reseau_radar(monde, indice) {
  const latence = monde.reseau.latences_radars[indice];
  if (monde.reseau.radars_hs?.[indice]) return "<b>Hors service</b> : il ne voit plus rien.";
  if (monde.reseau.aucun_centre) return "<b>Aucun centre en service</b> : ses détections ne servent à personne.";
  if (monde.reseau.mode === "complet") return "Relié à toute la défense : chaque détection profite aussitôt à tous (réseau complet, docs/MODELE.md § 15.2).";
  if (!Number.isFinite(latence)) return "<b>Non relié à la conduite</b> : ce qu'il voit ne sert à personne.";
  return `Relié à la conduite : ses détections y arrivent en <b>${format_decimal(latence)} s</b>.`;
}

function acces_texte(monde, avion) {
  if (monde.reseau.mode === "complet") return "réseau complet";
  if (avion.acces === undefined) return "pas encore évaluée";
  if (!avion.acces) return "<b>hors liaison</b> : la conduite ne peut pas l'affecter";
  const centre = avion.acces.centre === 0 ? "CDC" : echapper(monde.reseau.centres[avion.acces.centre].nom);
  return `contrôlé par ${centre}, ${echapper(avion.acces.moyen.nom)} depuis ${libelle_noeud(monde, avion.acces.sol)}, ${format_decimal(avion.acces.latence)} s`;
}

/**
 * Inspection d'un centre de détection et de contrôle (MODELE § 18) : son rôle, son état, ce qu'il reçoit des radars,
 * les avions qu'il contrôle, les postes sol qu'il désigne ; pour le centre principal, toutes les liaisons au sol.
 */
function inspection_centre(monde, c) {
  const {reseau} = monde;
  const centre = reseau.centres[c];
  const recus = reseau.latences_centres[c].map((l, i) => (Number.isFinite(l) ? `R${i + 1} (${format_decimal(l)} s)` : null)).filter(Boolean);
  const nonRelies = reseau.latences_centres[c].map((l, i) => (Number.isFinite(l) ? null : `R${i + 1}`)).filter(Boolean);
  const controles = monde.avions.filter((a) => a.acces && a.acces.centre === c).length;
  const designes = monde.cibles.map((cible, i) => (Number.isFinite(reseau.latences_sol[c]?.[i]) && monde.postes.some((p) => p.cible === i) ? (cible.conduite ? "CDC" : `C${i + 1}`) : null)).filter(Boolean);
  const detruit = c === 0 && monde.conduite_detruite !== null;
  const lignes = c === 0 ? reseau.fixes.map((l) => `<li>${libelle_noeud(monde, l.de)} ↔ ${libelle_noeud(monde, l.vers)} : ${echapper(l.moyen.nom)},
    ${l.active ? `${format_decimal(l.moyen.latence)} s` : `<b>hors portée</b>${l.distance ? ` (${format_decimal(l.distance / 1000)} km pour ${format_decimal(l.portee / 1000)} km)` : ""}`}</li>`).join("") : "";
  return `<h3>${c === 0 ? "Centre de détection et de contrôle (CDC)" : echapper(centre.nom)}</h3>
    <p>Il reçoit les détections des radars, en fait des pistes, envoie les avions qu'il contrôle sur les pistes d'intérêt et désigne les drones aux postes sol qu'il joint.</p>
    <table>${[
      ligne("Position", position(centre.geo)),
      ligne("Réseau", reseau.mode === "complet" ? "complet : tout le monde parle avec tout le monde, sans délai" : "liaisons listées"),
      ligne("État", detruit ? `<b>détruit</b> par l'essaim à ${format_duree(monde.conduite_detruite)}` : centre.hs ? "<b>hors service</b>"
        : c === 0 && monde.cible_conduite !== null ? "en service, visé par l'essaim" : "en service"),
      ligne("Radars reçus", recus.length ? (reseau.mode === "complet" ? "tous, aussitôt" : recus.join(", ")) : "<b>aucun</b>"),
      ligne("Avions contrôlés", `${format_entier(controles)} à la dernière décision`),
      ligne("Postes désignés", designes.length ? designes.join(", ") : "<b>aucun</b> : les postes doivent acquérir seuls"),
    ].join("")}</table>
    ${reseau.mode === "complet" ? "<p>Pour décrire le réseau : outils Liaison et CDC de l'éditeur (docs/MODELE.md § 15.2 et § 18).</p>" : `
    ${nonRelies.length ? `<p>Radars qui ne l'informent pas : <b>${nonRelies.join(", ")}</b>.</p>` : ""}
    ${lignes ? `<h4>Liaisons au sol</h4><ul>${lignes}</ul>` : ""}`}`;
}

function inspection_radar(indice, monde) {
  const {radar} = monde.scenario;
  const geo = positions_radars(monde.scenario)[indice];
  const site = monde.couverture.sites?.[indice];
  const disposition = radar.disposition === "sites"
    ? "placé dans l'éditeur"
    : "matérialise la couverture « frontière » ; le déplacer dans l'éditeur place tous les radars un à un";
  const vus = monde.drones.filter((d) => d.detection !== null).length;
  return `<h3>Radar R${indice + 1}</h3>
    <p>${lien_fiche("unite", radar.id, radar.nom)} ${fidelite(radar.fidelite)}</p>
    <table>${[
      ligne("Position", position(geo)),
      ligne("Disposition", disposition),
      ligne("Antenne", `${format_entier(radar.hauteur_antenne)} m`),
      ligne("Portée instrumentée", `${format_entier(radar.portee_max / 1000)} km`),
      site ? ligne("Portée contre l'essaim", `${format_entier(site.portee / 1000)} km (horizon radar)`) : "",
      monde.reseau.masques ? ligne("Relief", portees_relief(monde, indice)) : "",
      ligne("Détection", lien_fiche("algo", radar.algos.detection, radar.algos.detection)),
    ].join("")}</table>
    <h4>Réseau</h4>
    <p>${reseau_radar(monde, indice)} ${format_entier(vus)} drones détectés depuis le début du raid par l'ensemble des radars.</p>`;
}

export function inspection(cible, monde) {
  if (cible.type === "radar") return inspection_radar(cible.id, monde);
  if (cible.type === "conduite") return inspection_centre(monde, 0);
  if (cible.type === "centre") return inspection_centre(monde, cible.id + 1);
  if (cible.type === "avion") return inspection_avion(monde.avions[cible.id], monde);
  if (cible.type === "drone") return inspection_drone(monde.drones[cible.id], monde);
  return inspection_cible(cible.id, monde);
}

/** Rendre la position géographique de l'entité inspectée, ou null si elle n'est plus visible (drone détruit ou arrivé). */
export function position_inspectee(cible, monde) {
  if (cible.type === "avion") return monde.avions[cible.id]?.geo ?? null;
  if (cible.type === "cible") return monde.cibles[cible.id]?.geo ?? null;
  if (cible.type === "radar") return positions_radars(monde.scenario)[cible.id] ?? null;
  if (cible.type === "conduite") return monde.scenario.reseau.centre;
  if (cible.type === "centre") return monde.scenario.reseau.centres[cible.id]?.geo ?? null;
  const drone = monde.drones[cible.id];
  return drone && drone.vivant && !drone.arrive ? drone.geo : null;
}

/** Dessiner un double anneau autour de l'entité inspectée. */
export function dessiner_inspection(ctx, camera, cible, monde) {
  const geo = cible && position_inspectee(cible, monde);
  if (!geo) return;
  const p = ecran(camera, geo);
  ctx.strokeStyle = COULEURS.selection;
  ctx.lineWidth = 1.5;
  for (const rayon of [13, 17]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, rayon, 0, 2 * Math.PI);
    ctx.stroke();
  }
}
