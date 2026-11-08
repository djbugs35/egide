// Couvertures de chaque objet et résultante des C2 (MODELE § 25) : calculées ici, une fois, et lues par toutes les
// interfaces. Détection, conduite de tir et interception, à l'altitude de l'essaim. Pur.
import {delai_disponible, horizon_radar} from "./geometrie.js";
import {soustraire, vers_degres, vers_ecef, vers_enu} from "./geodesie.js";
import {parametres_radar, portee_contre_menace, portee_radar, portee_site, positions_radars} from "./radars.js";
import {acces_avion, grille_scenario} from "./reseau.js";
import {couverture_reelle} from "./terrain.js";

/** Rendre la conduite de tir (m) d'un poste : déclarée, sinon proportionnelle à son arme. */
export const conduite_poste = (unite) => unite.portee_conduite || unite.facteur_conduite * unite.portee;

/** Rendre le rayon de tir (m) d'un poste contre un drone à `altitude` m (MODELE § 25.2). */
export const enveloppe_poste = (unite, altitude) => Math.min(unite.portee, conduite_poste(unite), horizon_radar(unite.hauteur_conduite, altitude));

/** Rendre la conduite de tir (m) d'un groupe de vecteurs : son capteur embarqué. */
export const conduite_vecteur = (groupe) => groupe.portee_conduite || groupe.facteur_conduite * groupe.arme.portee;

/** Rendre la distance de tir (m) d'un groupe de vecteurs. */
export const enveloppe_vecteur = (groupe) => Math.min(groupe.arme.portee, conduite_vecteur(groupe));

/** Rendre le rayon d'interception (m) d'un groupe de vecteurs : ce qu'il atteint dans le délai disponible (MODELE § 25.3). */
export function rayon_interception(scenario, groupe) {
  const {interception_profondeur: profondeur, delai_reaction: reaction} = scenario.conduite;
  const delai = Math.max(0, delai_disponible(portee_radar(scenario), profondeur, scenario.rouge.vitesse, reaction));
  return enveloppe_vecteur(groupe) + groupe.vitesse_mise_a_poste * delai;
}

const profils = new WeakMap();

/** Rendre les portées (m) par secteur d'azimut d'un masque, à la hauteur de l'essaim ; calculées une fois par masque. */
function profil_masque(masque, grille, altitude) {
  if (!profils.has(masque)) profils.set(masque, couverture_reelle(masque, grille, altitude).map((c) => c.portee));
  return profils.get(masque);
}

function objets_radars(monde, altitude, classes) {
  const {scenario, reseau} = monde;
  const noms = Object.fromEntries([["instrumentee", "instrumentée"], ...classes.map((c) => [c.genre, c.nom])]);
  return positions_radars(scenario).map((geo, i) => {
    const parametres = parametres_radar(scenario, i);
    return {
      noeud: `radar:${i}`, genre: "radar", id: i, unite: parametres.id, geo, hs: reseau.radars_hs[i],
      detection: portee_site(scenario, i), conduite: 0, interception: 0,
      profil: reseau.masques ? profil_masque(reseau.masques[i], reseau.grille, altitude) : null,
      instrumentee: parametres.portee_max, noms,
      ...Object.fromEntries(classes.map((c) => [c.genre, portee_contre_menace(parametres, c.altitude, c.ser)])),
    };
  });
}

/** Rendre les objets au sol : un par cible pour le dispositif commun (ses postes y sont tous), un par batterie placée. */
function objets_postes(monde, altitude) {
  const {scenario} = monde;
  const grille = grille_scenario(scenario);
  const vus = new Map();
  for (const poste of monde.postes) {
    const cle = poste.batterie === undefined ? `sol:${poste.cible}` : `batterie:${poste.batterie}`;
    const present = vus.get(cle);
    if (present) {
      present.munitions += poste.munitions;
      continue;
    }
    const unite = poste.unite ?? scenario.sol;
    vus.set(cle, {
      noeud: `sol:${poste.cible}`, genre: "poste", id: cle, cible: poste.cible, unite: unite.id, geo: poste.geo, hs: false, detection: 0, munitions: poste.munitions,
      conduite: Math.min(conduite_poste(unite), horizon_radar(unite.hauteur_conduite, altitude)), interception: poste.enveloppe,
      profil: poste.masque ? profil_masque(poste.masque, grille, altitude) : null,
    });
  }
  return [...vus.values()].filter((o) => o.munitions > 0);
}

