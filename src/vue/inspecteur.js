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
import {connexions_html, libelle_noeud} from "./reseau_vue.js";
import {chaine_drone} from "./journal.js";
import {NOMS_VECTEURS} from "./infobulles.js";
import {t} from "../i18n.js";

const ETATS = {orbite: "vue.insp.orbite", ralliement: "vue.insp.ralliement", engagement: "vue.insp.engagement",
  poste: "vue.infobulle.poste", retour: "vue.infobulle.retour"};

const lien_fiche = (genre, id, texte) => `<a href="catalogue.html#${genre}/${encodeURIComponent(id)}" target="_blank" rel="noopener">${echapper(texte)}</a>`;
const fidelite = (niveau) => `<span class="badge fidelite-${niveau}" title="${echapper(LIBELLES_FIDELITE[niveau] ?? "")}">${echapper(niveau)}</span>`;
const ligne = (cle, valeur) => `<tr><th scope="row">${t(cle)}</th><td>${valeur}</td></tr>`;
const position = (geo) => t("vue.insp.position", {lat: vers_degres(geo.lat).toFixed(3).replace(".", format_decimal(0.5).charAt(1)), lon: vers_degres(geo.lon).toFixed(3).replace(".", format_decimal(0.5).charAt(1))});
const pourcent = (p) => `${format_decimal(100 * p)} %`;

function pourquoi_avion(avion) {
  const decision = avion.decision;
  if (avion.acces === null && !avion.ordre) {
    return `<p>${t("vue.insp.hors_liaison")}</p>`;
  }
  if (avion.ordre) return `<p>${t("vue.insp.ordre")}</p>`;
  if (!decision?.explication) return `<p>${t("vue.insp.pas_affecte")}</p>`;
  const {explication: x, t: instant} = decision;
  if (!decision.point) return `<p>${t("vue.insp.revenu", {t: format_duree(instant), n: x.pistes_connues})}</p>`;
  const r = x.retenue;
  const alternatives = x.alternatives.map((a) => `<li>${t("vue.insp.alternative", {n: a.effectif, score: format_decimal(a.score), delai: format_duree(a.delai)})}</li>`).join("");
  return `<p>${t("vue.insp.envoye", {t: format_duree(instant), n: r.effectif, delai: format_duree(r.delai), deja: r.deja_affectes, score: format_decimal(r.score), atteignables: x.pistes_atteignables, connues: x.pistes_connues})}</p>
    ${alternatives ? `<p>${t("vue.insp.alternatives")}</p><ul>${alternatives}</ul>` : ""}`;
}

function inspection_avion(avion, monde) {
  const {groupe} = avion;
  const vitesse = avion.etat === "engagement" ? groupe.vitesse_engagement : ["ralliement", "retour"].includes(avion.etat) ? groupe.vitesse_mise_a_poste : 0;
  return `<h3>${t(NOMS_VECTEURS[avion.type ?? "avion"])} ${avion.id + 1}${avion.perdu ? ` ${t("vue.insp.perdu")}` : ""}</h3>
    <p>${lien_fiche("unite", groupe.id, groupe.nom)} ${fidelite(groupe.fidelite)}</p>
    <table>${[
      ligne("vue.insp.etat", avion.munitions === 0 ? t("vue.infobulle.sans_munitions") : t(ETATS[avion.etat])),
      ligne("vue.insp.l_position", position(avion.geo)),
      ligne("vue.insp.altitude", `${format_entier(avion.geo.alt)} m`),
      ligne("vue.insp.vitesse", vitesse ? `${format_entier(ms_vers_kmh(vitesse))} km/h` : t("vue.insp.orbite")),
      ligne("vue.insp.arme", t("vue.insp.arme_valeur", {arme: lien_fiche("unite", groupe.arme.id, groupe.arme.nom), n: avion.munitions, emport: groupe.emport_nombre})),
      ligne("vue.insp.liaison", acces_texte(monde, avion)),
    ].join("")}</table>
    <h4>${t("vue.insp.pourquoi_la")}</h4>${pourquoi_avion(avion, monde)}
    <h4>${t("vue.insp.modeles")}</h4><ul>
      <li>${t("vue.insp.m_mouvement")} ${lien_fiche("algo", groupe.algos.mouvement, groupe.algos.mouvement)}</li>
      <li>${t("vue.insp.m_tir")} ${lien_fiche("algo", groupe.arme.algos.tir, groupe.arme.algos.tir)}</li>
      <li>${t("vue.insp.m_allocation")} ${lien_fiche("algo", monde.scenario.conduite.allocation, monde.scenario.conduite.allocation)}</li></ul>`;
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
  const cible = (k) => (monde.cibles[k]?.conduite ? t("vue.journal.le_cdc") : `C${k + 1}`);
  const lignes = reactions.map((e) => (e.nature === "reaffectation"
    ? `<li>${t("vue.insp.quitte", {t: format_duree(e.t), de: cible(e.de), vers: cible(e.vers)})}</li>`
    : `<li>${t("vue.insp.contourne", {t: format_duree(e.t), n: e.foyer.pertes, position: position(e.point)})}</li>`));
  return `<h4>${t("vue.insp.pourquoi_route")}</h4>${lignes.length ? `<ul>${lignes.join("")}</ul>` : `<p>${t("vue.insp.garde_route")}</p>`}`;
}

