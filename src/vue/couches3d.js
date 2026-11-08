// Volumes et information de la vue 3D (jalon 14.2, MODELE § 23) : couvertures radar, bulles sol, liaisons, ralliements,
// tirs, impulsions et plots. Tout vient de scene3d.js ou des effets de la 2D : aucun calcul de portée ici.
import {vers_degres} from "../moteur/geodesie.js";
import {COULEURS} from "./couleurs.js";
import {contour_objet, enveloppes_a_montrer} from "./couvertures_vue.js";
import {avancement} from "./effets.js";
import {bulles_scene, couvertures_scene, liaisons_scene} from "./scene3d.js";
import {calque_vecteur} from "./symboles.js";

const SANS_TEST_PROFONDEUR = Number.POSITIVE_INFINITY;
// Paliers d'opacité : changer la matière d'une ligne ou d'une bulle à chaque image reconstruirait sa géométrie.
const PALIERS = 5;
const palier = (alpha) => Math.max(0, Math.min(PALIERS, Math.round(alpha * PALIERS))) / PALIERS;
const OPACITE_REMPLISSAGE = 0.08;
const COULEURS_TIR = {air: COULEURS.ami, sol: COULEURS.sol, brouillage: "#b48ee8"};

/** Rendre un jeu de lignes réutilisées d'une image à l'autre : debut(), poser(positions, couleur, alpha, largeur), fin(). */
function creer_traits(Cesium, collection) {
  const [pool, matieres] = [[], new Map()];
  let n = 0;
  const matiere = (couleur, alpha) => {
    const cle = `${couleur}|${alpha}`;
    if (!matieres.has(cle)) matieres.set(cle, Cesium.Material.fromType("Color", {color: Cesium.Color.fromCssColorString(couleur).withAlpha(alpha)}));
    return matieres.get(cle);
  };
  return {
    debut: () => (n = 0),
    poser(positions, couleur, alpha = 1, largeur = 1) {
      const ligne = pool[n] ?? collection.add({});
      pool[n++] = ligne;
      const voulue = matiere(couleur, palier(alpha));
      if (ligne.material !== voulue) ligne.material = voulue;
      Object.assign(ligne, {show: true, positions, width: largeur});
    },
    fin() {
      for (let i = n; i < pool.length; i++) pool[i].show = false;
    },
  };
}

/** Rendre un jeu de points réutilisés : debut(), poser(position, couleur, alpha, taille), fin(). */
function creer_points(Cesium, collection) {
  const pool = [];
  let n = 0;
  return {
    debut: () => (n = 0),
    poser(position, couleur, alpha = 1, taille = 5) {
      const point = pool[n] ?? collection.add({disableDepthTestDistance: SANS_TEST_PROFONDEUR});
      pool[n++] = point;
      Object.assign(point, {show: true, position, pixelSize: taille, color: Cesium.Color.fromCssColorString(couleur).withAlpha(alpha)});
    },
    fin() {
      for (let i = n; i < pool.length; i++) pool[i].show = false;
    },
  };
}

/**
 * Rendre les couches de la vue 3D, à mettre à jour à chaque image par maj(...). `hauteur_sol(lat_deg, lon_deg)` rend
 * l'altitude du sol affiché.
 */
