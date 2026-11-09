// Logique de l'éditeur, sans DOM : chaque geste devient des modifications par chemin du scénario, comme un curseur.
// L'annulation, l'export, les préréglages et le rejeu marchent donc d'office (MODELE § 12). Pur, testé.
import {depuis_ecef, direct, geo_deg, inverse, vers_degres, vers_ecef} from "../moteur/geodesie.js";
import {positions_radars} from "../moteur/radars.js";
import {liaisons_par_defaut, position_noeud} from "./reseau_vue.js";

/** Rendre une position géographique en {lat_deg, lon_deg} arrondis au millionième de degré (≈ 0,1 m). */
export const en_degres = (geo) => ({
  lat_deg: Math.round(vers_degres(geo.lat) * 1e6) / 1e6,
  lon_deg: Math.round(vers_degres(geo.lon) * 1e6) / 1e6,
});

/** Rendre le point déplacé comme `de` l'est vers `vers` : même distance et même azimut par rapport au point d'arrivée. */
export function translater(point, de, vers) {
  const {distance, azimut_depart: azimut} = inverse(de, point);
  return {...(distance === 0 ? vers : direct(vers, azimut, distance)), alt: point.alt};
}

/** Rendre le barycentre (au sol) de positions géographiques, calculé en ECEF puis ramené à la surface. */
export function barycentre(points) {
  const somme = points.map((p) => vers_ecef({...p, alt: 0})).reduce((a, b) => ({x: a.x + b.x, y: a.y + b.y, z: a.z + b.z}));
  return {...depuis_ecef({x: somme.x / points.length, y: somme.y / points.length, z: somme.z / points.length}), alt: 0};
}

/** Rendre les centres de détection et de contrôle autres que le principal, comme éléments éditables. */
const centres_secondaires = (monde) => monde.scenario.reseau.centres.map((c, indice) => ({cle: `centre:${indice}`, type: "centre", indice, geo: c.geo}));

const points_geo = (points) => (points ?? []).map((p) => geo_deg(p.lat_deg, p.lon_deg, 0));

/**
 * Rendre les éléments éditables, avec leur position : en mode « edition », cibles, orbites d'avions, radars, points
 * du plan de vol et zones (par leur barycentre) ; en mode « ordres », les seuls avions, là où ils sont à cet instant.
 */
export function elements_editables(monde, brut, mode = "edition") {
  if (mode === "ordres") {
    // En cours de raid : des avions à envoyer, et des éléments du réseau à mettre hors service.
    return [
      ...monde.avions.filter((avion) => !avion.perdu).map((avion) => ({cle: `avion:${avion.id}`, type: "avion", indice: avion.id, geo: avion.geo, guidage: avion.guidage, vecteur: avion.type})),
      ...positions_radars(monde.scenario).map((geo, indice) => ({cle: `radar:${indice}`, type: "radar", indice, geo})),
      {cle: "conduite", type: "conduite", indice: 0, geo: monde.scenario.reseau.centre},
      ...centres_secondaires(monde),
      ...milieux_liaisons(monde),
    ];
  }
  return [
    // Le centre de conduite visé par l'essaim est une cible du monde, mais il se déplace comme centre de conduite.
    ...monde.cibles.filter((cible) => !cible.conduite).map((cible, indice) => ({cle: `cible:${indice}`, type: "cible", indice, geo: cible.geo})),
    ...monde.avions.map((avion) => ({cle: `avion:${avion.id}`, type: "avion", indice: avion.id, geo: avion.orbite, guidage: avion.guidage, vecteur: avion.type})),
    ...positions_radars(monde.scenario).map((geo, indice) => ({cle: `radar:${indice}`, type: "radar", indice, geo})),
    ...points_geo(brut.bleu.sol.batteries).map((geo, indice) => ({cle: `batterie:${indice}`, type: "batterie", indice, geo})),
    {cle: "conduite", type: "conduite", indice: 0, geo: monde.scenario.reseau.centre},
    ...centres_secondaires(monde),
    ...milieux_liaisons(monde),
    ...points_geo(brut.rouge.plan_de_vol).map((geo, indice) => ({cle: `passage:${indice}`, type: "passage", indice, geo})),
    ...(brut.theatre.zones ?? []).map((zone, indice) => ({cle: `zone:${indice}`, type: "zone", indice, geo: barycentre(points_geo(zone.points))})),
  ];
}

