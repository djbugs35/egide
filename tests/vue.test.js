import {test} from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {creer_camera, deplacer, longueur_ronde, vers_ecran, vers_monde, zoomer} from "../src/vue/camera.js";
import {format_distance, format_duree, format_intervalle} from "../src/vue/format.js";
import {pas_rond} from "../src/vue/graphique.js";

const CAMERA = creer_camera(800, 600, 300_000);

test("caméra : le centre du monde tombe au centre du canevas, nord en haut", () => {
  assert.deepEqual(vers_ecran(CAMERA, {x: 0, y: 0}), {x: 400, y: 300});
  assert.ok(vers_ecran(CAMERA, {x: 0, y: 100_000}).y < 300);
});
test("caméra : écran → monde est l'inverse de monde → écran", () => {
  const point = {x: 12_345, y: -67_890};
  const retour = vers_monde(CAMERA, vers_ecran(CAMERA, point));
  assert.ok(Math.abs(retour.x - point.x) < 1e-6 && Math.abs(retour.y - point.y) < 1e-6);
});
test("caméra : le zoom garde fixe le point sous le curseur", () => {
  const curseur = {x: 120, y: 450};
  const avant = vers_monde(CAMERA, curseur);
  const apres = vers_monde(zoomer(CAMERA, 2.5, curseur), curseur);
  assert.ok(Math.abs(avant.x - apres.x) < 1e-6 && Math.abs(avant.y - apres.y) < 1e-6);
});
test("caméra : glisser vers la droite montre ce qui était à gauche", () => {
  assert.ok(deplacer(CAMERA, 100, 0).centre.x < 0);
});
test("caméra : la barre d'échelle prend une longueur ronde", () => {
  assert.ok([1, 2, 5].includes(longueur_ronde(1 / CAMERA.echelle, 120) / 10 ** Math.floor(Math.log10(longueur_ronde(1 / CAMERA.echelle, 120)))));
});

test("format : durées en minutes:secondes", () => {
  assert.equal(format_duree(725.4), "12:05");
  assert.equal(format_duree(-3), "0:00");
});
test("format : distances en m sous le km, en km au-delà", () => {
  assert.equal(format_distance(800), "800 m");
  assert.equal(format_distance(12_500), "12,5 km");
});
test("format : moyenne et intervalle de confiance à la française", () => {
  assert.equal(format_intervalle({moyenne: 187.24, ic95: 10.51}), "187,2 ± 10,5");
});

test("graphique : graduations rondes, 4 à 8 intervalles", () => {
  for (const maximum of [7, 712.8, 1000, 3.2, 58_000]) {
    const pas = pas_rond(maximum);
    const intervalles = Math.ceil(maximum / pas);
    assert.ok(intervalles >= 2 && intervalles <= 8, `${maximum} → pas ${pas}`);
    assert.ok([1, 2, 5].includes(Math.round(pas / 10 ** Math.floor(Math.log10(pas)))), `${pas}`);
  }
});

import {projeter} from "../src/vue/camera.js";
import {aide_chemin, valeur_effective} from "../src/vue/chemins.js";
import {direct, geo_deg} from "../src/moteur/geodesie.js";
import {FICHIERS, REFERENCE} from "./aide_scenario.js";

test("projection : la distance au centre est conservée à 0,5 % près jusqu'à 300 km", () => {
  const origine = geo_deg(47, 2.5);
  for (const azimut of [0, 1, 2.5, 4]) {
    const point = direct(origine, azimut, 300_000);
    const plan = projeter(origine, point);
    assert.ok(Math.abs(Math.hypot(plan.x, plan.y) - 300_000) < 1500);
  }
});
test("projection : le nord est en haut, l'est à droite", () => {
  const origine = geo_deg(47, 2.5);
  assert.ok(projeter(origine, direct(origine, 0, 10_000)).y > 9_000);
  assert.ok(projeter(origine, direct(origine, Math.PI / 2, 10_000)).x > 9_000);
});
test("chemins : une surcharge absente affiche la valeur de l'unité, une présente l'emporte", () => {
  assert.equal(valeur_effective(REFERENCE, FICHIERS, "rouge.surcharges.vitesse_kmh"), 800);
  assert.equal(valeur_effective(REFERENCE, FICHIERS, "bleu.avions.0.surcharges_emport.portee_km"), 8);
  assert.equal(valeur_effective(REFERENCE, FICHIERS, "bleu.avions.1.nombre"), 30);
});
test("chemins : l'aide vient du scénario, d'un tableau du scénario ou du fichier d'unité", () => {
  assert.match(aide_chemin(REFERENCE, FICHIERS, "rouge.concentration_max"), /meme cible/);
  assert.match(aide_chemin(REFERENCE, FICHIERS, "bleu.avions.1.nombre"), /groupe/);
  assert.match(aide_chemin(REFERENCE, FICHIERS, "bleu.avions.1.surcharges_emport.duree_designation_s"), /designation/);
});

