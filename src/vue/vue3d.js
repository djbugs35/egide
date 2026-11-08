// Vue Observer en 3D (jalon 14, MODELE § 23) : le raid sur le globe CesiumJS, à chaque unité sa vraie altitude.
// Cette vue n'affiche que ce que rend scene3d.js. CesiumJS (12 Mo) n'est chargé qu'à la première ouverture.
import {creer_couches3d} from "./couches3d.js";
import {COULEURS} from "./couleurs.js";
import {entites_scene, fenetre_tuile, grille_hauteurs} from "./scene3d.js";

const TAILLE_GRILLE = 65;
const COTE_TUILE = 256;
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
// Toujours visibles, même derrière une crête : c'est une vue de situation, pas un rendu réaliste.
const SANS_TEST_PROFONDEUR = Number.POSITIVE_INFINITY;

async function charger_cesium() {
  globalThis.CESIUM_BASE_URL = new URL("../../vendor/cesium/", import.meta.url).href;
  const feuille = Object.assign(document.createElement("link"), {rel: "stylesheet", href: `${globalThis.CESIUM_BASE_URL}Widgets/widgets.css`});
  document.head.append(feuille);
  return import("../../vendor/cesium/index.js");
}

/** Rendre les pixels RGBA d'une image de tuile, ou null si elle n'existe pas (mer, hors couverture). */
async function pixels_tuile(url) {
  const reponse = await fetch(url);
  if (!reponse.ok) return null;
  const image = await createImageBitmap(await reponse.blob());
  const toile = new OffscreenCanvas(image.width, image.height);
  const ctx = toile.getContext("2d", {willReadFrequently: true});
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height).data;
}

function fournisseur_relief(Cesium, relief) {
  const modele = relief.tuiles[0];
  return new Cesium.CustomHeightmapTerrainProvider({
    width: TAILLE_GRILLE, height: TAILLE_GRILLE, tilingScheme: new Cesium.WebMercatorTilingScheme(), credit: relief.attribution,
    callback: async (x, y, niveau) => {
      const fenetre = fenetre_tuile(x, y, niveau, relief.zoom_max);
      const url = modele.replace("{z}", fenetre.z).replace("{x}", fenetre.x).replace("{y}", fenetre.y);
      const rgba = await pixels_tuile(url).catch(() => null);
      return rgba ? grille_hauteurs(rgba, COTE_TUILE, TAILLE_GRILLE, fenetre) : new Float32Array(TAILLE_GRILLE * TAILLE_GRILLE);
    },
  });
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
 * Rendre la vue 3D créée dans `conteneur` : {rendre({monde, calques, montre, selection, exageration, effets, traces, maintenant}), appliquer_fond(fond),
 * sous_curseur(x, y)}. `sources` : les sources de cartes/ ; `fond` : la source de fond choisie, ou null. Lève sans WebGL.
 */
export async function creer_vue3d(conteneur, sources, fond) {
  const Cesium = await charger_cesium();
  Cesium.Ion.defaultAccessToken = "";
  const relief = Object.entries(sources).find(([id]) => id.startsWith("relief/"))?.[1];
  const viewer = new Cesium.Viewer(conteneur, {
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, scene3DOnly: true,
    useDefaultRenderLoop: false, baseLayer: false,
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
  let [cadrage, images, tiges_posees] = [null, 0, 0];

  function appliquer_fond(source) {
    viewer.imageryLayers.removeAll();
    if (source?.tuiles) viewer.imageryLayers.add(couche_fond(Cesium, source));
  }

  function cadrer(monde) {
    const {origine} = monde.scenario.theatre;
    const cle = `${origine.lat},${origine.lon},${monde.rayonDetection}`;
    if (cle === cadrage) return;
    cadrage = cle;
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
    for (const d of drones) {
      const sol = hauteur_sol(d.lat_deg, d.lon_deg);
      const position = Cesium.Cartesian3.fromDegrees(d.lon_deg, d.lat_deg, sol + d.alt * exageration);
      const teinte = d.detecte ? couleurs.hostile : couleurs.inconnu;
      const choisi = d.id === selection;
      if (Cesium.Cartesian3.distance(camera, position) < SEUIL_SILHOUETTE) {
        vus_silhouettes.add(d.id);
        const silhouette = obtenir(pool_silhouettes, d.id, () => silhouettes.add({width: TAILLE_SILHOUETTE, height: TAILLE_SILHOUETTE, disableDepthTestDistance: SANS_TEST_PROFONDEUR}));
        Object.assign(silhouette, {show: true, position, color: teinte, scale: choisi ? 1.5 : 1, rotation: viewer.camera.heading - d.cap});
        if (silhouette.icone !== icone) Object.assign(silhouette, {icone, image: `icones/${icone}.svg`});
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
      panneau.show = true;
      panneau.scale = u.id === selection ? 1.5 : 1;
      if (u.sol) {
        const signature = `${u.lat_deg},${u.lon_deg},${u.alt}`;
        if (panneau.signature !== signature) Object.assign(panneau, {signature, position: Cesium.Cartesian3.fromDegrees(u.lon_deg, u.lat_deg, u.alt)});
      } else {
        const sol = hauteur_sol(u.lat_deg, u.lon_deg);
        panneau.position = Cesium.Cartesian3.fromDegrees(u.lon_deg, u.lat_deg, sol + u.alt * exageration);
        poser_tige(u.lat_deg, u.lon_deg, sol, panneau.position);
      }
      const image = `icones/${u.icone}.svg`;
      if (panneau.icone !== image) Object.assign(panneau, {icone: image, image});
      panneau.color = u.vide ? couleurs[u.camp].withAlpha(0.35) : couleurs[u.camp];
    }
    masquer_absents(pool_unites, vus);
  }

  appliquer_fond(fond);
  const couches = creer_couches3d(Cesium, viewer, hauteur_sol);
  return {
    appliquer_fond,
    /** Rendre l'identifiant de scène de l'unité sous le point écran (x, y), ou null. */
    sous_curseur(x, y) {
      const objet = viewer.scene.pick(new Cesium.Cartesian2(x, y));
      return typeof objet?.primitive?.id === "string" ? objet.primitive.id : null;
    },
    rendre({monde, calques, montre, selection, exageration, effets, traces, maintenant}) {
      cadrer(monde);
      if (++images % VIE_CACHE_SOL === 0) sols.clear();
      tiges_posees = 0;
      const {drones, unites, icone_drone: icone} = entites_scene(monde, calques, montre);
      placer_drones(drones, icone, selection, exageration);
      placer_unites(unites, selection, exageration);
      couches.maj({monde, calques, montre, exageration, effets, traces, maintenant});
      for (let i = tiges_posees; i < pool_tiges.length; i++) pool_tiges[i].show = false;
      viewer.resize();
      viewer.render();
    },
  };
}