const cibles_en_degres = (monde, deplacer = () => null) => monde.cibles.filter((c) => !c.conduite).map((cible, i) => en_degres(deplacer(i) ?? cible.geo));

/**
 * Rendre les modifications qui déplacent les éléments `cles` comme le point `de` l'est vers `vers`.
 * Toutes les cibles et toutes les orbites d'un groupe touché sont figées : rien d'autre ne bouge à la relecture.
 */
export function modifications_deplacement(monde, brut, cles, de, vers) {
  const choisis = new Set(cles);
  const modifications = {};
  const bouge = (cle, geo) => (choisis.has(cle) ? translater(geo, de, vers) : null);
  if (cles.some((c) => c.startsWith("cible:"))) {
    modifications["theatre.cibles_placees"] = cibles_en_degres(monde, (i) => bouge(`cible:${i}`, monde.cibles[i].geo));
    modifications["theatre.cibles_nombre"] = monde.cibles.length;
  }
  monde.scenario.avions.forEach((groupe, g) => {
    const avions = monde.avions.filter((avion) => avion.groupe === groupe);
    if (!avions.some((avion) => choisis.has(`avion:${avion.id}`))) return;
    modifications[`bleu.avions.${g}.orbites_placees`] = avions.map((avion) => en_degres(bouge(`avion:${avion.id}`, avion.orbite) ?? avion.orbite));
  });
  if (cles.some((c) => c.startsWith("radar:"))) Object.assign(modifications, sites_radars(monde, brut, (i, geo) => bouge(`radar:${i}`, geo)));
  if (cles.some((c) => c.startsWith("centre:"))) {
    modifications["bleu.reseau.centres"] = (brut.bleu.reseau.centres ?? []).map((c, k) => {
      const geo = bouge(`centre:${k}`, geo_deg(c.lat_deg, c.lon_deg));
      return geo ? {...c, ...en_degres(geo)} : c;
    });
  }
  if (choisis.has("conduite")) {
    const centre = en_degres(bouge("conduite", monde.scenario.reseau.centre));
    Object.assign(modifications, {"bleu.reseau.centre_lat_deg": centre.lat_deg, "bleu.reseau.centre_lon_deg": centre.lon_deg});
  }
  if (cles.some((c) => c.startsWith("batterie:"))) {
    modifications["bleu.sol.batteries"] = brut.bleu.sol.batteries.map((b, j) => {
      const geo = bouge(`batterie:${j}`, geo_deg(b.lat_deg, b.lon_deg));
      return geo ? {...b, ...en_degres(geo)} : b;
    });
  }
  if (cles.some((c) => c.startsWith("passage:"))) {
    modifications["rouge.plan_de_vol"] = (brut.rouge.plan_de_vol ?? []).map((p, i) => en_degres(bouge(`passage:${i}`, geo_deg(p.lat_deg, p.lon_deg)) ?? geo_deg(p.lat_deg, p.lon_deg)));
  }
  if (cles.some((c) => c.startsWith("zone:"))) {
    // Une zone se déplace d'un bloc : tous ses sommets subissent la même translation que son barycentre.
    modifications["theatre.zones"] = (brut.theatre.zones ?? []).map((zone, i) => (!choisis.has(`zone:${i}`) ? zone : {
      ...zone, points: points_geo(zone.points).map((p) => en_degres(translater(p, de, vers))),
    }));
  }
  return modifications;
}

/**
 * Rendre les modifications qui inscrivent tous les radars affichés comme sites placés (MODELE § 15.1) : `deplacer(i,
 * geo)` rend la nouvelle position du radar i ou null, `garder(i)` dit s'il reste, `ajouts` ({geo, ...propre}) s'ajoutent
 * à la fin. Un site garde son unité propre et ses surcharges (MODELE § 21.1).
 */