import {bornes_disque, style_carte} from "../src/vue/carte_style.js";

const SOURCES = Object.fromEntries(
  JSON.parse(readFileSync(new URL("../cartes/index.json", import.meta.url))).map(({id}) => [id, JSON.parse(readFileSync(new URL(`../cartes/${id}.json`, import.meta.url)))]),
);

test("carte : le style empile fond, ombrage et bâtiments selon les réglages, avec leurs attributions", () => {
  const style = style_carte(SOURCES, {fond: "fonds/osm", ombrage: true, relief_3d: false, batiments: true, globe: false});
  assert.deepEqual(style.layers.map((c) => c.id), ["fond-uni", "fond", "ombrage", "batiments"]);
  assert.match(style.sources.fond.attribution, /OpenStreetMap/);
  assert.equal(style.terrain, undefined);
  assert.equal(style.projection.type, "mercator");
});
test("carte : fond « aucun » et globe — rien à télécharger pour le fond, projection globe", () => {
  const style = style_carte(SOURCES, {fond: "fonds/aucun", ombrage: false, relief_3d: true, batiments: false, globe: true});
  assert.equal(style.sources.fond, undefined);
  assert.equal(style.terrain.source, "relief_3d");
  assert.equal(style.projection.type, "globe");
});
test("carte : les bornes du disque de 200 km encadrent le centre et s'élargissent en longitude avec la latitude", () => {
  const [[o, s], [e, n]] = bornes_disque(geo_deg(47, 2.5), 200_000);
  assert.ok(o < 2.5 && e > 2.5 && s < 47 && n > 47);
  const [[o2], [e2]] = bornes_disque(geo_deg(65, 2.5), 200_000);
  assert.ok(e2 - o2 > e - o);
});

import {barycentre, dans_rectangle, element_sous, en_degres, modifications_ajout_cible, modifications_ajout_passage, modifications_deplacement, modifications_suppression, translater} from "../src/vue/edition.js";
import {creer_monde} from "../src/moteur/monde.js";
import {inverse} from "../src/moteur/geodesie.js";
import {REGISTRE, scenario} from "./aide_scenario.js";

const MONDE = creer_monde(scenario(), {registre: REGISTRE});

test("édition : une translation garde distance et azimut par rapport au point de référence", () => {
  const de = geo_deg(47, 2.5), vers = geo_deg(48, 3), point = direct(de, 1, 20_000);
  const deplace = translater(point, de, vers);
  assert.ok(Math.abs(inverse(vers, deplace).distance - 20_000) < 1e-3);
});
test("édition : le barycentre de deux points symétriques est le milieu", () => {
  const b = barycentre([geo_deg(47, 2), geo_deg(47, 3)]);
  assert.ok(Math.abs(b.lon - (2.5 * Math.PI) / 180) < 1e-9);
});
test("édition : déplacer une cible fige toutes les cibles et ne bouge qu'elle", () => {
  const de = MONDE.cibles[2].geo;
  const vers = direct(de, 0, 10_000);
  const m = modifications_deplacement(MONDE, REFERENCE, ["cible:2"], de, vers);
  assert.equal(m["theatre.cibles_placees"].length, MONDE.cibles.length);
  assert.deepEqual(m["theatre.cibles_placees"][0], en_degres(MONDE.cibles[0].geo));
  assert.ok(Math.abs(m["theatre.cibles_placees"][2].lat_deg - en_degres(vers).lat_deg) < 1e-6);
  assert.equal(Object.keys(m).some((k) => k.startsWith("bleu")), false);
});
test("édition : déplacer un avion fige les orbites de son seul groupe", () => {
  const avion = MONDE.avions[25];
  const m = modifications_deplacement(MONDE, REFERENCE, [`avion:${avion.id}`], avion.orbite, direct(avion.orbite, 1, 5_000));
  assert.deepEqual(Object.keys(m), ["bleu.avions.1.orbites_placees"]);
  assert.equal(m["bleu.avions.1.orbites_placees"].length, 30);
});
test("édition : ajouter une cible, un point de passage ; supprimer en gardant au moins une cible", () => {
  assert.equal(modifications_ajout_cible(MONDE, geo_deg(47, 2.5))["theatre.cibles_nombre"], MONDE.cibles.length + 1);
  const passage = modifications_ajout_passage(REFERENCE, geo_deg(49, 1));
  assert.equal(passage["rouge.tactique"], "plan_de_vol");
  assert.deepEqual(passage["rouge.plan_de_vol"], [{lat_deg: 49, lon_deg: 1}]);
  const toutes = MONDE.cibles.map((_, i) => `cible:${i}`);
  assert.deepEqual(modifications_suppression(MONDE, REFERENCE, toutes), {});
  assert.equal(modifications_suppression(MONDE, REFERENCE, ["cible:0"])["theatre.cibles_nombre"], MONDE.cibles.length - 1);
});
test("édition : sélection au rectangle et au clic, dans le repère écran", () => {
  const elements = [{cle: "a", geo: {x: 10, y: 10}}, {cle: "b", geo: {x: 50, y: 80}}];
  const versEcran = (g) => g;
  assert.deepEqual(dans_rectangle(elements, versEcran, {x0: 60, y0: 90, x1: 0, y1: 0}), ["a", "b"]);
  assert.deepEqual(dans_rectangle(elements, versEcran, {x0: 0, y0: 0, x1: 20, y1: 20}), ["a"]);
  assert.equal(element_sous(elements, versEcran, {x: 52, y: 77}).cle, "b");
  assert.equal(element_sous(elements, versEcran, {x: 200, y: 200}), null);
});