function objets_vecteurs(monde) {
  const {scenario} = monde;
  return monde.avions.filter((a) => !a.perdu && a.munitions > 0).map((a) => {
    const g = scenario.avions.indexOf(a.groupe);
    return {noeud: `avions:${g}`, genre: "vecteur", id: a.id, groupe: g, unite: a.groupe.id, geo: a.geo, hs: false, detection: 0,
      conduite: conduite_vecteur(a.groupe), interception: rayon_interception(scenario, a.groupe), profil: null};
  });
}

/** Rendre vrai si l'objet `o` est relié au centre d'indice `c` à l'instant du monde (MODELE § 25.4). */
function est_relie(monde, o, c) {
  const {reseau} = monde;
  if (reseau.centres[c].hs) return false;
  if (o.genre === "radar") return Number.isFinite(reseau.latences_centres[c][o.id]);
  if (o.genre === "poste") return Number.isFinite(reseau.latences_sol[c][o.cible]);
  return acces_avion(reseau, monde.avions[o.id], o.groupe, c) !== null;
}

/**
 * Rendre {objets, c2} à l'instant du monde (MODELE § 25). `objets` : {noeud, genre, id, unite, geo, detection, conduite,
 * interception (m, 0 : sans objet), profil (portée par degré d'azimut sur relief, ou null)}. `c2` : {noeud, nom, hs,
 * membres (rangs dans `objets`)}, la résultante de chaque centre.
 */
export function couvertures(monde) {
  const altitude = monde.scenario.rouge.altitude;
  const classes = classes_menace(monde.scenario);
  const objets = [...objets_radars(monde, altitude, classes), ...objets_postes(monde, altitude), ...objets_vecteurs(monde)];
  const c2 = monde.reseau.centres.map((centre, c) => ({
    noeud: centre.id, nom: centre.nom, hs: centre.hs, membres: objets.flatMap((o, rang) => (est_relie(monde, o, c) ? [rang] : [])),
  }));
  return {objets, c2, classes};
}

/** Rendre les classes de menace à tracer (MODELE § 27.2) : {genre, nom, altitude (m), ser (m²)}, l'essaim d'abord ; un arc balistique se lit à son apogée. */
function classes_menace({rouge}) {
  const groupes = (rouge.groupes ?? []).map((g) => ({nom: g.nom, altitude: g.trajectoire === "balistique" ? g.apogee : g.altitude, ser: g.ser_m2}));
  return [{nom: "essaim", altitude: rouge.altitude, ser: rouge.ser_m2}, ...groupes].map((c, k) => ({...c, genre: `menace_${k}`}));
}

/** Rendre le rayon (m) d'un objet dans la direction `azimut` (rad), pour l'enveloppe `genre`, compte tenu du relief. */
export function rayon_dans(objet, genre, azimut) {
  const rayon = objet[genre];
  // Le masque d'un poste s'arrête à sa bulle de tir : il ne dit rien de sa conduite au-delà.
  if (!objet.profil || genre === "conduite") return rayon;
  const secteur = Math.floor(((vers_degres(azimut) % 360) + 360) % 360) % objet.profil.length;
  return Math.min(rayon, objet.profil[secteur]);
}

const PAS_SURFACE = 2000;

/** Rendre la surface (m²) de l'union des enveloppes `genre` de `objets`, sur une grille de `pas` m (MODELE § 25.4). */
export function surface_union(objets, genre, origine, pas = PAS_SURFACE) {
  const ecefOrigine = vers_ecef(origine);
  const disques = objets.filter((o) => o[genre] > 0).map((o) => {
    const {e, n} = vers_enu(origine, soustraire(vers_ecef({...o.geo, alt: o.geo.alt ?? 0}), ecefOrigine));
    return {o, e, n};
  });
  if (!disques.length) return 0;
  const borne = (cle, signe) => Math.max(...disques.map((d) => signe * d[cle] + d.o[genre]));
  const [ouest, est, sud, nord] = [-borne("e", -1), borne("e", 1), -borne("n", -1), borne("n", 1)];
  let cellules = 0;
  for (let y = sud + pas / 2; y < nord; y += pas) {
    for (let x = ouest + pas / 2; x < est; x += pas) {
      if (disques.some(({o, e, n}) => Math.hypot(x - e, y - n) <= rayon_dans(o, genre, Math.atan2(x - e, y - n)))) cellules++;
    }
  }
  return cellules * pas * pas;
}