function inspection_drone(drone, monde) {
  const {rouge} = monde.scenario;
  const {tirs, survie, detruit_par: fatal} = tirs_subis(monde, drone.id);
  const etat = !drone.vivant ? t(fatal?.couche === "air" ? "vue.insp.detruit_air" : "vue.insp.detruit_sol", {t: format_duree(fatal?.t ?? monde.t)})
    : drone.arrive ? t("vue.insp.a_frappe") : monde.t < drone.depart ? t("vue.insp.part_a", {t: format_duree(drone.depart)}) : t("vue.insp.en_vol");
  const restant = drone.vivant && !drone.arrive
    ? drone.route.reduce((somme, point, i) => somme + inverse(i ? drone.route[i - 1].geo : drone.geo, point.geo).distance, 0) : 0;
  const detail = tirs.map((tir) => `<li>${t(tir.couche === "air" ? "vue.insp.tir_air" : "vue.insp.tir_sol", {t: format_duree(tir.t), pk: format_decimal(tir.pk)})}${tir.esquive ? ` ${t("vue.insp.esquive", {f: format_decimal(1 - tir.esquive)})}` : ""} — ${tir.detruit ? `<b>${t("vue.journal.detruit")}</b>` : t("vue.journal.manque")}</li>`).join("");
  return `<h3>${t("vue.infobulle.drone", {n: drone.id + 1, cible: drone.cible + 1})}</h3>
    <p>${lien_fiche("unite", rouge.id, rouge.nom)} ${fidelite(rouge.fidelite)}</p>
    <table>${[
      ligne("vue.insp.etat", etat),
      ligne("vue.insp.detecte", drone.detection === null ? t("vue.insp.pas_encore") : t("vue.insp.a", {t: format_duree(drone.detection)})),
      ligne("vue.insp.reste", restant ? `${format_decimal(restant / 1000)} km, ${format_duree(restant / rouge.vitesse)}` : "—"),
      ligne("vue.insp.altitude", `${format_entier(drone.geo.alt)} m`),
    ].join("")}</table>
    <h4>${t("vue.insp.chaine")}</h4><ol class="chaine">${chaine_drone(monde, drone.id).map((e) => `<li>${e.instant ? `<b>${e.instant}</b> ` : ""}${e.texte}</li>`).join("")}</ol>
    <h4>${t("vue.insp.tirs_subis")}</h4>${tirs.length ? `<ul>${detail}</ul>
      <p>${t("vue.insp.survie", {n: tirs.length, p: pourcent(survie)})}</p>` : `<p>${t("vue.insp.aucun_tir")}</p>`}
    ${rouge.reaction ? reactions_drone(drone, monde) : ""}
    <h4>${t("vue.insp.modeles")}</h4><ul>
      <li>${t("vue.insp.m_comportement")} ${lien_fiche("algo", rouge.comportement, rouge.comportement)}</li>
      ${rouge.reaction ? `<li>${t("vue.insp.m_reaction")} ${lien_fiche("algo", rouge.reaction, rouge.reaction)}</li>` : ""}
      <li>${t("vue.insp.m_mouvement")} ${lien_fiche("algo", rouge.algos.mouvement, rouge.algos.mouvement)}</li>
      <li>${t("vue.insp.m_detection")} ${lien_fiche("algo", monde.scenario.radar.algos.detection, monde.scenario.radar.algos.detection)}</li></ul>`;
}

