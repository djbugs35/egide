// Débriefing de fin de raid (MODELE § 28) : note, causes des frappes, tireurs, capteurs, chronologie et points faibles,
// lus dans l'état final du monde et son journal. Pur : ni DOM ni horloge, testé sous Node.

export const CAUSES = {
  non_detectee: "non détectée",
  inconnue: "détectée, inconnue de la conduite",
  jamais_engagee: "connue, jamais engagée",
  manquee: "engagée, manquée",
};
const BAREME = [["A", 0.95], ["B", 0.85], ["C", 0.7], ["D", 0.5]];
const TRANCHE_CHRONOLOGIE = 300;
const POINTS_FAIBLES_MAX = 5;

/** Rendre la note (A à E) d'un taux d'interception dans [0, 1]. */
export const note_defense = (taux) => BAREME.find(([, seuil]) => taux >= seuil)?.[0] ?? "E";

/** Rendre la clé de CAUSES qui explique la frappe du drone, d'après ses tirs (§ 28.2). */
export function cause_frappe(drone, tirs) {
  if (drone.detection === null) return "non_detectee";
  if (drone.connu === null) return "inconnue";
  return tirs ? "manquee" : "jamais_engagee";
}

/** Rendre la clé la plus fréquente d'un compte {clé: nombre}, ou null s'il est vide. */
const dominante = (compte) => Object.entries(compte).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

/** Rendre {tirs par drone, tirs par tireur ("air:<groupe>" ou "sol:<poste>")} d'après le journal. */
function lire_tirs(monde) {
  const parDrone = new Map();
  const parTireur = new Map();
  for (const e of monde.evenements ?? []) {
    if (e.type !== "tir") continue;
    parDrone.set(e.drone, (parDrone.get(e.drone) ?? 0) + 1);
    const cle = `${e.couche}:${e.tireur}`;
    const fiche = parTireur.get(cle) ?? {tirs: 0, coups: 0, dernier: 0};
    Object.assign(fiche, {tirs: fiche.tirs + 1, coups: fiche.coups + (e.detruit ? 1 : 0), dernier: e.t});
    parTireur.set(cle, fiche);
  }
  return {parDrone, parTireur};
}

/** Rendre le nom affiché d'une cible. */
const nom_cible = (monde, k) => (monde.cibles[k]?.conduite ? "CDC" : `C${k + 1}`);

/** Rendre les frappes analysées : leur cause globale et, par cible, leur nombre et leur cause dominante. */
function analyser_frappes(monde, parDrone) {
  const causes = Object.fromEntries(Object.keys(CAUSES).map((c) => [c, 0]));
  const cibles = monde.cibles.map((_, k) => ({cible: k, nom: nom_cible(monde, k), frappes: 0, causes: {}}));
  for (const drone of monde.drones) {
    if (!drone.arrive) continue;
    const cause = cause_frappe(drone, parDrone.get(drone.id) ?? 0);
    causes[cause]++;
    const fiche = cibles[drone.cible];
    fiche.frappes++;
    fiche.causes[cause] = (fiche.causes[cause] ?? 0) + 1;
  }
  return {causes, cibles: cibles.map((c) => ({...c, cause: dominante(c.causes)}))};
}

/** Rendre les tireurs regroupés par unité : tirs, coups, réussite, postes épuisés et premier instant d'épuisement. */
function analyser_tireurs(monde, parTireur) {
  const unites = new Map();
  const ajouter = (cle, nom, couche, fiche, epuise) => {
    const u = unites.get(cle) ?? {nom, couche, tirs: 0, coups: 0, epuises: 0, premier_epuisement: null};
    u.tirs += fiche?.tirs ?? 0;
    u.coups += fiche?.coups ?? 0;
    if (epuise) {
      u.epuises++;
      u.premier_epuisement = Math.min(u.premier_epuisement ?? Infinity, fiche?.dernier ?? 0);
    }
    unites.set(cle, u);
  };
  for (const poste of monde.postes) {
    const fiche = parTireur.get(`sol:${poste.id}`);
    const unite = poste.unite ?? monde.scenario.sol;
    ajouter(`sol:${unite.id}`, unite.nom, "sol", fiche, poste.munitions === 0 && (fiche?.tirs ?? 0) > 0);
  }
  for (const avion of monde.avions) {
    ajouter(`air:${avion.groupe.id}`, avion.groupe.nom, "air", parTireur.get(`air:${avion.id}`), false);
  }
  return [...unites.values()].filter((u) => u.tirs > 0).map((u) => ({...u, reussite: u.coups / u.tirs})).sort((a, b) => b.tirs - a.tirs);
}

