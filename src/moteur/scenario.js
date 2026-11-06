// Scénario v2 : lecture, validation, modification par chemin, résolution en unités SI (MODELE § 9.1).
// Un scénario v1 (clés plates, format absent) est migré automatiquement.
import {CatalogueInvalide, unite_si} from "./catalogue.js";
import {geo_deg} from "./geodesie.js";
import {AIDE} from "./scenario_aide.js";
import {convertir_objet} from "./unites.js";

export const FORMAT = 2;
// Noms courts des comportements publics ; toute autre tactique est l'identifiant complet d'un algorithme.
export const TACTIQUES = {
  direct: "global/comportement/essaim_direct",
  disperse: "global/comportement/essaim_disperse",
  fourmi: "global/comportement/essaim_fourmi",
  plan_de_vol: "global/comportement/plan_de_vol",
};

// Noms courts des réactions publiques de l'essaim (MODELE § 22) ; null : l'essaim ne réagit pas.
export const REACTIONS = {adaptatif: "global/reaction/essaim_adaptatif"};
// Réglages de réaction par défaut (clés de fichier) : un scénario écrit avant le jalon 16 peut basculer en réactif.
export const DEFAUTS_REACTION = {
  reaction: null, reaction_delai_s: 2, reaction_pas_s: 5, reaction_rayon_danger_km: 10, reaction_seuil_pertes: 3,
  reaction_allongement_max: 0.3, reaction_seuil_gain: 0.2, reaction_reaffectations_max: 1, reaction_detours_max: 2,
  reaction_esquive_reduction: 0.3, reaction_esquive_perte_vitesse: 0.3,
};

/** Rendre l'identifiant de l'algorithme de réaction (nom court ou identifiant complet), ou null. */
export const algo_reaction = (reaction) => (reaction ? REACTIONS[reaction] ?? reaction : null);

// Positions placées à la main ({lat_deg, lon_deg}) → positions géographiques en radians, à l'altitude donnée.
const vers_geo = (points, alt) => (points ?? []).map((p) => geo_deg(p.lat_deg, p.lon_deg, alt));

/** Rendre l'identifiant de l'algorithme de comportement d'une tactique (nom court ou identifiant complet). */
export const algo_tactique = (tactique) => TACTIQUES[tactique] ?? tactique;

export class ScenarioInvalide extends Error {}

const segments = (chemin) => chemin.split(".").map((s) => (/^\d+$/.test(s) ? Number(s) : s));

/** Rendre la valeur au `chemin` pointé (« bleu.avions.1.nombre ») de `brut`, ou undefined. */
export const lire_chemin = (brut, chemin) => segments(chemin).reduce((noeud, s) => noeud?.[s], brut);

/** Rendre une copie de `brut` où chaque chemin de `modifications` ({chemin: valeur}) porte sa nouvelle valeur. */
export function modifier_scenario(brut, modifications) {
  const copie = structuredClone(brut);
  for (const [chemin, valeur] of Object.entries(modifications)) {
    const [dernier, ...parents] = segments(chemin).reverse();
    const noeud = parents.reverse().reduce((n, s) => (n[s] ??= {}), copie);
    noeud[dernier] = valeur;
  }
  return copie;
}

function valider_aide(objet, chemin) {
  const aide = objet._aide ?? {};
  for (const [cle, valeur] of Object.entries(objet)) {
    if (cle.startsWith("_") || cle === "surcharges" || cle === "surcharges_emport") continue;
    if (!(cle in aide)) throw new ScenarioInvalide(`${chemin}${cle} : aucune phrase dans _aide`);
    if (Array.isArray(valeur)) {
      valeur.forEach((element, i) => {
        const sansAide = Object.keys(element).filter((k) => !k.startsWith("_") && !(`${cle}[].${k}` in aide));
        if (sansAide.length) throw new ScenarioInvalide(`${chemin}${cle}.${i} : clés sans phrase dans _aide : ${sansAide.join(", ")}`);
      });
    } else if (valeur && typeof valeur === "object") {
      valider_aide(valeur, `${chemin}${cle}.`);
    }
  }
}