export function creer_couches3d(Cesium, viewer, hauteur_sol) {
  const {primitives} = viewer.scene;
  const anneaux = primitives.add(new Cesium.PolylineCollection());
  const traits = creer_traits(Cesium, primitives.add(new Cesium.PolylineCollection()));
  const eclats = creer_points(Cesium, primitives.add(new Cesium.PointPrimitiveCollection()));
  const plots = creer_points(Cesium, primitives.add(new Cesium.PointPrimitiveCollection()));
  const anneau = (alpha) => Cesium.Material.fromType("Color", {color: Cesium.Color.fromCssColorString(COULEURS.ami).withAlpha(alpha)});
  // Contour de l'essaim bien visible ; ceux du dessus, discrets : à 11 radars, ils encombreraient vite la vue.
  const [matiere_essaim, matiere_haut] = [anneau(0.7), anneau(0.14)];
  const bulles = new Map();
  let [signature_couverture, volumes_poses, remplissages, plots_a_jour] = [null, null, [], null];

  const position = (lat_deg, lon_deg, hauteur) => Cesium.Cartesian3.fromDegrees(lon_deg, lat_deg, hauteur_sol(lat_deg, lon_deg) + hauteur);
  const depuis_geo = (geo, exageration) => position(vers_degres(geo.lat), vers_degres(geo.lon), (geo.alt ?? 0) * exageration);

  /** Reconstruire contours et remplissages seulement si le scénario, l'exagération ou le sol affiché ont changé. */
  function maj_couverture(monde, exageration, visible) {
    anneaux.show = visible;
    for (const entite of remplissages) entite.show = visible;
    if (!visible) return;
    const volumes = couvertures_scene(monde);
    const sols = volumes.map(({niveaux}) => Math.round(hauteur_sol(niveaux[0].contour[0].lat_deg, niveaux[0].contour[0].lon_deg) / 10));
    const signature = `${exageration}|${sols.join(",")}`;
    if (signature === signature_couverture && volumes === volumes_poses) return;
    [signature_couverture, volumes_poses] = [signature, volumes];
    anneaux.removeAll();
    for (const entite of remplissages) viewer.entities.remove(entite);
    remplissages = [];
    volumes.forEach(({niveaux}, v) => {
      niveaux.forEach(({hauteur, contour}, k) => {
        const altitude = sols[v] * 10 + hauteur * exageration;
        const points = contour.map((c) => Cesium.Cartesian3.fromDegrees(c.lon_deg, c.lat_deg, altitude));
        anneaux.add({positions: [...points, points[0]], width: k === 0 ? 2 : 1, material: k === 0 ? matiere_essaim : matiere_haut});
        if (k > 0) return;
        remplissages.push(viewer.entities.add({polygon: {
          hierarchy: new Cesium.PolygonHierarchy(points), height: altitude,
          material: Cesium.Color.fromCssColorString(COULEURS.ami).withAlpha(OPACITE_REMPLISSAGE),
        }}));
      });
    });
  }

  function maj_bulles(monde, visible) {
    const vues = new Set();
    for (const b of visible ? bulles_scene(monde) : []) {
      vues.add(b.id);
      const opacite = 0.04 + 0.16 * palier(b.part);
      const cle = `${b.lat_deg},${b.lon_deg},${b.rayon}`;
      let entite = bulles.get(b.id);
      if (entite?.cle !== cle) {
        if (entite) viewer.entities.remove(entite);
        entite = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(b.lon_deg, b.lat_deg, 0),
          // Demi-sphère : la bulle d'engagement au-dessus du sol.
          ellipsoid: {radii: new Cesium.Cartesian3(b.rayon, b.rayon, b.rayon), maximumCone: Cesium.Math.PI_OVER_TWO, heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND},
        });
        Object.assign(entite, {cle, opacite: null});
        bulles.set(b.id, entite);
      }
      entite.show = true;
      if (entite.opacite !== opacite) {
        entite.opacite = opacite;
        entite.ellipsoid.material = Cesium.Color.fromCssColorString(COULEURS.sol).withAlpha(opacite);
      }
    }
    for (const [id, entite] of bulles) if (!vues.has(id)) entite.show = false;
  }

  function maj_liaisons(monde, exageration) {
    for (const {points, actif} of liaisons_scene(monde)) {
      const positions = points.map((p) => position(p.lat_deg, p.lon_deg, p.alt * (p.vol ? exageration : 1)));
      traits.poser(positions, actif ? COULEURS.ami : COULEURS.hostile, actif ? 0.6 : 1, actif ? 1 : 2);
    }
  }

  /** Tracer les enveloppes des objets (MODELE § 25), posées au sol de leur centre, à l'altitude de l'essaim. */
  function maj_enveloppes(monde, calques, inspection, exageration) {
    const hauteur = monde.scenario.rouge.altitude * exageration;
    for (const {objets, genre, couleur, largeur} of enveloppes_a_montrer(monde, calques, inspection)) {
      for (const objet of objets) {
        if (objet[genre] <= 0) continue;
        const sol = hauteur_sol(vers_degres(objet.geo.lat), vers_degres(objet.geo.lon)) + hauteur;
        const points = contour_objet(objet, genre).map((p) => Cesium.Cartesian3.fromDegrees(vers_degres(p.lon), vers_degres(p.lat), sol));
        traits.poser([...points, points[0]], couleur, 0.8, largeur);
      }
    }
  }

  function maj_ralliements(monde, calques, exageration) {
    for (const avion of monde.avions) {
      if (avion.perdu || avion.etat !== "ralliement" || !avion.point || !calques[calque_vecteur(avion)]) continue;
      traits.poser([depuis_geo(avion.geo, exageration), depuis_geo({...avion.point, alt: avion.geo.alt}, exageration)], COULEURS.ami, 0.6);
    }
  }

  function maj_effets(effets, calques, maintenant, exageration) {
    for (const effet of effets.liste) {
      const f = avancement(effet, maintenant);
      if (calques.tirs && effet.type === "trait") traits.poser([depuis_geo(effet.de, exageration), depuis_geo(effet.vers, exageration)], COULEURS_TIR[effet.couche], 0.9 * (1 - f), 2);
      else if (calques.tirs && effet.type === "eclat") eclats.poser(depuis_geo(effet.position, exageration), "#fff1cc", 1 - f, 4 + 16 * f);
      else if (calques.messages && effet.type === "message") {
        const couleur = effet.perdu ? COULEURS.hostile : effet.sens === "montee" ? COULEURS.ami : COULEURS.selection;
        const [de, vers] = [depuis_geo(effet.de, exageration), depuis_geo(effet.vers, exageration)];
        traits.poser([de, vers], couleur, 0.5 * (1 - f));
        eclats.poser(Cesium.Cartesian3.lerp(de, vers, effet.perdu ? Math.min(f, 0.25) : f, new Cesium.Cartesian3()), couleur, 1, 8);
      } else if (calques.messages && effet.type === "contact") {
        traits.poser([depuis_geo(effet.de, exageration), depuis_geo(effet.vers, exageration)], "#e8d36a", 1 - f, 2);
      }
    }
  }

  /** Reposer les plots radar à chaque nouveau tour d'antenne seulement : entre deux, ils ne bougent pas. */
  function maj_plots(monde, traces, calques, montre, exageration) {
    const cle = calques.plots ? `${traces.prochain}|${exageration}` : "aucun";
    if (cle === plots_a_jour) return;
    plots_a_jour = cle;
    plots.debut();
    const hauteur = monde.scenario.rouge.altitude * exageration;
    for (const [id, releves] of calques.plots ? traces.plots : []) {
      if (!montre(monde.drones[id])) continue;
      releves.forEach((plot, rang) => plots.poser(position(vers_degres(plot.lat), vers_degres(plot.lon), hauteur), COULEURS.hostile, 0.15 + (0.45 * rang) / releves.length, 3));
    }
    plots.fin();
  }

  return {
    maj({monde, calques, montre, inspection, exageration, effets, traces, maintenant}) {
      maj_couverture(monde, exageration, calques.couverture);
      maj_bulles(monde, calques.postes);
      traits.debut();
      eclats.debut();
      maj_enveloppes(monde, calques, inspection, exageration);
      if (calques.reseau) maj_liaisons(monde, exageration);
      if (calques.missions) maj_ralliements(monde, calques, exageration);
      maj_effets(effets, calques, maintenant, exageration);
      traits.fin();
      eclats.fin();
      maj_plots(monde, traces, calques, montre, exageration);
    },
  };
}