import {elements_editables, modifications_ajout_zone, modifications_ordre} from "../src/vue/edition.js";

test("édition : une zone s'ajoute, se sélectionne par son barycentre, se déplace d'un bloc et se supprime", () => {
  const points = [geo_deg(47.2, 2.2), geo_deg(47.2, 2.8), geo_deg(46.8, 2.5)];
  const ajout = modifications_ajout_zone(REFERENCE, points);
  assert.equal(ajout["theatre.zones"][0].type, "protegee");
  const brut = {...REFERENCE, theatre: {...REFERENCE.theatre, zones: ajout["theatre.zones"]}};
  const zone = elements_editables(MONDE, brut).find((e) => e.cle === "zone:0");
  const vers = direct(zone.geo, 0, 20_000);
  const deplacee = modifications_deplacement(MONDE, brut, ["zone:0"], zone.geo, vers)["theatre.zones"][0];
  assert.ok(deplacee.points.every((p, i) => p.lat_deg > ajout["theatre.zones"][0].points[i].lat_deg));
  assert.deepEqual(modifications_suppression(MONDE, brut, ["zone:0"])["theatre.zones"], []);
});
test("ordres : en mode ordres, avions et éléments du réseau seulement ; l'ordre porte l'instant et les numéros", () => {
  assert.ok(elements_editables(MONDE, REFERENCE, "ordres").every((e) => ["avion", "radar", "conduite", "liaison"].includes(e.type)));
  const monde = {...MONDE, t: 412.5};
  const m = modifications_ordre(REFERENCE, monde, ["avion:3", "avion:7", "cible:1"], geo_deg(47.5, 2));
  assert.deepEqual(m["bleu.ordres"], [{t_s: 412.5, avions: [3, 7], lat_deg: 47.5, lon_deg: 2}]);
  assert.deepEqual(modifications_ordre(REFERENCE, monde, ["cible:1"], geo_deg(47.5, 2)), {});
});

import {altitude_terrarium, echantillonner_chemin, tuile_de} from "../src/vue/relief.js";

test("relief : décodage terrarium — (128, 0, 0) vaut le niveau de la mer, (130, 196, 128) vaut 708,5 m", () => {
  assert.equal(altitude_terrarium(128, 0, 0), 0);
  assert.equal(altitude_terrarium(130, 196, 128), 708.5);
});
test("relief : tuile et pixel Web Mercator — (0°, 0°) au coin de la tuile centrale, Paris en tuile (518, 352) au zoom 10", () => {
  assert.deepEqual(tuile_de(geo_deg(0, 0), 1), {x: 1, y: 1, px: 0, py: 0});
  const paris = tuile_de(geo_deg(48.8566, 2.3522), 10);
  assert.deepEqual([paris.x, paris.y], [518, 352]);
});
test("relief : l'échantillonnage d'un chemin couvre toute sa longueur et marque chaque point de passage", () => {
  const points = [geo_deg(47, 1), direct(geo_deg(47, 1), 1, 50_000)];
  points.push(direct(points[1], 2.5, 30_000));
  const e = echantillonner_chemin(points, 1_000);
  // Vincenty direct puis inverse : cohérents au dixième de millimètre près, pas au-delà.
  assert.ok(Math.abs(e.at(-1).distance - 80_000) < 1e-3);
  assert.deepEqual(e.filter((x) => x.passage !== null).map((x) => x.passage), [0, 1, 2]);
});