/** Rendre le scénario en format v2, migré s'il est en v1. */
export const en_v2 = (brut) => (brut.format === FORMAT ? completer_aide(brut) : migrer_v1(brut));

/**
 * Rendre le scénario avec les phrases d'aide des clés apparues depuis qu'il a été écrit (déploiement, MODELE § 21) :
 * un scénario enregistré avant reste éditable. Rendu tel quel s'il ne lui manque rien.
 */
function completer_aide(brut) {
  const manque = (bloc, aide) => bloc?._aide && Object.keys(aide).some((k) => !(k in bloc._aide));
  const sections = ["sol", "radar", "reseau"].filter((s) => manque(brut.bleu?.[s], AIDE[s]));
  // Réaction de l'essaim (MODELE § 22) : ses clés sont apparues au jalon 16.
  const rouge = manque(brut.rouge, AIDE.rouge);
  if (!sections.length && !rouge) return brut;
  const copie = structuredClone(brut);
  for (const s of sections) copie.bleu[s]._aide = {...AIDE[s], ...copie.bleu[s]._aide};
  if (rouge) copie.rouge._aide = {...AIDE.rouge, ...copie.rouge._aide};
  return copie;
}

/** Rendre la liste des identifiants d'unités qu'un scénario cite directement. */
export function ids_unites(brut) {
  const v2 = en_v2(brut);
  const moyens = (v2.bleu.reseau?.liaisons ?? []).map((liaison) => liaison.moyen);
  const terrain = v2.theatre.terrain ? [v2.theatre.terrain] : [];
  // Déploiement (MODELE § 21) : unités propres des sites radar et des batteries, moyens dont chaque nœud est équipé.
  const propres = [...(v2.bleu.radar.sites ?? []), ...(v2.bleu.sol.batteries ?? [])].map((s) => s.unite).filter(Boolean);
  const equipements = (v2.bleu.reseau?.equipements ?? []).flatMap((e) => e.moyens);
  // Arme changée dans l'éditeur (dépôt d'un armement sur un avion) : elle n'est citée que par la surcharge du groupe.
  const emports = v2.bleu.avions.map((g) => g.surcharges?.emport).filter(Boolean);
  return [...new Set([v2.rouge.unite, ...v2.bleu.avions.map((g) => g.unite), ...emports, v2.bleu.sol.unite, v2.bleu.radar.unite, ...moyens, ...terrain, ...propres, ...equipements])];
}

function resoudre_avions(groupes, fichiers) {
  return groupes.map((groupe) => {
    const avion = unite_si(groupe.unite, fichiers, groupe.surcharges);
    const arme = unite_si(avion.emport, fichiers, groupe.surcharges_emport);
    return {...avion, nombre: groupe.nombre, altitude: groupe.altitude_m, orbites_placees: vers_geo(groupe.orbites_placees, groupe.altitude_m), arme};
  });
}

/** Algorithme de détection imposé par chaque disposition des radars (null : celui de l'unité). MODELE § 15.1. */
export const DISPOSITIONS_RADAR = {frontiere: null, sites: "global/detection/sites_radar"};

function resoudre_radar(radar, fichiers) {
  const unite = unite_si(radar.unite, fichiers, radar.surcharges);
  const disposition = radar.disposition ?? "frontiere";
  if (!(disposition in DISPOSITIONS_RADAR)) throw new ScenarioInvalide(`disposition des radars inconnue « ${disposition} » (${Object.keys(DISPOSITIONS_RADAR).join(", ")})`);
  // Un site peut citer sa propre unité ou ses surcharges (déploiement, MODELE § 21.1) : sa hauteur fixe celle du site.
  const propres = (radar.sites ?? []).map((s) => (s.unite || s.surcharges ? unite_si(s.unite || radar.unite, fichiers, s.surcharges) : null));
  const sites = (radar.sites ?? []).map((s, i) => vers_geo([s], (propres[i] ?? unite).hauteur_antenne)[0]);
  // Zéro site est permis (carte vidée dans l'éditeur) : personne ne détecte rien.
  const detection = DISPOSITIONS_RADAR[disposition] ?? unite.algos.detection;
  const resolu = {...unite, algos: {...unite.algos, detection}, disposition, sites};
  if (propres.some(Boolean)) resolu.sites_unites = propres.map((p) => p && {id: p.id, nom: p.nom, hauteur_antenne: p.hauteur_antenne, portee_max: p.portee_max, pays: p.pays, icone: p.icone});
  return resolu;
}