/** Rendre les premières détections par radar et la chronologie des frappes (tranches de 5 min). */
function analyser_temps(monde) {
  const detections = new Map();
  const tranches = [];
  for (const e of monde.evenements ?? []) {
    if (e.type === "detection" && e.radar !== null && e.radar !== undefined) detections.set(e.radar, (detections.get(e.radar) ?? 0) + 1);
    if (e.type === "impact") {
      const rang = Math.floor(e.t / TRANCHE_CHRONOLOGIE);
      while (tranches.length <= rang) tranches.push(0);
      tranches[rang]++;
    }
  }
  const radars = (monde.reseau?.radars ?? []).map((_, i) => ({radar: i, detections: detections.get(i) ?? 0}));
  return {radars, chronologie: tranches.map((frappes, i) => ({debut: i * TRANCHE_CHRONOLOGIE, frappes}))};
}

const pourcent = (x) => `${Math.round(100 * x)} %`;
const minutes = (s) => `${Math.floor(s / 60)} min`;

/** Rendre les constats chiffrés du § 28.4, au plus cinq. */
function points_faibles(resume) {
  const {causes, cibles, tireurs, radars, frappes, munitions_air} = resume;
  const constats = [];
  const principale = dominante(causes);
  if (frappes && principale) constats.push(`${pourcent(causes[principale] / frappes)} des frappes : ${CAUSES[principale]}.`);
  const pire = [...cibles].sort((a, b) => b.frappes - a.frappes)[0];
  if (pire?.frappes) constats.push(`${pire.nom} est la cible la plus frappée (${pire.frappes}), surtout : ${CAUSES[pire.cause]}.`);
  const epuises = tireurs.filter((t) => t.epuises > 0);
  if (epuises.length) {
    const premier = Math.min(...epuises.map((t) => t.premier_epuisement));
    constats.push(`${epuises.reduce((s, t) => s + t.epuises, 0)} postes épuisés, le premier à ${minutes(premier)}.`);
  }
  const muets = radars.filter((r) => r.detections === 0);
  if (muets.length) constats.push(`${muets.length} radar${muets.length > 1 ? "s" : ""} sans aucune détection : ${muets.map((r) => `R${r.radar + 1}`).join(", ")}.`);
  if (frappes && munitions_air.initiales && munitions_air.restantes / munitions_air.initiales > 0.5) {
    constats.push(`Aviation sous-employée : ${pourcent(munitions_air.restantes / munitions_air.initiales)} des munitions air restent.`);
  }
  return constats.slice(0, POINTS_FAIBLES_MAX);
}

/** Rendre le débriefing complet d'un monde terminé, tenu avec son journal (MODELE § 28). */
export function debriefer(monde) {
  const {parDrone, parTireur} = lire_tirs(monde);
  const menaces = monde.drones.length;
  const interceptees = monde.drones.filter((d) => !d.vivant).length;
  const frappes = monde.drones.filter((d) => d.arrive).length;
  const taux = menaces ? interceptees / menaces : 0;
  const {causes, cibles} = analyser_frappes(monde, parDrone);
  const tireurs = analyser_tireurs(monde, parTireur);
  const {radars, chronologie} = analyser_temps(monde);
  const munitions_air = {
    initiales: monde.scenario.avions.reduce((s, g) => s + g.nombre * g.emport_nombre, 0),
    restantes: monde.avions.reduce((s, a) => s + a.munitions, 0),
  };
  const resume = {menaces, interceptees, frappes, taux, note: note_defense(taux), duree: monde.t, causes, cibles, tireurs, radars, chronologie, munitions_air};
  return {...resume, points_faibles: points_faibles(resume)};
}
