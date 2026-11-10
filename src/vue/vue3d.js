// Vue Observer en 3D (jalon 14, MODELE § 23) : le raid sur le globe CesiumJS, à chaque unité sa vraie altitude.
// Cette vue n'affiche que ce que rend scene3d.js. CesiumJS (12 Mo) n'est chargé qu'à la première ouverture.
import {inverse, vers_degres} from "../moteur/geodesie.js";
import {consigne_camera} from "./cameras3d.js";
import {chemin_icone} from "../moteur/catalogue.js";
import {creer_couches3d} from "./couches3d.js";
import {COULEURS} from "./couleurs.js";
import {creer_modeles3d, lire_modeles_disponibles} from "./modeles3d.js";
import {pixels_tuile} from "./relief.js";
import {entites_scene, fenetre_tuile, grille_hauteurs, metres_par_pixel_tuile, ombrage_tuile} from "./scene3d.js";

const TAILLE_GRILLE = 65;
const COTE_TUILE = 256;
// Zoom 12 : environ 26 m par pixel en France, assez fin pour un versant ; au-delà, l'ombrage serait agrandi sans détail utile.
const NIVEAU_OMBRAGE_MAX = 12;
const TAILLE_ICONE = 30;
const INCLINAISON_CAMERA = -0.87;
// Plus près que ceci, un drone est dessiné en silhouette orientée ; plus loin, en point (MODELE § 23).
const SEUIL_SILHOUETTE = 80_000;
const TAILLE_SILHOUETTE = 20;
// Tiges de drones au plus : au-delà, un nuage de traits ne se lit plus (les vecteurs ont toujours la leur).
const TIGES_DRONES_MAX = 150;
// Maille (degrés) du cache d'altitude du sol, et son âge maximal en images : le relief s'affine en se chargeant.
const MAILLE_SOL_DEG = 0.01;
const VIE_CACHE_SOL = 180;
// En pause, on ne recalcule la scène qu'une image sur tant, pour suivre le relief qui se charge.
const PERIODE_SCENE_AU_REPOS = 30;
const RECUL_SUIVI = 12_000;
// Une unité à modèle détaillé se suit de près : à 12 km elle n'occupe que sa taille minimale à l'écran et sa peinture ne se voit pas.
const RECUL_SUIVI_MODELE = 70;
const INCLINAISON_SUIVI = -0.45;
// Regard légèrement relevé depuis un poste au sol : on voit arriver l'essaim au-dessus de l'horizon.
const INCLINAISON_POSTE = 0.08;
// Toujours visibles, même derrière une crête : c'est une vue de situation, pas un rendu réaliste.
const SANS_TEST_PROFONDEUR = Number.POSITIVE_INFINITY;

async function charger_cesium() {
  globalThis.CESIUM_BASE_URL = new URL("../../vendor/cesium/", import.meta.url).href;
  const feuille = Object.assign(document.createElement("link"), {rel: "stylesheet", href: `${globalThis.CESIUM_BASE_URL}Widgets/widgets.css`});
  document.head.append(feuille);
  return import("../../vendor/cesium/index.js");
}

const url_tuile = (relief, {z, x, y}) => relief.tuiles[0].replace("{z}", z).replace("{x}", x).replace("{y}", y);

function fournisseur_relief(Cesium, relief) {
  return new Cesium.CustomHeightmapTerrainProvider({
    width: TAILLE_GRILLE, height: TAILLE_GRILLE, tilingScheme: new Cesium.WebMercatorTilingScheme(), credit: relief.attribution,
    callback: async (x, y, niveau) => {
      const fenetre = fenetre_tuile(x, y, niveau, relief.zoom_max);
      const rgba = await pixels_tuile(url_tuile(relief, fenetre)).catch(() => null);
      return rgba ? grille_hauteurs(rgba, COTE_TUILE, TAILLE_GRILLE, fenetre) : new Float32Array(TAILLE_GRILLE * TAILLE_GRILLE);
    },
  });
}

/** Rendre la couche d'ombrage du relief, calculée ici depuis les tuiles d'altitude : sans elle, le relief ne se voit pas de haut. */
function couche_ombrage(Cesium, relief) {
  const fournisseur = new Cesium.UrlTemplateImageryProvider({url: relief.tuiles[0], maximumLevel: Math.min(NIVEAU_OMBRAGE_MAX, relief.zoom_max), tileWidth: COTE_TUILE, tileHeight: COTE_TUILE, hasAlphaChannel: true});
  fournisseur.requestImage = async (x, y, z) => {
    const rgba = await pixels_tuile(url_tuile(relief, {z, x, y})).catch(() => null);
    const image = rgba ? new ImageData(ombrage_tuile(rgba, COTE_TUILE, metres_par_pixel_tuile(y, z, COTE_TUILE)), COTE_TUILE, COTE_TUILE) : new ImageData(COTE_TUILE, COTE_TUILE);
    return createImageBitmap(image);
  };
  return new Cesium.ImageryLayer(fournisseur);
}