import {echapper, fiche_algo, fiche_unite, utilisations} from "../src/vue/fiches.js";
import {origine_des_cles, unite_brute} from "../src/moteur/catalogue.js";

test("fiches : chaque paramètre d'une unité est attribué à l'ancêtre qui le fixe", () => {
  const origines = origine_des_cles("vecteurs/avions/turbopropulseur_ir_notionnel", FICHIERS);
  assert.equal(origines.vitesse_mise_a_poste_kmh, "vecteurs/avions/_avion");
  assert.equal(origines.emport, "vecteurs/avions/turbopropulseur_ir_notionnel");
  assert.equal(origines.fidelite, "_unite");
});
test("fiches : la fiche d'unité montre lignée, sources, paramètres hérités et algorithmes, texte échappé", () => {
  const html = fiche_unite("vecteurs/avions/turbopropulseur_ir_notionnel", FICHIERS, {"global/mouvement/croisiere_geodesique": REGISTRE["global/mouvement/croisiere_geodesique"].meta});
  for (const attendu of ["Lignée", "Sources", "vitesse_mise_a_poste_kmh", "500 km/h", "Croisière géodésique", "unites/vecteurs/avions/turbopropulseur_ir_notionnel.json"]) assert.ok(html.includes(attendu), attendu);
  assert.equal(echapper('<script>"'), "&lt;script&gt;&quot;");
});
test("fiches : la fiche d'algorithme montre équations, hypothèses, références, code et utilisateurs", () => {
  const unites = Object.fromEntries(Object.keys(FICHIERS).map((id) => [id, unite_brute(id, FICHIERS)]));
  const usages = utilisations(unites, REFERENCE);
  assert.ok(usages["global/allocation/densite_pistes"].some((u) => u.reglage === "bleu.conduite.allocation"));
  const html = fiche_algo("global/tir_sol/cadence_par_passage", REGISTRE["global/tir_sol/cadence_par_passage"].meta, usages["global/tir_sol/cadence_par_passage"], FICHIERS);
  for (const attendu of ["Équations", "cadence = (r_sol / v_drone) / engagements_par_passage", "Hypothèses", "Domaine de validité", "algos/global/tir_sol/cadence_par_passage.js", "Poste sol-air"]) assert.ok(html.includes(attendu), attendu);
});

import {inspection, tirs_subis} from "../src/vue/inspecteur.js";
import {simuler} from "../src/moteur/monde.js";

const RAID = simuler(scenario({"rouge.nombre": 300, "rouge.concentration_max": 100}), {registre: REGISTRE});

test("inspecteur : un avion affecté explique son choix — piste, score, délai, alternatives", () => {
  const avion = RAID.avions.find((a) => a.decision?.point);
  const html = inspection({type: "avion", id: avion.id}, RAID);
  for (const attendu of ["Pourquoi va-t-il là ?", "Score = effectif / (1 + avions déjà envoyés là)", "pistes atteignables", "catalogue.html#unite/"]) assert.ok(html.includes(attendu), attendu);
  const {retenue, alternatives} = avion.decision.explication;
  assert.ok(alternatives.every((a) => a.score <= retenue.score), "la piste retenue a le meilleur score");
});
test("inspecteur : la survie d'un drone vaut le produit des (1 − Pk) de ses tirs, et la cause de sa perte est donnée", () => {
  const drone = RAID.drones.find((d) => !d.vivant);
  const {tirs, survie, detruit_par} = tirs_subis(RAID, drone.id);
  assert.ok(tirs.length >= 1 && detruit_par);
  assert.ok(Math.abs(survie - tirs.reduce((p, t) => p * (1 - t.pk), 1)) < 1e-12);
  assert.ok(inspection({type: "drone", id: drone.id}, RAID).includes("Probabilité de survivre"));
});
test("inspecteur : une cible explique sa défense — bulle, cadence, Pk", () => {
  const html = inspection({type: "cible", id: 0}, RAID);
  for (const attendu of ["Comment est-elle défendue ?", "un tir toutes les", "Pk 0,7"]) assert.ok(html.includes(attendu), attendu);
});

