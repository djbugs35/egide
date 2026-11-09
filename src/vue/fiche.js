// Fiche de déploiement (MODELE § 21) : pour l'unité ou le groupe sélectionné dans l'éditeur, les réglages qu'on peut
// changer — modèle du catalogue, algorithmes par rôle, moyens de communication, effectifs. Chaque réglage est un
// contrôle lié à des modifications par chemin du scénario. Pur, sans DOM, testé.
import {sans_prive} from "./catalogue_prive.js";
import {equipement} from "./deploiement.js";
import {noeud_element} from "./edition.js";

const parmi = (index, prefixes) => index.filter((u) => !u.base && prefixes.some((p) => sans_prive(u.id).startsWith(p))).map((u) => ({valeur: u.id, libelle: u.nom}));
const algos_du_role = (algos, role) => algos.filter((a) => a.role === role).map((a) => ({valeur: a.id, libelle: a.nom}));

/**
 * Contrôle d'un algorithme surchargé pour un rôle : « hérité » ôte la surcharge, un choix la pose ; seuls les autres
 * rôles surchargés restent (MODELE § 21.3). `chemin` mène à l'objet `algos` des surcharges.
 */
function controle_algo(libelle, chemin, actuels, role, algos, herite) {
  const nomHerite = algos.find((a) => a.id === herite)?.nom ?? herite ?? "aucun";
  const options = [{valeur: "", libelle: `hérité : ${nomHerite}`}, ...algos_du_role(algos, role)];
  return {libelle, type: "choix", options, valeur: actuels?.[role] ?? "", modifications: (v) => {
    const {[role]: _ancien, ...autres} = actuels ?? {};
    return {[chemin]: v ? {...autres, [role]: v} : autres};
  }};
}

/** Contrôle des moyens de communication d'un nœud : cases à cocher ; aucune case, le nœud accepte tout moyen. */
function controle_moyens(brut, noeud, index) {
  const actuels = equipement(brut, noeud) ?? [];
  return {libelle: "Moyens de communication", type: "cases", options: parmi(index, ["liaisons/"]), valeur: actuels, modifications: (moyens) => {
    const autres = (brut.bleu.reseau.equipements ?? []).filter((e) => e.noeud !== noeud);
    return {"bleu.reseau.equipements": moyens.length ? [...autres, {noeud, moyens}] : autres};
  }};
}

const nombre = (libelle, chemin, valeur, min = 0, pas = 1) => ({libelle, type: "nombre", valeur, min, pas, modifications: (v) => ({[chemin]: v})});

function fiche_radar(monde, brut, i, ctx) {
  const radar = brut.bleu.radar;
  if (radar.disposition !== "sites") {
    return {titre: `Radar R${i + 1}`, noeud: `radar:${i}`, note: "Radars répartis sur la frontière : leur modèle est commun. Déplacez ou déposez un radar pour les placer un à un et choisir chaque modèle.",
      controles: [{libelle: "Modèle commun", type: "choix", options: parmi(ctx.index, ["capteurs/"]), valeur: radar.unite, modifications: (v) => ({"bleu.radar.unite": v, "bleu.radar.surcharges": {}})}, controle_moyens(brut, `radar:${i}`, ctx.index)]};
  }
  const site = radar.sites[i];
  return {titre: `Radar R${i + 1}`, noeud: `radar:${i}`, controles: [
    {libelle: "Modèle", type: "choix", options: [{valeur: "", libelle: `commun : ${ctx.nom(radar.unite)}`}, ...parmi(ctx.index, ["capteurs/"])], valeur: site.unite ?? "",
      modifications: (v) => ({[`bleu.radar.sites.${i}`]: {lat_deg: site.lat_deg, lon_deg: site.lon_deg, ...(v ? {unite: v} : {})}})},
    controle_moyens(brut, `radar:${i}`, ctx.index),
  ]};
}

function fiche_batterie(monde, brut, j, ctx) {
  const b = brut.bleu.sol.batteries[j];
  const unite = monde.scenario.sol.batteries[j].unite;
  return {titre: `Batterie B${j + 1}`, noeud: noeud_element(monde, {type: "batterie", indice: j}), note: `Portée ${Math.round(unite.portee / 100) / 10} km, Pk ${unite.pk}. Rattachée au site le plus proche pour le réseau.`, controles: [
    {libelle: "Modèle", type: "choix", options: parmi(ctx.index, ["sites/"]), valeur: b.unite ?? brut.bleu.sol.unite, modifications: (v) => ({[`bleu.sol.batteries.${j}.unite`]: v, [`bleu.sol.batteries.${j}.surcharges`]: {}})},
    nombre("Munitions", `bleu.sol.batteries.${j}.munitions`, b.munitions),
    controle_algo("Algorithme de tir sol", `bleu.sol.batteries.${j}.surcharges.algos`, b.surcharges?.algos, "tir_sol", ctx.algos, unite.algos.tir_sol),
    controle_moyens(brut, noeud_element(monde, {type: "batterie", indice: j}), ctx.index),
  ]};
}