function couche_fond(Cesium, fond) {
  return Cesium.ImageryLayer.fromProviderAsync(Promise.resolve(new Cesium.UrlTemplateImageryProvider({
    url: fond.tuiles[0], maximumLevel: fond.zoom_max, tileWidth: fond.taille_tuile, tileHeight: fond.taille_tuile, credit: fond.attribution,
  })));
}

/** Masquer ce qui n'a pas été vu à cette image, sans détruire : les unités reviennent quand on rejoue le raid. */
function masquer_absents(pool, vus) {
  for (const [id, primitive] of pool) if (!vus.has(id)) primitive.show = false;
}

/**
 * Rendre la vue 3D créée dans `conteneur` : {rendre({monde, calques, montre, percue, selection, inspection, exageration, camera, effets, traces, maintenant}), appliquer_fond(fond),
 * sous_curseur(x, y)}. `sources` : les sources de cartes/ ; `fond` : la source de fond choisie, ou null ; `local` : {fond, relief}
 * préparés par outils/hors_ligne.js, qui priment s'ils existent. Lève sans WebGL.
 */
export async function creer_vue3d(conteneur, sources, fond, local = null) {
  const Cesium = await charger_cesium();
  Cesium.Ion.defaultAccessToken = "";
  const relief = local?.relief ?? Object.entries(sources).find(([id]) => id.startsWith("relief/"))?.[1];
  const viewer = new Cesium.Viewer(conteneur, {
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, scene3DOnly: true,
    useDefaultRenderLoop: false, baseLayer: false, requestRenderMode: true, maximumRenderTimeChange: Number.POSITIVE_INFINITY,
    terrainProvider: relief ? fournisseur_relief(Cesium, relief) : new Cesium.EllipsoidTerrainProvider(),
  });
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(COULEURS.fond);
  const {primitives} = viewer.scene;
  const tiges = primitives.add(new Cesium.PolylineCollection());
  const points = primitives.add(new Cesium.PointPrimitiveCollection());
  const silhouettes = primitives.add(new Cesium.BillboardCollection({scene: viewer.scene}));
  const panneaux = primitives.add(new Cesium.BillboardCollection({scene: viewer.scene}));
  const [pool_points, pool_silhouettes, pool_unites, pool_tiges] = [new Map(), new Map(), new Map(), []];
  const couleur = (nom) => Cesium.Color.fromCssColorString(COULEURS[nom]);
  const couleurs = {ami: couleur("ami"), sol: couleur("sol"), hostile: couleur("hostile"), inconnu: couleur("inconnu")};
  const matiere_tige = Cesium.Material.fromType("Color", {color: Cesium.Color.WHITE.withAlpha(0.45)});
  const sols = new Map();
  let [cadrage, images, tiges_posees, mode_pose, vu, ms_image] = [null, 0, 0, null, {}, 0];

  function appliquer_fond(source) {
    viewer.imageryLayers.removeAll();
    if (source?.tuiles) viewer.imageryLayers.add(couche_fond(Cesium, source));
    if (relief) viewer.imageryLayers.add(couche_ombrage(Cesium, relief));
  }

  function cadrer(monde) {
    const {origine} = monde.scenario.theatre;
    const cle = `${origine.lat},${origine.lon},${monde.rayonDetection}`;
    if (cle === cadrage) return;
    cadrage = cle;
    mode_pose = null;
    const cible = Cesium.Cartesian3.fromRadians(origine.lon, origine.lat, 0);
    viewer.camera.lookAt(cible, new Cesium.HeadingPitchRange(0, INCLINAISON_CAMERA, 3 * monde.rayonDetection));
    // lookAt fige la caméra sur la cible : on rend la main à la souris.
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  /** Rendre l'altitude du sol (m) sous un point, mise en cache par maille : l'interroger pour 1 000 drones à chaque image coûterait trop. */
  function hauteur_sol(lat, lon) {
    const cle = Math.round(lat / MAILLE_SOL_DEG) * 1e6 + Math.round(lon / MAILLE_SOL_DEG);
    if (!sols.has(cle)) {
      const h = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat));
      if (h === undefined) return 0;
      sols.set(cle, h);
    }
    return sols.get(cle);
  }

  /** Tracer la tige verticale du sol à la position en vol. */
  function poser_tige(lat, lon, sol, haut) {
    let tige = pool_tiges[tiges_posees];
    if (!tige) {
      tige = tiges.add({width: 1, material: matiere_tige});
      pool_tiges.push(tige);
    }
    tiges_posees++;
    tige.show = true;
    tige.positions = [Cesium.Cartesian3.fromDegrees(lon, lat, sol), haut];
  }

  function obtenir(pool, id, creer) {
    let primitive = pool.get(id);
    if (!primitive) {
      primitive = creer();
      primitive.id = id;
      pool.set(id, primitive);
    }
    return primitive;
  }

  function placer_drones(drones, icone, selection, exageration) {
    const [vus_points, vus_silhouettes] = [new Set(), new Set()];
    const camera = viewer.camera.positionWC;
    let tiges_drones = 0;
    const places = drones.map((d) => {
      const sol = hauteur_sol(d.lat_deg, d.lon_deg);
      const position = Cesium.Cartesian3.fromDegrees(d.lon_deg, d.lat_deg, sol + d.alt * exageration);
      return {d, sol, position, distance: Cesium.Cartesian3.distance(camera, position)};
    });
    const en_modele = modeles.placer_essaim(icone, places);
    for (const {d, sol, position, distance} of places) {
      if (en_modele.has(d.id)) continue;
      const teinte = d.detecte ? couleurs.hostile : couleurs.inconnu;
      const choisi = d.id === selection;
      if (distance < SEUIL_SILHOUETTE) {
        vus_silhouettes.add(d.id);
        const silhouette = obtenir(pool_silhouettes, d.id, () => silhouettes.add({width: TAILLE_SILHOUETTE, height: TAILLE_SILHOUETTE, disableDepthTestDistance: SANS_TEST_PROFONDEUR}));
        Object.assign(silhouette, {show: true, position, color: teinte, scale: choisi ? 1.5 : 1, rotation: viewer.camera.heading - d.cap});
        if (silhouette.icone !== icone) Object.assign(silhouette, {icone, image: chemin_icone(icone)});
        if (tiges_drones++ < TIGES_DRONES_MAX) poser_tige(d.lat_deg, d.lon_deg, sol, position);
      } else {
        vus_points.add(d.id);
        const point = obtenir(pool_points, d.id, () => points.add({outlineColor: Cesium.Color.WHITE, disableDepthTestDistance: SANS_TEST_PROFONDEUR}));
        Object.assign(point, {show: true, position, color: teinte, pixelSize: choisi ? 10 : 5, outlineWidth: choisi ? 2 : 0});
      }
    }
    masquer_absents(pool_points, vus_points);
    masquer_absents(pool_silhouettes, vus_silhouettes);
  }

  function placer_unites(unites, selection, exageration) {
    const vus = new Set();
    for (const u of unites) {
      vus.add(u.id);
      const panneau = obtenir(pool_unites, u.id, () => panneaux.add({width: TAILLE_ICONE, height: TAILLE_ICONE, disableDepthTestDistance: SANS_TEST_PROFONDEUR,
        heightReference: u.sol ? Cesium.HeightReference.RELATIVE_TO_GROUND : Cesium.HeightReference.NONE}));
      const sol_unite = hauteur_sol(u.lat_deg, u.lon_deg);
      // Un modèle a sa propre hauteur : le camion d'un radar roule au sol, c'est son antenne qui porte le mât.
      const place = Cesium.Cartesian3.fromDegrees(u.lon_deg, u.lat_deg, sol_unite + (u.sol ? 0 : u.alt * exageration));
      panneau.show = !modeles.placer(u, place, u.cap);
      panneau.scale = u.id === selection ? 1.5 : 1;
      if (u.sol) {
        const signature = `${u.lat_deg},${u.lon_deg},${u.alt}`;
        if (panneau.signature !== signature) Object.assign(panneau, {signature, position: Cesium.Cartesian3.fromDegrees(u.lon_deg, u.lat_deg, u.alt)});
      } else {
        panneau.position = place;
        poser_tige(u.lat_deg, u.lon_deg, sol_unite, place);
      }
      const image = chemin_icone(u.icone);
      if (panneau.icone !== image) Object.assign(panneau, {icone: image, image});
      panneau.color = u.vide ? couleurs[u.camp].withAlpha(0.35) : couleurs[u.camp];
      if (!u.sol) panneau.rotation = viewer.camera.heading - u.cap;
    }
    masquer_absents(pool_unites, vus);
    modeles.fin();
  }

  /** Placer la caméra selon `mode` ; rendre vrai si elle doit être replacée à chaque image. */
  function placer_camera(monde, mode, selection, exageration) {
    const consigne = consigne_camera(mode, monde, selection);
    viewer.scene.screenSpaceCameraController.enableInputs = !consigne || consigne.type === "fixe";
    const nouveau = mode !== mode_pose;
    mode_pose = mode;
    if (!consigne) return false;
    const {camera} = viewer;
    if (consigne.type === "fixe") {
      if (!nouveau) return false;
      const {origine} = monde.scenario.theatre;
      camera.lookAt(Cesium.Cartesian3.fromRadians(origine.lon, origine.lat, 0), new Cesium.HeadingPitchRange(0, consigne.inclinaison, consigne.recul * monde.rayonDetection));
      camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      return false;
    }
    const {geo} = consigne;
    const sol = hauteur_sol(vers_degres(geo.lat), vers_degres(geo.lon));
    if (consigne.type === "suivi") {
      camera.lookAt(Cesium.Cartesian3.fromRadians(geo.lon, geo.lat, sol + (geo.alt ?? 0) * exageration), new Cesium.HeadingPitchRange(camera.heading, INCLINAISON_SUIVI, modeles.existe(consigne.icone) ? RECUL_SUIVI_MODELE : RECUL_SUIVI));
      camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    } else {
      camera.setView({
        destination: Cesium.Cartesian3.fromRadians(geo.lon, geo.lat, sol + consigne.hauteur),
        orientation: {heading: inverse(geo, {...consigne.vers, alt: 0}).azimut_depart, pitch: INCLINAISON_POSTE, roll: 0},
      });
    }
    return true;
  }

  const modeles = creer_modeles3d(Cesium, viewer, await lire_modeles_disponibles());
  appliquer_fond(local?.fond ?? fond);
  const couches = creer_couches3d(Cesium, viewer, hauteur_sol);
  return {
    appliquer_fond: (source) => appliquer_fond(local?.fond ?? source),
    /** Rendre l'identifiant de scène de l'unité sous le point écran (x, y), ou null. */
    sous_curseur(x, y) {
      const objet = viewer.scene.pick(new Cesium.Cartesian2(x, y));
      return typeof objet?.primitive?.id === "string" ? objet.primitive.id : null;
    },
    rendre({monde, calques, montre, percue, selection, inspection, exageration, camera, effets, traces, maintenant}) {
      const debut = performance.now();
      cadrer(monde);
      if (exageration !== viewer.scene.verticalExaggeration) {
        viewer.scene.verticalExaggeration = exageration;
        sols.clear();
      }
      if (++images % VIE_CACHE_SOL === 0) sols.clear();
      const continu = placer_camera(monde, camera, selection, exageration);
      // En pause, rien ne bouge : ni recalcul ni image, sauf pour suivre le relief qui se charge.
      const change = monde !== vu.monde || monde.t !== vu.t || calques !== vu.calques || percue !== vu.percue || selection !== vu.selection || exageration !== vu.exageration;
      // Une cible frappée fume : la scène s'anime alors même en pause (MODELE § 30).
      const fumee = calques.cibles && monde.fuites.some((n) => n > 0);
      if (change || continu || fumee || effets.liste.length > 0 || images % PERIODE_SCENE_AU_REPOS === 0) {
        vu = {monde, t: monde.t, calques, percue, selection, exageration};
        tiges_posees = 0;
        const {drones, unites, icone_drone: icone} = entites_scene(monde, calques, montre);
        modeles.debut();
        placer_drones(drones, icone, selection, exageration);
        placer_unites(unites, selection, exageration);
        couches.maj({monde, calques, montre, inspection, exageration, effets, traces, maintenant});
        for (let i = tiges_posees; i < pool_tiges.length; i++) pool_tiges[i].show = false;
        viewer.scene.requestRender();
      }
      viewer.resize();
      viewer.render();
      // Temps moyen par image (ms), lisible dans le DOM pour mesurer les performances sur un scénario donné.
      ms_image += (performance.now() - debut - ms_image) * 0.05;
      conteneur.dataset.msImage = ms_image.toFixed(1);
    },
  };
}