/**
 * Rendre les postes sol résolus : le dispositif commun (`nombre` postes répartis sur les cibles) et les batteries
 * placées une à une, chacune avec son unité (déploiement, MODELE § 21.2).
 */
function resoudre_sol(sol, fichiers) {
  const resolu = {...unite_si(sol.unite, fichiers, sol.surcharges), nombre: sol.nombre, munitions: sol.munitions};
  if ((sol.batteries ?? []).length) {
    resolu.batteries = sol.batteries.map((b) => ({geo: vers_geo([b], 0)[0], munitions: b.munitions, unite: unite_si(b.unite || sol.unite, fichiers, b.surcharges)}));
  }
  return resolu;
}

/** Modes du réseau d'information (MODELE § 15.2). */
export const MODES_RESEAU = ["complet", "liaisons"];

/**
 * Rendre vrai si `noeud` nomme un nœud du réseau : « conduite » (CDC principal), « centre:<k> » (k existant),
 * « radar:<i> », « avions:<g> » (g existant) ou « sol:<i> » (postes de la cible i).
 */
function noeud_valide(noeud, groupes, centres) {
  if (noeud === "conduite" || /^(radar|sol):\d+$/.test(noeud)) return true;
  if (/^avions:\d+$/.test(noeud)) return Number(noeud.slice(7)) < groupes;
  return /^centre:\d+$/.test(noeud) && Number(noeud.slice(7)) < centres;
}

function resoudre_reseau(reseau, theatre, groupes, fichiers) {
  const {mode = "complet", centre_lat_deg: lat = null, centre_lon_deg: lon = null, liaisons = [], pannes = [], conduite_ciblee = false, centres = []} = reseau ?? {};
  if (!MODES_RESEAU.includes(mode)) throw new ScenarioInvalide(`mode de réseau inconnu « ${mode} » (${MODES_RESEAU.join(", ")})`);
  for (const {de, vers} of liaisons) {
    for (const noeud of [de, vers]) if (!noeud_valide(noeud, groupes, centres.length)) throw new ScenarioInvalide(`liaison : nœud inconnu « ${noeud} »`);
    if (de === vers) throw new ScenarioInvalide(`liaison de « ${de} » vers lui-même`);
  }
  for (const {element} of pannes) {
    if (!(element === "conduite" || /^(radar|liaison|centre):\d+$/.test(element))) throw new ScenarioInvalide(`panne : élément inconnu « ${element} »`);
  }
  const centre = lat === null || lon === null ? geo_deg(theatre.origine_lat_deg, theatre.origine_lon_deg, 0) : geo_deg(lat, lon, 0);
  return {
    mode, centre, conduite_ciblee, centres: centres.map((c) => ({nom: c.nom, geo: geo_deg(c.lat_deg, c.lon_deg, 0), ...(c.allocation ? {allocation: c.allocation} : {})})), liaisons: liaisons.map(({de, vers, moyen}) => ({de, vers, moyen: unite_si(moyen, fichiers)})),
    // Pannes triées par instant ; fin null : définitive.
    pannes: pannes.map((p) => ({t: p.t_s, element: p.element, fin: p.duree_s === null || p.duree_s === undefined ? null : p.t_s + p.duree_s})).sort((a, b) => a.t - b.t),
  };
}

/**
 * Rendre le scénario résolu et figé, en unités SI, que consomme le moteur : chaque groupe porte les paramètres de
 * son unité (catalogue `fichiers`, voir charger_unites) et ses surcharges. Lève ScenarioInvalide sinon.
 */