function sites_radars(monde, brut, deplacer = () => null, garder = () => true, ajouts = []) {
  const bruts = brut?.bleu.radar.disposition === "sites" ? brut.bleu.radar.sites : [];
  const propre = (i) => {
    const {lat_deg: _a, lon_deg: _o, ...reste} = bruts[i] ?? {};
    return reste;
  };
  const sites = positions_radars(monde.scenario).map((geo, i) => (garder(i) ? {...propre(i), ...en_degres(deplacer(i, geo) ?? geo)} : null)).filter(Boolean);
  return {"bleu.radar.disposition": "sites", "bleu.radar.sites": [...sites, ...ajouts.map(({geo, ...reste}) => ({...reste, ...en_degres(geo)}))]};
}

/** Rendre les points de sélection des liaisons (milieu de chaque liaison), en mode « liaisons » seulement. */
function milieux_liaisons(monde) {
  if (monde.scenario.reseau.mode !== "liaisons") return [];
  return monde.scenario.reseau.liaisons.map((l, indice) => {
    const [a, b] = [position_noeud(monde, l.de), position_noeud(monde, l.vers)];
    return a && b ? {cle: `liaison:${indice}`, type: "liaison", indice, geo: barycentre([a, b])} : null;
  }).filter(Boolean);
}

/** Rendre le nœud du réseau que désigne un élément éditable : radar, conduite ou groupe de l'avion ; null sinon. */
export function noeud_element(monde, element) {
  if (element.type === "radar") return `radar:${element.indice}`;
  if (element.type === "conduite") return "conduite";
  if (element.type === "centre") return `centre:${element.indice}`;
  if (element.type === "cible") return `sol:${element.indice}`;
  // Une batterie placée partage le nœud des postes de la cible la plus proche (MODELE § 21.2).
  if (element.type === "batterie") return `sol:${monde.postes.find((p) => p.batterie === element.indice)?.cible ?? 0}`;
  if (element.type === "avion") return `avions:${monde.scenario.avions.indexOf(monde.avions[element.indice].groupe)}`;
  return null;
}

/** Rendre les liaisons actuelles du brut, ou celles qui matérialisent le réseau complet. */
const liaisons_actuelles = (monde, brut) => (monde.scenario.reseau.mode === "complet" ? liaisons_par_defaut(monde) : brut.bleu.reseau.liaisons);

/**
 * Rendre les modifications qui relient `de` à `vers` par `moyen` (une liaison existante entre eux change de moyen).
 * Depuis un réseau complet, celui-ci est d'abord matérialisé en liaisons par défaut (MODELE § 15.2).
 */
export function modifications_ajout_liaison(monde, brut, de, vers, moyen) {
  if (!de || !vers || de === vers) return {};
  const autres = liaisons_actuelles(monde, brut).filter((l) => !((l.de === de && l.vers === vers) || (l.de === vers && l.vers === de)));
  return {"bleu.reseau.mode": "liaisons", "bleu.reseau.liaisons": [...autres, {de, vers, moyen}]};
}

/** Rendre les modifications qui reviennent au réseau complet (tout le monde parle avec tout le monde). */
export const modifications_reseau_complet = () => ({"bleu.reseau.mode": "complet", "bleu.reseau.liaisons": []});

/** Rendre les modifications qui ajoutent un centre de détection et de contrôle en `geo` (MODELE § 18). */
export function modifications_ajout_centre(brut, geo) {
  const centres = brut.bleu.reseau.centres ?? [];
  return {"bleu.reseau.centres": [...centres, {nom: `CDC ${centres.length + 2}`, ...en_degres(geo)}]};
}

/** Rendre les modifications qui ajoutent un radar en `geo` (les radars affichés deviennent des sites placés). */
export const modifications_ajout_radar = (monde, geo, brut = null, propre = {}) => sites_radars(monde, brut, undefined, undefined, [{geo, ...propre}]);