function inspection_cible(indice, monde) {
  const {sol, rouge} = monde.scenario;
  const postes = monde.postes.filter((poste) => poste.cible === indice);
  const munitions = postes.reduce((somme, poste) => somme + poste.munitions, 0);
  const cadence = sol.portee / rouge.vitesse / sol.engagements_par_passage;
  return `<h3>${t("vue.infobulle.cible", {n: indice + 1})}</h3>
    <table>${[
      ligne("vue.insp.l_position", position(monde.cibles[indice].geo)),
      ligne("vue.insp.postes_sol", `${postes.length} × ${lien_fiche("unite", sol.id, sol.nom)}`),
      ligne("vue.fiche.munitions", t("vue.insp.restantes", {n: format_entier(munitions)})),
      ligne("vue.insp.frappes_recues", format_entier(monde.fuites[indice])),
    ].join("")}</table>
    <h4>${t("vue.insp.defendue")}</h4>
    <p>${t("vue.insp.defense_cible", {km: format_decimal(sol.portee / 1000), cadence: format_decimal(cadence), traversee: format_decimal(sol.portee / rouge.vitesse), n: sol.engagements_par_passage, pk: format_decimal(sol.pk)})}</p>
    <h4>${t("vue.insp.modeles")}</h4><ul><li>${t("vue.insp.m_tir_sol")} ${lien_fiche("algo", sol.algos.tir_sol, sol.algos.tir_sol)}</li></ul>`;
}

/** Rendre le HTML de l'inspection de `cible` ({type: avion|drone|cible, id}) dans le monde. */
function portees_relief(monde, indice) {
  const portees = couverture_reelle(monde.reseau.masques[indice], monde.reseau.grille, monde.reseau.hauteur_drones).map((c) => c.portee / 1000);
  const masques = portees.filter((p) => p < 0.99 * Math.max(...portees)).length;
  return t("vue.insp.relief", {min: format_entier(Math.min(...portees)), max: format_entier(Math.max(...portees)), masques});
}

function reseau_radar(monde, indice) {
  const latence = monde.reseau.latences_radars[indice];
  if (monde.reseau.radars_hs?.[indice]) return t("vue.insp.radar_hs");
  if (monde.reseau.aucun_centre) return t("vue.insp.aucun_centre");
  if (monde.reseau.mode === "complet") return t("vue.insp.radar_complet");
  if (!Number.isFinite(latence)) return t("vue.insp.radar_non_relie");
  return t("vue.insp.radar_relie", {s: format_decimal(latence)});
}

function acces_texte(monde, avion) {
  if (monde.reseau.mode === "complet") return t("vue.insp.acces_complet");
  if (avion.acces === undefined) return t("vue.insp.acces_inconnu");
  if (!avion.acces) return t("vue.insp.acces_aucun");
  const centre = avion.acces.centre === 0 ? t("vue.commun.cdc") : echapper(monde.reseau.centres[avion.acces.centre].nom);
  return t("vue.insp.acces", {centre, moyen: echapper(avion.acces.moyen.nom), depuis: libelle_noeud(monde, avion.acces.sol), s: format_decimal(avion.acces.latence)});
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
  const designes = monde.cibles.map((cible, i) => (Number.isFinite(reseau.latences_sol[c]?.[i]) && monde.postes.some((p) => p.cible === i) ? (cible.conduite ? t("vue.commun.cdc") : `C${i + 1}`) : null)).filter(Boolean);
  const detruit = c === 0 && monde.conduite_detruite !== null;
  const lignes = c === 0 ? reseau.fixes.map((l) => `<li>${libelle_noeud(monde, l.de)} ↔ ${libelle_noeud(monde, l.vers)} : ${echapper(l.moyen.nom)},
    ${l.active ? `${format_decimal(l.moyen.latence)} s` : `<b>${t("vue.insp.hors_portee")}</b>${l.distance ? ` ${t("vue.insp.km_pour", {d: format_decimal(l.distance / 1000), p: format_decimal(l.portee / 1000)})}` : ""}`}</li>`).join("") : "";
  return `<h3>${c === 0 ? t("vue.infobulle.cdc") : echapper(centre.nom)}</h3>
    <p>${t("vue.insp.role_cdc")}</p>
    <table>${[
      ligne("vue.insp.l_position", position(centre.geo)),
      ligne("vue.insp.reseau", reseau.mode === "complet" ? t("vue.insp.reseau_complet") : t("vue.insp.liaisons_listees")),
      ligne("vue.insp.etat", detruit ? t("vue.insp.cdc_detruit", {t: format_duree(monde.conduite_detruite)}) : centre.hs ? `<b>${t("vue.infobulle.hors_service")}</b>`
        : c === 0 && monde.cible_conduite !== null ? t("vue.insp.en_service_vise") : t("vue.insp.en_service")),
      ligne("vue.insp.radars_recus", recus.length ? (reseau.mode === "complet" ? t("vue.insp.tous_aussitot") : recus.join(", ")) : `<b>${t("vue.fiche.aucun")}</b>`),
      ligne("vue.insp.avions_controles", t("vue.insp.a_la_derniere", {n: format_entier(controles)})),
      ligne("vue.insp.postes_designes", designes.length ? designes.join(", ") : t("vue.insp.aucun_designe")),
    ].join("")}</table>
    ${reseau.mode === "complet" ? `<p>${t("vue.insp.decrire_reseau")}</p>` : `
    ${nonRelies.length ? `<p>${t("vue.insp.non_relies", {liste: nonRelies.join(", ")})}</p>` : ""}
    ${lignes ? `<h4>${t("vue.insp.liaisons_sol")}</h4><ul>${lignes}</ul>` : ""}`}`;
}