export function resoudre_scenario(brutDonne, fichiers) {
  const brut = en_v2(brutDonne);
  valider_aide(brut, "");
  const {theatre, rouge, bleu, simulation} = brut;
  for (const zone of theatre.zones ?? []) {
    if (!["protegee", "annotation"].includes(zone.type)) throw new ScenarioInvalide(`zone « ${zone.nom} » : type inconnu « ${zone.type} »`);
    if ((zone.points ?? []).length < 3) throw new ScenarioInvalide(`zone « ${zone.nom} » : au moins trois sommets`);
  }
  if (!(rouge.tactique in TACTIQUES) && !rouge.tactique.includes("/")) {
    throw new ScenarioInvalide(`tactique inconnue « ${rouge.tactique} » (${Object.keys(TACTIQUES).join(", ")}, ou identifiant d'algorithme)`);
  }
  if (rouge.reaction && !(rouge.reaction in REACTIONS) && !rouge.reaction.includes("/")) {
    throw new ScenarioInvalide(`réaction inconnue « ${rouge.reaction} » (${Object.keys(REACTIONS).join(", ")}, null, ou identifiant d'algorithme)`);
  }
  try {
    const drone = unite_si(rouge.unite, fichiers, rouge.surcharges);
    const {unite: _u, surcharges: _s, plan_de_vol: plan, ...reglagesRouge} = rouge;
    const {cibles_placees: placees, zones, terrain, ...reglagesTheatre} = theatre;
    const ciblesPlacees = vers_geo(placees, 0);
    return structuredClone({
      nom: brut.nom,
      theatre: {
        origine: geo_deg(reglagesTheatre.origine_lat_deg, reglagesTheatre.origine_lon_deg, 0),
        zone_rayon: convertir_objet({zone_rayon_km: reglagesTheatre.zone_rayon_km}).zone_rayon,
        // Les cibles placées comptent toujours : le nombre de cibles ne descend pas sous leur nombre.
        cibles_nombre: Math.max(reglagesTheatre.cibles_nombre, ciblesPlacees.length),
        cibles_placees: ciblesPlacees,
        zones: (zones ?? []).map((zone) => ({nom: zone.nom, type: zone.type, points: vers_geo(zone.points, 0)})),
        terrain: terrain ? unite_si(terrain, fichiers) : null,
      },
      rouge: {
        ...drone, altitude: drone.altitude_croisiere, ...convertir_objet({...DEFAUTS_REACTION, ...reglagesRouge}),
        plan_de_vol: vers_geo(plan, drone.altitude_croisiere), comportement: algo_tactique(rouge.tactique),
        reaction: algo_reaction(rouge.reaction),
      },
      avions: resoudre_avions(bleu.avions, fichiers),
      sol: resoudre_sol(bleu.sol, fichiers),
      radar: resoudre_radar(bleu.radar, fichiers),
      conduite: convertir_objet(bleu.conduite),
      reseau: resoudre_reseau(bleu.reseau, reglagesTheatre, bleu.avions.length, fichiers),
      // Ordres triés par instant : le moteur les applique dans l'ordre, sans revenir en arrière.
      ordres: (bleu.ordres ?? []).map((o) => ({t: o.t_s, avions: o.avions, point: geo_deg(o.lat_deg, o.lon_deg, 0)})).sort((a, b) => a.t - b.t),
      simulation: convertir_objet(simulation),
    });
  } catch (erreur) {
    if (erreur instanceof CatalogueInvalide) throw new ScenarioInvalide(erreur.message);
    throw erreur;
  }
}

const DRONES_DEFENSIFS = ["vecteurs/drones_defensifs/drone_arme_notionnel", "vecteurs/drones_defensifs/intercepteur_kamikaze_notionnel", "vecteurs/drones_defensifs/brouilleur_notionnel"];

const UNITES_V1 = {
  drone: "vecteurs/drones/drone_reaction_notionnel",
  avion_ir: "vecteurs/avions/turbopropulseur_ir_notionnel",
  avion_laser: "vecteurs/avions/turbopropulseur_laser_notionnel",
  poste: "sites/postes/poste_sol_air_notionnel",
  radar: "capteurs/radars/radar_basse_altitude_notionnel",
};
// La v1 n'avait ni géographie ni altitude d'avion : centre de la France métropolitaine, avions à 1 000 m.
const ORIGINE_V1 = {lat: 47, lon: 2.5};
const ALTITUDE_AVIONS_V1 = 1000;

