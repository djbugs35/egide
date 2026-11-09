// Modèles 3D détaillés de la vue Observer (MODELE § 23) : pour une unité dont l'icône a un .glb sous prive/modeles/, le modèle
// remplace le pictogramme tant que la caméra est proche. Sans fichier, rien ne change : le dépôt public n'en a aucun.
import {chemin_modele} from "../moteur/catalogue.js";

// Une vue depuis un poste montre des unités jusqu'à l'horizon du théâtre ; plus loin, en vue d'ensemble, le pictogramme se lit mieux.
const DISTANCE_MODELE_MAX = 400_000;
// Caméra posée sur un radar : à moins de 60 m, son propre modèle boucherait la vue.
const DISTANCE_MODELE_MIN = 60;
// Taille minimale à l'écran (px) : un avion de 15 m disparaîtrait à quelques kilomètres, or on veut le reconnaître.
const TAILLE_ECRAN_MIN = 80;
const ECHELLE_MAX = 800;
// glTF met l'avant sur +Z, que Cesium aligne sur l'est du repère local : on retire un quart de tour pour viser le cap.
const DECALAGE_CAP = -Math.PI / 2;
const INTENSITE_LUMIERE = 2.2;
const AMBIANCE = 0.9;

/** Rendre les icônes qui ont un modèle, d'après prive/modeles/index.json ; aucune s'il est absent. */
export async function lire_modeles_disponibles() {
  const reponse = await fetch(new URL("../../prive/modeles/index.json", import.meta.url)).catch(() => null);
  return new Set(reponse?.ok ? await reponse.json() : []);
}

/**
 * Rendre {debut(), placer(unite, position, cap), fin()}, le jeu des modèles posés à chaque image.
 *
 * @param {object} Cesium le module CesiumJS.
 * @param {object} viewer la vue Cesium.
 * @param {Set<string>} disponibles icônes pourvues d'un modèle.
 */
export function creer_modeles3d(Cesium, viewer, disponibles) {
  const {primitives} = viewer.scene;
  const pool = new Map();
  let vus = new Set();
  const {camera} = viewer;
  const lumiere = new Cesium.DirectionalLight({direction: Cesium.Cartesian3.UNIT_Z.clone(), intensity: INTENSITE_LUMIERE});
  viewer.scene.light = lumiere;
  // La lumière suit la caméra, un peu au-dessus de son épaule : fixée dans le monde, elle laisse à contre-jour la moitié des points de vue.
  viewer.scene.preRender.addEventListener(() => {
    const direction = Cesium.Cartesian3.clone(camera.directionWC, lumiere.direction);
    Cesium.Cartesian3.add(direction, Cesium.Cartesian3.multiplyByScalar(camera.rightWC, 0.35, new Cesium.Cartesian3()), direction);
    Cesium.Cartesian3.add(direction, Cesium.Cartesian3.multiplyByScalar(camera.upWC, -0.6, new Cesium.Cartesian3()), direction);
    Cesium.Cartesian3.normalize(direction, direction);
  });

  // Ambiance neutre : l'éclairage d'ambiance par défaut vient du ciel et teinte tout le modèle en bleu.
  const ambiance_neutre = () => new Cesium.ImageBasedLighting({sphericalHarmonicCoefficients: [new Cesium.Cartesian3(AMBIANCE, AMBIANCE, AMBIANCE), ...Array.from({length: 8}, () => new Cesium.Cartesian3())]});

  function charger(id, icone) {
    pool.set(id, null);
    Cesium.Model.fromGltfAsync({url: new URL(`../../${chemin_modele(icone)}`, import.meta.url).href, id, minimumPixelSize: TAILLE_ECRAN_MIN, maximumScale: ECHELLE_MAX, show: false, imageBasedLighting: ambiance_neutre()})
      .then((modele) => {
        pool.set(id, primitives.add(modele));
        viewer.scene.requestRender();
      })
      .catch((erreur) => console.warn(`Modèle ${icone} illisible : ${erreur.message}`));
  }

  return {
    debut: () => (vus = new Set()),
    /** Rendre vrai si l'icône a un modèle, chargé ou non : une caméra à l'arrêt ne se replacerait pas à la fin du chargement. */
    existe: (icone) => disponibles.has(icone),
    /** Poser le modèle de l'unité s'il existe et que la caméra est assez proche ; rendre vrai s'il remplace le pictogramme. */
    placer(unite, position, cap) {
      const distance = Cesium.Cartesian3.distance(viewer.camera.positionWC, position);
      if (!disponibles.has(unite.icone) || distance > DISTANCE_MODELE_MAX || distance < DISTANCE_MODELE_MIN) return false;
      if (!pool.has(unite.id)) charger(unite.id, unite.icone);
      const modele = pool.get(unite.id);
      if (!modele) return false;
      vus.add(unite.id);
      modele.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(position, new Cesium.HeadingPitchRoll((cap ?? 0) + DECALAGE_CAP, 0, 0));
      modele.show = true;
      return true;
    },
    fin() {
      for (const [id, modele] of pool) if (modele && !vus.has(id)) modele.show = false;
    },
  };
}