function fiche_groupe(monde, brut, g, ctx) {
  const groupe = brut.bleu.avions[g];
  const resolu = monde.scenario.avions[g];
  const base = `bleu.avions.${g}`;
  return {titre: `Groupe ${g + 1} : ${ctx.nom(groupe.unite)}`, noeud: `avions:${g}`, note: `${groupe.nombre} vecteur${groupe.nombre > 1 ? "s" : ""}. Ctrl+1 à 9 mémorise une sélection, 1 à 9 la rappelle.`, controles: [
    {libelle: "Modèle", type: "choix", options: parmi(ctx.index, ["vecteurs/avions/", "vecteurs/drones_defensifs/"]), valeur: groupe.unite,
      modifications: (v) => ({[`${base}.unite`]: v, [`${base}.surcharges`]: {}, [`${base}.surcharges_emport`]: {}})},
    nombre("Nombre", `${base}.nombre`, groupe.nombre),
    nombre("Altitude (m)", `${base}.altitude_m`, groupe.altitude_m, 50, 50),
    {libelle: "Armement", type: "choix", options: parmi(ctx.index, ["effecteurs/"]), valeur: resolu.arme.id,
      modifications: (v) => ({[`${base}.surcharges`]: {...groupe.surcharges, emport: v}, [`${base}.surcharges_emport`]: {}})},
    controle_algo("Algorithme de mouvement", `${base}.surcharges.algos`, groupe.surcharges?.algos, "mouvement", ctx.algos, resolu.algos.mouvement),
    controle_algo("Algorithme de tir", `${base}.surcharges_emport.algos`, groupe.surcharges_emport?.algos, "tir", ctx.algos, resolu.arme.algos.tir),
    controle_moyens(brut, `avions:${g}`, ctx.index),
  ]};
}

function fiche_centre(monde, brut, k, ctx) {
  if (k === null) {
    return {titre: "CDC principal", noeud: "conduite", controles: [
      {libelle: "Algorithme d'allocation", type: "choix", options: algos_du_role(ctx.algos, "allocation"), valeur: brut.bleu.conduite.allocation, modifications: (v) => ({"bleu.conduite.allocation": v})},
      {libelle: "Algorithme de pistage", type: "choix", options: algos_du_role(ctx.algos, "pistage"), valeur: brut.bleu.conduite.pistage, modifications: (v) => ({"bleu.conduite.pistage": v})},
      nombre("Délai de réaction (s)", "bleu.conduite.delai_reaction_s", brut.bleu.conduite.delai_reaction_s),
      controle_moyens(brut, "conduite", ctx.index),
    ]};
  }
  const c = brut.bleu.reseau.centres[k];
  return {titre: c.nom, noeud: `centre:${k}`, controles: [
    {libelle: "Nom", type: "texte", valeur: c.nom, modifications: (v) => ({[`bleu.reseau.centres.${k}.nom`]: v})},
    {libelle: "Algorithme d'allocation", type: "choix", options: [{valeur: "", libelle: "celui du CDC principal"}, ...algos_du_role(ctx.algos, "allocation")], valeur: c.allocation ?? "",
      modifications: (v) => ({[`bleu.reseau.centres.${k}`]: (({allocation: _a, ...reste}) => (v ? {...reste, allocation: v} : reste))(c)})},
    controle_moyens(brut, `centre:${k}`, ctx.index),
  ]};
}

/**
 * Rendre les fiches des éléments sélectionnés `cles` : une par unité, une par groupe de vecteurs touché (au plus
 * quatre). Chaque fiche : {titre, noeud? (nœud réseau, pour ses connexions), note?, controles: [{libelle, type, options?, valeur, modifications(v)}]}.
 * `ctx` : {index (unites/index.json), algos (algos/index.json), nom(id)}.
 */
export function fiches(cles, monde, brut, ctx) {
  const groupes = new Set();
  const liste = [];
  for (const cle of cles) {
    const [type, n] = cle.split(":");
    const i = Number(n);
    if (type === "radar") liste.push(fiche_radar(monde, brut, i, ctx));
    else if (type === "batterie") liste.push(fiche_batterie(monde, brut, i, ctx));
    else if (type === "conduite") liste.push(fiche_centre(monde, brut, null, ctx));
    else if (type === "centre") liste.push(fiche_centre(monde, brut, i, ctx));
    else if (type === "cible") liste.push({titre: `Site C${i + 1}`, noeud: `sol:${i}`, note: "Ses postes sol communs forment le nœud réseau « postes de C" + (i + 1) + " ».", controles: [controle_moyens(brut, `sol:${i}`, ctx.index)]});
    else if (type === "liaison") {
      const l = brut.bleu.reseau.liaisons[i];
      liste.push({titre: "Liaison", controles: [{libelle: "Moyen", type: "choix", options: parmi(ctx.index, ["liaisons/"]), valeur: l.moyen, modifications: (v) => ({[`bleu.reseau.liaisons.${i}.moyen`]: v})}]});
    } else if (type === "avion") {
      const g = monde.scenario.avions.indexOf(monde.avions[i].groupe);
      if (!groupes.has(g)) liste.push(fiche_groupe(monde, brut, g, ctx));
      groupes.add(g);
    }
  }
  return liste.slice(0, 4);
}

/**
 * Rendre vrai si la fiche `affichee` ne reflète plus l'état `courante`, tous deux {signature, monde}. Le monde se
 * reconstruit après la modification : sans comparer le monde, la fiche resterait figée sur l'ancien.
 */
export const fiche_perimee = (affichee, courante) => affichee?.signature !== courante.signature || affichee.monde !== courante.monde;