import {modifications_ajout_radar} from "../src/vue/edition.js";
import {positions_radars, sites_frontiere} from "../src/moteur/radars.js";
import {CALQUES, calques_par_defaut, element_visible, lire_calques, memoriser_calques} from "../src/vue/calques.js";
import {trouver_sous_curseur} from "../src/vue/scope.js";
import {ecran} from "../src/vue/ecran.js";

test("radars : la couverture frontière se matérialise en radars espacés de √3 d au plus, sur la frontière", () => {
  const s = scenario();
  const sites = sites_frontiere(s);
  assert.ok(sites.length >= 3);
  const rayon = s.theatre.zone_rayon;
  for (const site of sites) assert.ok(Math.abs(inverse(s.theatre.origine, site).distance - rayon) < 1);
  const ecart = inverse(sites[0], sites[1]).distance;
  const portee = Math.min(s.radar.portee_max, 4124 * (Math.sqrt(s.radar.hauteur_antenne) + Math.sqrt(s.rouge.altitude)));
  assert.ok(ecart <= Math.sqrt(3) * portee * 1.001, `${ecart} > √3 × ${portee}`);
  assert.equal(positions_radars(s), positions_radars(s), "calculées une fois par scénario");
});

test("éditeur : déplacer, ajouter ou supprimer un radar inscrit tous les radars comme sites placés", () => {
  const radars = elements_editables(MONDE, REFERENCE).filter((e) => e.type === "radar");
  assert.equal(radars.length, sites_frontiere(MONDE.scenario).length);
  const vers = direct(radars[0].geo, 0, 20_000);
  const deplace = modifications_deplacement(MONDE, REFERENCE, ["radar:0"], radars[0].geo, vers);
  assert.equal(deplace["bleu.radar.disposition"], "sites");
  assert.equal(deplace["bleu.radar.sites"].length, radars.length);
  assert.ok(inverse(geo_deg(deplace["bleu.radar.sites"][0].lat_deg, deplace["bleu.radar.sites"][0].lon_deg), vers).distance < 1);
  assert.deepEqual(deplace["bleu.radar.sites"][1], en_degres(radars[1].geo), "les autres ne bougent pas");
  const ajout = modifications_ajout_radar(MONDE, MONDE.scenario.theatre.origine);
  assert.equal(ajout["bleu.radar.sites"].length, radars.length + 1);
  const moins = modifications_suppression(MONDE, REFERENCE, ["radar:2"]);
  assert.equal(moins["bleu.radar.sites"].length, radars.length - 1);
  assert.deepEqual(modifications_suppression(MONDE, REFERENCE, radars.map((r) => r.cle))["bleu.radar.sites"], [], "on peut ôter tous les radars");
  const places = creer_monde(scenario(ajout), {registre: REGISTRE});
  assert.equal(positions_radars(places.scenario).length, radars.length + 1);
});

test("calques : tout visible par défaut, mémoire protégée, masqué = ni survolé ni sélectionné", () => {
  assert.ok(CALQUES.every((c) => calques_par_defaut()[c.id] === (c.defaut !== false)));
  assert.deepEqual(lire_calques(null), calques_par_defaut());
  const casse = {getItem: () => { throw new Error("refus"); }, setItem: () => { throw new Error("refus"); }};
  assert.deepEqual(lire_calques(casse), calques_par_defaut());
  assert.equal(memoriser_calques(calques_par_defaut(), casse), false);
  const memoire = new Map();
  const stockage = {getItem: (k) => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, v)};
  memoriser_calques({...calques_par_defaut(), radars: false}, stockage);
  assert.equal(lire_calques(stockage).radars, false);
  const sans = {...calques_par_defaut(), radars: false, avions_ir: false};
  assert.equal(element_visible(sans, {type: "radar"}), false);
  assert.equal(element_visible(sans, {type: "avion", guidage: "ir"}), false);
  assert.equal(element_visible(sans, {type: "avion", objet: {guidage: "laser"}}), true);
  const camera = creer_camera(800, 800, 250_000, MONDE.scenario.theatre.origine);
  const radar = positions_radars(MONDE.scenario)[0];
  const p = ecran(camera, radar);
  assert.equal(trouver_sous_curseur(camera, MONDE, p)?.type, "radar");
  assert.notEqual(trouver_sous_curseur(camera, MONDE, p, sans)?.type, "radar");
});