/** Rendre les modifications qui ajoutent une zone protégée de sommets `points` (au moins trois). */
export function modifications_ajout_zone(brut, points) {
  const zones = brut.theatre.zones ?? [];
  return {"theatre.zones": [...zones, {nom: `Zone ${zones.length + 1}`, type: "protegee", points: points.map(en_degres)}]};
}

/** Rendre les modifications qui ordonnent aux avions `cles`, à l'instant du monde, de rallier `geo`. */
export function modifications_ordre(brut, monde, cles, geo) {
  const avions = cles.filter((c) => c.startsWith("avion:")).map((c) => Number(c.slice(6)));
  if (!avions.length) return {};
  const ordre = {t_s: monde.t, avions, ...en_degres(geo)};
  return {"bleu.ordres": [...(brut.bleu.ordres ?? []), ordre]};
}

/**
 * Rendre les modifications qui mettent hors service, à l'instant du monde et pour de bon, les radars, le centre de
 * conduite et les liaisons `cles` (MODELE § 15.4). Les avions et les autres éléments sont ignorés.
 */
export function modifications_panne(brut, monde, cles) {
  const elements = cles.map((c) => (c === "conduite" ? c : /^(radar|liaison|centre):\d+$/.test(c) ? c : null)).filter(Boolean);
  if (!elements.length) return {};
  const pannes = elements.map((element) => ({t_s: monde.t, element, duree_s: null}));
  return {"bleu.reseau.pannes": [...(brut.bleu.reseau.pannes ?? []), ...pannes]};
}

/** Rendre les modifications qui ajoutent une cible en `geo` (les cibles existantes sont figées). */
export function modifications_ajout_cible(monde, geo) {
  const placees = [...cibles_en_degres(monde), en_degres(geo)];
  return {"theatre.cibles_placees": placees, "theatre.cibles_nombre": placees.length};
}

/** Rendre les modifications qui ajoutent un point de passage en fin de plan de vol, et passent l'essaim sur ce plan. */
export function modifications_ajout_passage(brut, geo) {
  return {"rouge.plan_de_vol": [...(brut.rouge.plan_de_vol ?? []), en_degres(geo)], "rouge.tactique": "plan_de_vol"};
}

/**
 * Rendre les modifications qui suppriment cibles, radars, batteries, avions (une orbite et un avion de moins dans leur
 * groupe), liaisons, points de passage et zones `cles` (pas la conduite).
 */
export function modifications_suppression(monde, brut, cles) {
  const choisis = new Set(cles);
  const modifications = {};
  if (cles.some((c) => c.startsWith("cible:"))) {
    const restantes = cibles_en_degres(monde).filter((_, i) => !choisis.has(`cible:${i}`));
    // Une zone sans cible n'a pas de sens : on garde au moins une cible.
    if (restantes.length) Object.assign(modifications, {"theatre.cibles_placees": restantes, "theatre.cibles_nombre": restantes.length});
  }
  const radars = positions_radars(monde.scenario);
  const radarsOtes = cles.some((c) => c.startsWith("radar:"));
  if (radarsOtes) Object.assign(modifications, sites_radars(monde, brut, undefined, (i) => !choisis.has(`radar:${i}`)));
  const centresOtes = cles.some((c) => c.startsWith("centre:"));
  if (centresOtes) modifications["bleu.reseau.centres"] = (brut.bleu.reseau.centres ?? []).filter((_, k) => !choisis.has(`centre:${k}`));
  if (monde.scenario.reseau.mode === "liaisons" && (radarsOtes || centresOtes || cles.some((c) => c.startsWith("liaison:")))) {
    let liaisons = liaisons_restantes(brut.bleu.reseau.liaisons, choisis, radarsOtes ? radars.length : 0);
    if (centresOtes) liaisons = renumeroter(liaisons, "centre", (brut.bleu.reseau.centres ?? []).length, choisis);
    modifications["bleu.reseau.liaisons"] = liaisons;
  }
  if (cles.some((c) => c.startsWith("batterie:"))) modifications["bleu.sol.batteries"] = brut.bleu.sol.batteries.filter((_, j) => !choisis.has(`batterie:${j}`));
  Object.assign(modifications, avions_otes(monde, choisis));
  if (radarsOtes || centresOtes) Object.assign(modifications, equipements_restants(brut, choisis, radarsOtes ? radars.length : 0));
  if (cles.some((c) => c.startsWith("passage:"))) {
    modifications["rouge.plan_de_vol"] = (brut.rouge.plan_de_vol ?? []).filter((_, i) => !choisis.has(`passage:${i}`));
  }
  if (cles.some((c) => c.startsWith("zone:"))) {
    modifications["theatre.zones"] = (brut.theatre.zones ?? []).filter((_, i) => !choisis.has(`zone:${i}`));
  }
  return modifications;
}