function inspection_radar(indice, monde) {
  const {radar} = monde.scenario;
  const geo = positions_radars(monde.scenario)[indice];
  const site = monde.couverture.sites?.[indice];
  const disposition = radar.disposition === "sites" ? t("vue.insp.radar_place") : t("vue.insp.radar_frontiere");
  const vus = monde.drones.filter((d) => d.detection !== null).length;
  return `<h3>${t("vue.fiche.radar", {n: indice + 1})}</h3>
    <p>${lien_fiche("unite", radar.id, radar.nom)} ${fidelite(radar.fidelite)}</p>
    <table>${[
      ligne("vue.insp.l_position", position(geo)),
      ligne("vue.insp.disposition", disposition),
      ligne("vue.insp.antenne", `${format_entier(radar.hauteur_antenne)} m`),
      ligne("vue.insp.portee_instrumentee", `${format_entier(radar.portee_max / 1000)} km`),
      site ? ligne("vue.insp.portee_essaim", t("vue.insp.horizon", {km: format_entier(site.portee / 1000)})) : "",
      monde.reseau.masques ? ligne("vue.insp.relief_titre", portees_relief(monde, indice)) : "",
      ligne("vue.insp.detection", lien_fiche("algo", radar.algos.detection, radar.algos.detection)),
    ].join("")}</table>
    <h4>${t("vue.insp.reseau")}</h4>
    <p>${reseau_radar(monde, indice)} ${t("vue.insp.vus", {n: format_entier(vus)})}</p>`;
}

export function inspection(cible, monde) {
  if (cible.type === "drone") return inspection_drone(monde.drones[cible.id], monde);
  const noeud = noeud_inspecte(cible, monde);
  // En réseau complet, la fiche dit déjà que tout est relié : la liste n'apporterait rien pendant le raid.
  return corps_inspection(cible, monde) + (monde.reseau.mode === "complet" ? "" : connexions_html(monde, noeud));
}

/** Rendre le corps de la fiche d'une entité du réseau (tout sauf un drone). */
function corps_inspection(cible, monde) {
  if (cible.type === "radar") return inspection_radar(cible.id, monde);
  if (cible.type === "conduite") return inspection_centre(monde, 0);
  if (cible.type === "centre") return inspection_centre(monde, cible.id + 1);
  if (cible.type === "avion") return inspection_avion(monde.avions[cible.id], monde);
  return inspection_cible(cible.id, monde);
}

/** Rendre le nœud réseau de l'entité inspectée. */
function noeud_inspecte(cible, monde) {
  if (cible.type === "radar") return `radar:${cible.id}`;
  if (cible.type === "conduite") return "conduite";
  if (cible.type === "centre") return `centre:${cible.id}`;
  if (cible.type === "avion") return `avions:${monde.scenario.avions.indexOf(monde.avions[cible.id].groupe)}`;
  return `sol:${cible.id}`;
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