import {modifications_ajout_liaison, modifications_reseau_complet, noeud_element} from "../src/vue/edition.js";
import {modifier_scenario} from "../src/moteur/scenario.js";
import {liaisons_par_defaut, libelle_noeud, position_noeud} from "../src/vue/reseau_vue.js";
import {inspection as inspecter_entite} from "../src/vue/inspecteur.js";

test("réseau dans l'éditeur : une liaison depuis le réseau complet le matérialise, puis s'y ajoute", () => {
  const radars = positions_radars(MONDE.scenario).length;
  const defaut = liaisons_par_defaut(MONDE);
  const defendues = new Set(MONDE.postes.map((p) => p.cible)).size;
  const groupes = MONDE.scenario.avions.filter((g) => g.nombre > 0).length;
  assert.equal(defaut.length, radars + groupes + defendues, "radars, groupes non vides et postes sol reliés au CDC");
  const avion = elements_editables(MONDE, REFERENCE).find((e) => e.type === "avion");
  assert.match(noeud_element(MONDE, avion), /^avions:\d$/);
  const ajout = modifications_ajout_liaison(MONDE, REFERENCE, "radar:0", "avions:1", "liaisons/satellite_notionnelle");
  assert.equal(ajout["bleu.reseau.mode"], "liaisons");
  assert.equal(ajout["bleu.reseau.liaisons"].length, defaut.length + 1);
  assert.deepEqual(modifications_ajout_liaison(MONDE, REFERENCE, "conduite", "conduite", "x"), {});
  // Relier deux nœuds déjà reliés change le moyen au lieu de doubler la liaison.
  const remplace = modifications_ajout_liaison(MONDE, REFERENCE, "conduite", "radar:0", "liaisons/radio_vhf_uhf_notionnelle");
  assert.equal(remplace["bleu.reseau.liaisons"].length, defaut.length);
  assert.deepEqual(modifications_reseau_complet(), {"bleu.reseau.mode": "complet", "bleu.reseau.liaisons": []});
  assert.equal(libelle_noeud(MONDE, "radar:2"), "R3");
  assert.ok(position_noeud(MONDE, "avions:0"));
});

test("réseau dans l'éditeur : liaisons sélectionnables, supprimables ; ôter un radar renumérote ses liaisons", () => {
  const brut = modifier_scenario(REFERENCE, modifications_ajout_liaison(MONDE, REFERENCE, "radar:0", "avions:1", "liaisons/satellite_notionnelle"));
  const monde = creer_monde(scenario(modifications_ajout_liaison(MONDE, REFERENCE, "radar:0", "avions:1", "liaisons/satellite_notionnelle")), {registre: REGISTRE});
  const liaisons = elements_editables(monde, brut).filter((e) => e.type === "liaison");
  assert.equal(liaisons.length, brut.bleu.reseau.liaisons.length);
  const sans = modifications_suppression(monde, brut, ["liaison:0"]);
  assert.equal(sans["bleu.reseau.liaisons"].length, liaisons.length - 1);
  const sansR1 = modifications_suppression(monde, brut, ["radar:0"])["bleu.reseau.liaisons"];
  assert.ok(sansR1.every((l) => l.de !== "radar:0" || l.vers === "conduite"), "R2 devient radar:0");
  assert.equal(sansR1.filter((l) => l.vers === "avions:1" && l.de.startsWith("radar")).length, 0, "la liaison de R1 disparaît");
  assert.equal(sansR1.filter((l) => l.de.startsWith("radar:")).length, positions_radars(monde.scenario).length - 1);
  const vers = direct(monde.scenario.reseau.centre, 0, 30_000);
  const deplace = modifications_deplacement(monde, brut, ["conduite"], monde.scenario.reseau.centre, vers);
  assert.ok(inverse(geo_deg(deplace["bleu.reseau.centre_lat_deg"], deplace["bleu.reseau.centre_lon_deg"]), vers).distance < 1);
  assert.match(inspecter_entite({type: "conduite", id: 0}, monde), /Liaisons au sol/);
  assert.match(inspecter_entite({type: "radar", id: 0}, monde), /arrivent en/);
});

test("survol du centre de conduite : l'entité trouvée porte sa position, comme les autres", () => {
  const camera = creer_camera(800, 800, 250_000, MONDE.scenario.theatre.origine);
  const sans = {...calques_par_defaut(), cibles: false};
  const touche = trouver_sous_curseur(camera, MONDE, ecran(camera, MONDE.scenario.reseau.centre), sans);
  assert.equal(touche.type, "conduite");
  assert.ok(touche.objet.geo && Number.isFinite(touche.objet.geo.lat));
});