function groupe_v1(v1, unite, nombre) {
  return {
    unite,
    nombre,
    altitude_m: ALTITUDE_AVIONS_V1,
    surcharges: {
      vitesse_mise_a_poste_kmh: v1.avions_vitesse_kmh,
      vitesse_engagement_kmh: v1.avions_vitesse_engagement_kmh,
      facteur_charge_max_g: v1.avions_facteur_charge_max,
      emport_nombre: v1.avions_roquettes_par_avion,
    },
    surcharges_emport: {
      portee_km: v1.roquette_air_portee_km,
      pk: v1.roquette_air_pk,
      duree_designation_s: v1.laser_duree_designation_s,
      cadence_s: v1.ir_cadence_s,
    },
  };
}

/** Rendre le scénario v2 équivalent à un scénario v1 (clés plates de la v0.1), toutes valeurs reportées en surcharges. */
export function migrer_v1(v1) {
  const avions = [
    groupe_v1(v1, UNITES_V1.avion_ir, v1.avions_ir_nombre),
    groupe_v1(v1, UNITES_V1.avion_laser, v1.avions_nombre - v1.avions_ir_nombre),
    // La v1 n'avait pas de drones défensifs : leurs groupes sont vides, comme dans le scénario de référence.
    ...DRONES_DEFENSIFS.map((unite) => ({unite, nombre: 0, altitude_m: 300, surcharges: {}, surcharges_emport: {}})),
  ];
  return {
    _aide: AIDE.racine,
    format: FORMAT,
    nom: "Scénario migré depuis le format v1",
    theatre: {_aide: AIDE.theatre, origine_lat_deg: ORIGINE_V1.lat, origine_lon_deg: ORIGINE_V1.lon, zone_rayon_km: v1.zone_rayon_km, cibles_nombre: v1.cibles_nombre},
    rouge: {
      _aide: AIDE.rouge, unite: UNITES_V1.drone, nombre: v1.drones_nombre, tactique: v1.drones_tactique,
      concentration_max: v1.drones_concentration_max, etalement_s: v1.drones_etalement_s,
      fourmi_eclatement_rayon_km: v1.fourmi_eclatement_rayon_km, fourmi_largeur_couloir_km: v1.fourmi_largeur_couloir_km,
      surcharges: {vitesse_kmh: v1.drones_vitesse_kmh, altitude_croisiere_m: v1.drones_altitude_m},
    },
    bleu: {
      _aide: AIDE.bleu,
      avions,
      sol: {_aide: AIDE.sol, unite: UNITES_V1.poste, nombre: v1.sol_postes_nombre, munitions: v1.sol_roquettes_nombre + v1.sol_missiles_nombre,
        surcharges: {portee_km: v1.sol_portee_km, pk: v1.sol_pk, engagements_par_passage: v1.sol_engagements_par_passage}},
      radar: {_aide: AIDE.radar, unite: UNITES_V1.radar, surcharges: {hauteur_antenne_m: v1.radar_hauteur_antenne_m, portee_max_km: v1.radar_portee_max_km}, disposition: "frontiere", sites: []},
      conduite: {
        _aide: AIDE.conduite, delai_reaction_s: v1.delai_reaction_s, pas_decision_s: v1.avions_pas_decision_s,
        interception_profondeur_km: v1.interception_profondeur_km, pistage: "global/pistage/cellules", allocation: "global/allocation/densite_pistes",
      },
      reseau: {_aide: AIDE.reseau, mode: "complet", centre_lat_deg: null, centre_lon_deg: null, liaisons: [], conduite_ciblee: false, pannes: [], centres: []},
    },
    simulation: {_aide: AIDE.simulation, pas_s: v1.simulation_pas_s, graine: v1.graine},
  };
}