/** Rendre les modifications qui ôtent les avions choisis : chaque groupe touché perd ces avions et garde les orbites des autres. */
function avions_otes(monde, choisis) {
  const modifications = {};
  monde.scenario.avions.forEach((groupe, g) => {
    const avions = monde.avions.filter((avion) => avion.groupe === groupe);
    const restants = avions.filter((avion) => !choisis.has(`avion:${avion.id}`));
    if (restants.length === avions.length) return;
    modifications[`bleu.avions.${g}.nombre`] = restants.length;
    modifications[`bleu.avions.${g}.orbites_placees`] = restants.map((avion) => en_degres(avion.orbite));
  });
  return modifications;
}

/** Rendre les équipements de communication sans ceux des radars et des centres ôtés, les suivants renumérotés (MODELE § 21.4). */
function equipements_restants(brut, choisis, nombreRadars) {
  const equipements = brut.bleu.reseau.equipements ?? [];
  if (!equipements.length) return {};
  const radars = renommeur("radar", nombreRadars, choisis);
  const centres = renommeur("centre", (brut.bleu.reseau.centres ?? []).length, choisis);
  return {"bleu.reseau.equipements": equipements.map((e) => ({...e, noeud: centres(radars(e.noeud))})).filter((e) => e.noeud)};
}

/** Rendre la fonction qui renomme un nœud `famille:<k>` après l'ablation des choisis (undefined s'il est ôté) ; les autres restent. */
function renommeur(famille, nombre, choisis) {
  const nouveau = new Map();
  for (let i = 0, j = 0; i < nombre; i++) if (!choisis.has(`${famille}:${i}`)) nouveau.set(`${famille}:${i}`, `${famille}:${j++}`);
  return (n) => (n?.startsWith(`${famille}:`) && nombre ? nouveau.get(n) : n);
}

/** Rendre les liaisons restantes : sans celles choisies, sans celles des radars ôtés, radars renumérotés. */
function liaisons_restantes(liaisons, choisis, nombreRadars) {
  const nouveau = new Map();
  for (let i = 0, j = 0; i < nombreRadars; i++) if (!choisis.has(`radar:${i}`)) nouveau.set(`radar:${i}`, `radar:${j++}`);
  const renommer = (n) => (n.startsWith("radar:") && nombreRadars ? nouveau.get(n) : n);
  return liaisons
    .filter((_, i) => !choisis.has(`liaison:${i}`))
    .map((l) => ({...l, de: renommer(l.de), vers: renommer(l.vers)}))
    .filter((l) => l.de && l.vers);
}

/** Rendre les liaisons sans les nœuds `famille:<k>` ôtés, les suivants renumérotés. */
function renumeroter(liaisons, famille, nombre, choisis) {
  const nouveau = new Map();
  for (let i = 0, j = 0; i < nombre; i++) if (!choisis.has(`${famille}:${i}`)) nouveau.set(`${famille}:${i}`, `${famille}:${j++}`);
  const renommer = (n) => (n.startsWith(`${famille}:`) ? nouveau.get(n) : n);
  return liaisons.map((l) => ({...l, de: renommer(l.de), vers: renommer(l.vers)})).filter((l) => l.de && l.vers);
}