import {modifications_panne} from "../src/vue/edition.js";
import {connu_du_pc, pistes_connues, resume_situation} from "../src/vue/situation.js";
import {avancer_monde, simuler as simuler_raid} from "../src/moteur/monde.js";

test("en cours de raid : mettre hors service radars, CDC et liaisons ; les avions ne se mettent pas en panne", () => {
  const monde = creer_monde(scenario(), {registre: REGISTRE});
  for (let i = 0; i < 600; i++) avancer_monde(monde);
  assert.ok(elements_editables(monde, REFERENCE, "ordres").some((e) => e.type === "radar"));
  const mods = modifications_panne(REFERENCE, monde, ["radar:3", "conduite", "avion:2", "cible:0"]);
  assert.deepEqual(mods["bleu.reseau.pannes"], [{t_s: monde.t, element: "radar:3", duree_s: null}, {t_s: monde.t, element: "conduite", duree_s: null}]);
  assert.deepEqual(modifications_panne(REFERENCE, monde, ["avion:2"]), {});
  const rejoue = simuler_raid(scenario(mods), {registre: REGISTRE, journal: false});
  assert.ok(rejoue.reseau.conduite_hs && rejoue.reseau.radars_hs[3]);
});

test("vue du CDC : seuls les drones connus de la conduite, regroupés en pistes", () => {
  const monde = creer_monde(scenario({"bleu.reseau.pannes": [{t_s: 0, element: "conduite", duree_s: null}]}), {registre: REGISTRE});
  for (let i = 0; i < 1200; i++) avancer_monde(monde);
  assert.ok(monde.drones.some((d) => d.detection !== null), "les radars voient");
  assert.equal(resume_situation(monde).connus, 0, "mais le CDC détruit ne sait rien");
  const vivant = creer_monde(scenario(), {registre: REGISTRE});
  for (let i = 0; i < 1200; i++) avancer_monde(vivant);
  const s = resume_situation(vivant);
  assert.ok(s.connus > 0 && s.pistes > 0 && s.pistes <= s.connus);
  assert.equal(pistes_connues(vivant).reduce((n, p) => n + p.effectif, 0), s.connus);
  assert.ok(vivant.drones.filter((d) => connu_du_pc(vivant, d)).every((d) => d.connu <= vivant.t));
});

import {chaine_drone, lignes_journal} from "../src/vue/journal.js";

test("journal de l'information : détections, transmissions, missions, réceptions, contacts et tirs, en phrases", () => {
  const liaisons = [
    ...Array.from({length: 10}, (_, i) => ({de: `radar:${i}`, vers: "conduite", moyen: i === 0 ? "liaisons/optique_notionnelle" : "liaisons/satellite_notionnelle"})),
    {de: "conduite", vers: "avions:0", moyen: "liaisons/satellite_notionnelle"}, {de: "conduite", vers: "avions:1", moyen: "liaisons/satellite_notionnelle"},
  ];
  const monde = simuler_raid(scenario({"rouge.nombre": 200, "rouge.concentration_max": 20, "rouge.tactique": "disperse", "bleu.reseau.mode": "liaisons", "bleu.reseau.liaisons": liaisons}), {registre: REGISTRE});
  const lignes = lignes_journal(monde);
  const textes = lignes.map((l) => l.texte).join("\n");
  assert.match(textes, /R\d+ voit .* le CDC le saura 3 s plus tard/);
  assert.match(textes, /R1 voit .*non relié au CDC/, "la liaison optique de R1 est hors de portée");
  assert.match(textes, /Le CDC envoie l'avion \d+ intercepter une piste de \d+ drones?, par le CDC ; il la recevra à/);
  assert.match(textes, /L'avion \d+ reçoit sa mission et part\./);
  assert.match(textes, /accroche le drone \d+ avec son propre capteur/);
  assert.match(textes, /tire sur le drone \d+ \(Pk 0,7\) : (détruit|manqué)/);
  assert.ok(lignes.every((l, i) => i === 0 || lignes[i - 1].t <= l.t), "dans l'ordre du temps");
  const abattu = monde.drones.find((d) => !d.vivant && d.connu !== null);
  const chaine = chaine_drone(monde, abattu.id).map((e) => e.texte).join("\n");
  assert.match(chaine, /Vu par R\d+\./);
  assert.match(chaine, /Connu du CDC, 3 s après\./);
  assert.match(chaine, /: détruit\./);
  const perdu = monde.drones.find((d) => d.detection !== null && d.connu === null);
  if (perdu) assert.match(chaine_drone(monde, perdu.id).map((e) => e.texte).join(" "), /Jamais connu du CDC/);
});

import {modifications_ajout_centre} from "../src/vue/edition.js";

test("CDC dans l'éditeur : ajouter, déplacer, relier aux postes d'une cible, supprimer en renumérotant", () => {
  const ajout = modifications_ajout_centre(REFERENCE, geo_deg(46.4, 2.5));
  assert.deepEqual(ajout["bleu.reseau.centres"], [{nom: "CDC 2", lat_deg: 46.4, lon_deg: 2.5}]);
  const brut1 = modifier_scenario(REFERENCE, ajout);
  const monde1 = creer_monde(scenario(ajout), {registre: REGISTRE});
  const centre = elements_editables(monde1, brut1).find((e) => e.type === "centre");
  assert.equal(noeud_element(monde1, centre), "centre:0");
  const cible = elements_editables(monde1, brut1).find((e) => e.type === "cible");
  assert.equal(noeud_element(monde1, cible), "sol:0");
  const relie = {...ajout, ...modifications_ajout_liaison(monde1, brut1, "centre:0", "sol:0", "liaisons/filaire_notionnelle")};
  assert.ok(relie["bleu.reseau.liaisons"].some((l) => l.de === "centre:0" && l.vers === "conduite"), "le réseau par défaut relie le nouveau centre au CDC");
  const brut2 = modifier_scenario(REFERENCE, relie);
  const monde2 = creer_monde(scenario(relie), {registre: REGISTRE});
  assert.ok(Number.isFinite(monde2.reseau.latences_sol[1][0]), "le CDC 2 joint les postes de C1");
  const vers = direct(centre.geo, 0, 10_000);
  const deplace = modifications_deplacement(monde2, brut2, ["centre:0"], centre.geo, vers);
  assert.ok(inverse(geo_deg(deplace["bleu.reseau.centres"][0].lat_deg, deplace["bleu.reseau.centres"][0].lon_deg), vers).distance < 1);
  const ote = modifications_suppression(monde2, brut2, ["centre:0"]);
  assert.deepEqual(ote["bleu.reseau.centres"], []);
  assert.ok(ote["bleu.reseau.liaisons"].every((l) => !l.de.startsWith("centre:") && !l.vers.startsWith("centre:")));
  assert.match(inspecter_entite({type: "centre", id: 0}, monde2), /Postes désignés/);
});

import {enregistrer_dans_bibliotheque, lire_bibliotheque_locale} from "../src/vue/bibliotheque.js";
import {decrire_strategie, duree_lisible} from "../src/vue/autoconfig_panneau.js";

test("bibliothèque du navigateur : protégée si la mémoire manque ; stratégies décrites en clair", () => {
  const casse = {getItem: () => { throw new Error("refus"); }, setItem: () => { throw new Error("refus"); }};
  assert.deepEqual(lire_bibliotheque_locale(casse), {});
  assert.equal(enregistrer_dans_bibliotheque("x", {}, casse), false);
  const memoire = new Map();
  const stockage = {getItem: (k) => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, v)};
  assert.ok(enregistrer_dans_bibliotheque("Auto — France", {nom: "a"}, stockage));
  assert.deepEqual(Object.keys(lire_bibliotheque_locale(stockage)), ["Auto — France"]);
  assert.match(decrire_strategie({uniforme: true}), /hasard/);
  assert.match(decrire_strategie({avions: 0.6, drones: 0.1, radars: 0.5}), /60 % .* 5 % .* poussés de 50 %/);
  assert.deepEqual([duree_lisible(44.6), duree_lisible(60), duree_lisible(190), duree_lisible(-3)], ["45 s", "1 min", "3 min 10 s", "0 s"]);
});

test("element_sous : à la même position, une unité passe avant le milieu d'une liaison", () => {
  // Radar et CDC colocalisés : le milieu de leur liaison, listé en dernier, prenait le clic et le CDC devenait inatteignable.
  const ici = {x: 50, y: 50};
  const elements = [{cle: "radar:4", type: "radar", geo: ici}, {cle: "centre:0", type: "centre", geo: ici}, {cle: "liaison:7", type: "liaison", geo: ici}];
  assert.equal(element_sous(elements, (geo) => geo, ici).cle, "centre:0");
  assert.equal(element_sous(elements.slice(2), (geo) => geo, ici).cle, "liaison:7", "seule à cet endroit, la liaison reste sélectionnable");
});