/** Rendre les clés des éléments dont la position écran tombe dans le rectangle {x0, y0, x1, y1}. */
export function dans_rectangle(elements, versEcran, rectangle) {
  const [xMin, xMax] = [Math.min(rectangle.x0, rectangle.x1), Math.max(rectangle.x0, rectangle.x1)];
  const [yMin, yMax] = [Math.min(rectangle.y0, rectangle.y1), Math.max(rectangle.y0, rectangle.y1)];
  return elements.filter((e) => {
    const p = versEcran(e.geo);
    return p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax;
  }).map((e) => e.cle);
}

/** Rendre l'élément le plus proche du point écran `point` à moins de `rayonPx`, ou null. */
export function element_sous(elements, versEcran, point, rayonPx = 10) {
  const plus_proche = (liste) => {
    let retenu = null;
    let meilleure = rayonPx;
    for (const element of liste) {
      const p = versEcran(element.geo);
      const ecart = Math.hypot(p.x - point.x, p.y - point.y);
      if (ecart <= meilleure) [meilleure, retenu] = [ecart, element];
    }
    return retenu;
  };
  // Une liaison n'est qu'un point milieu : entre un radar et un centre colocalisés, il masquait le centre.
  return plus_proche(elements.filter((e) => e.type !== "liaison")) ?? plus_proche(elements.filter((e) => e.type === "liaison"));
}

/**
 * Rendre les modifications qui vident la carte : plus de radar, de batterie, de poste, de vecteur défensif, d'autre
 * centre, de liaison, d'équipement, de zone, de plan de vol ni d'ordre. Restent le CDC principal et un site sensible
 * au centre du théâtre : sans cible, l'essaim n'aurait nulle part où aller. Ctrl+Z revient en arrière.
 */
export function modifications_tout_effacer(brut) {
  const {origine_lat_deg: lat_deg, origine_lon_deg: lon_deg} = brut.theatre;
  return {
    "theatre.cibles_placees": [{lat_deg, lon_deg}], "theatre.cibles_nombre": 1, "theatre.zones": [],
    "rouge.plan_de_vol": [], ...(brut.rouge.tactique === "plan_de_vol" ? {"rouge.tactique": "direct"} : {}),
    "bleu.avions": brut.bleu.avions.map((g) => ({...g, nombre: 0, orbites_placees: []})),
    "bleu.sol.nombre": 0, "bleu.sol.munitions": 0, "bleu.sol.batteries": [],
    "bleu.radar.disposition": "sites", "bleu.radar.sites": [],
    "bleu.reseau.mode": "complet", "bleu.reseau.liaisons": [], "bleu.reseau.centres": [], "bleu.reseau.equipements": [], "bleu.reseau.pannes": [],
    ...("ordres" in brut.bleu ? {"bleu.ordres": []} : {}),
  };
}

/** Rendre les modifications qui placent le centre du théâtre en `geo` (arrondi à 0,001°, soit environ 100 m). */
export const modifications_centre_theatre = (geo) => ({
  "theatre.origine_lat_deg": Math.round(vers_degres(geo.lat) * 1000) / 1000, "theatre.origine_lon_deg": Math.round(vers_degres(geo.lon) * 1000) / 1000,
});

/** Rendre les modifications d'un réglage du théâtre ; {} si la valeur n'a pas de sens, le champ gardant alors l'ancienne. */
export function modifications_reglage_theatre(chemin, valeur) {
  const bornes = {"theatre.origine_lat_deg": [-80, 80], "theatre.origine_lon_deg": [-180, 180], "theatre.zone_rayon_km": [1, 3000], "theatre.cibles_nombre": [1, 50]};
  if (!bornes[chemin] || !Number.isFinite(valeur) || valeur < bornes[chemin][0] || valeur > bornes[chemin][1]) return {};
  return {[chemin]: chemin === "theatre.cibles_nombre" ? Math.round(valeur) : valeur};
}

