// Édition du relief depuis un client (docs/FORMATS.md § 10.5) : une grille d'altitudes au format des terrains du catalogue,
// retouchée au pinceau. Outil d'auteur : c'est le fichier enregistré que le moteur lit, jamais le pinceau.
import {vers_degres} from "../moteur/geodesie.js";
import {modifier_scenario} from "../moteur/scenario.js";
import {CommandeInvalide} from "./salle.js";

// Bornes des altitudes acceptées : au-delà, une erreur de pinceau plutôt qu'un relief.
const ALTITUDE_MIN = -500;
const ALTITUDE_MAX = 9000;
const METRES_PAR_DEGRE = 111_320;
const OUTILS = new Set(["elever", "abaisser", "aplanir", "lisser"]);
const RAPPEL_MAX = 0.5;
const HISTORIQUE_MAX = 30;
const RAYON_MIN_M = 100;
const RAYON_MAX_M = 200_000;
const FORCE_MAX_M = 1000;
const NOM_VALIDE = /^[\p{L}\p{N}_-]{1,64}$/u;
const KM_PAR_DEGRE = 111.32;

export const encoder_altitudes = (z) => Buffer.from(z.buffer, z.byteOffset, z.byteLength).toString("base64");

/** Rendre la grille éditable (altitudes copiées) de l'unité de terrain `unite`, telle qu'écrite dans son fichier. */
export function grille_depuis_unite(unite) {
  const octets = Buffer.from(unite.altitudes_b64, "base64");
  const z = new Int16Array(octets.length / 2);
  for (let k = 0; k < z.length; k++) z[k] = octets.readInt16LE(2 * k);
  if (z.length !== unite.lignes * unite.colonnes) throw new CommandeInvalide(`terrain : ${z.length} altitudes pour ${unite.lignes} × ${unite.colonnes}`);
  const {lat_sud_deg, lon_ouest_deg, pas_lat_deg, pas_lon_deg, pas_km, lignes, colonnes} = unite;
  return {lat_sud_deg, lon_ouest_deg, pas_lat_deg, pas_lon_deg, pas_km, lignes, colonnes, z};
}

/** Rendre une grille à l'altitude 0, carrée, de demi-côté `rayon_km`, centrée en (lat_deg, lon_deg), au pas `pas_km`. */
export function grille_plate({lat_deg, lon_deg, rayon_km, pas_km}) {
  const demi = Math.ceil(rayon_km / pas_km);
  const pas_lat_deg = pas_km / KM_PAR_DEGRE;
  const pas_lon_deg = pas_km / (KM_PAR_DEGRE * Math.cos((lat_deg * Math.PI) / 180));
  const cote = 2 * demi + 1;
  return {lat_sud_deg: lat_deg - demi * pas_lat_deg, lon_ouest_deg: lon_deg - demi * pas_lon_deg, pas_lat_deg, pas_lon_deg, pas_km, lignes: cote, colonnes: cote, z: new Int16Array(cote * cote)};
}

/** Rendre la moyenne des huit voisins et du nœud (i, j), bornée à la grille. */
function moyenne_locale(grille, i, j) {
  let [somme, n] = [0, 0];
  for (let a = Math.max(0, i - 1); a <= Math.min(grille.lignes - 1, i + 1); a++) {
    for (let b = Math.max(0, j - 1); b <= Math.min(grille.colonnes - 1, j + 1); b++) {
      somme += grille.z[a * grille.colonnes + b];
      n++;
    }
  }
  return somme / n;
}

/**
 * Appliquer un coup de pinceau à `grille` ; rendre le rectangle retouché {i0, j0, lignes, colonnes}, ou null s'il est
 * hors de la grille. `cible` (m) : hauteur visée par « aplanir ». Poids en cosinus surélevé, nul au bord du pinceau.
 */
export function appliquer_pinceau(grille, {outil, lat_deg, lon_deg, rayon_m, force_m, cible}) {
  const pas_nord = grille.pas_lat_deg * METRES_PAR_DEGRE;
  const pas_est = grille.pas_lon_deg * METRES_PAR_DEGRE * Math.cos((lat_deg * Math.PI) / 180);
  const ic = (lat_deg - grille.lat_sud_deg) / grille.pas_lat_deg;
  const jc = (lon_deg - grille.lon_ouest_deg) / grille.pas_lon_deg;
  const [di, dj] = [rayon_m / pas_nord, rayon_m / pas_est];
  const [i0, i1] = [Math.max(0, Math.ceil(ic - di)), Math.min(grille.lignes - 1, Math.floor(ic + di))];
  const [j0, j1] = [Math.max(0, Math.ceil(jc - dj)), Math.min(grille.colonnes - 1, Math.floor(jc + dj))];
  if (i0 > i1 || j0 > j1) return null;
  const avant = outil === "lisser" ? {...grille, z: grille.z.slice()} : null;
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const distance = Math.hypot((i - ic) * pas_nord, (j - jc) * pas_est);
      if (distance >= rayon_m) continue;
      const poids = 0.5 * (1 + Math.cos((Math.PI * distance) / rayon_m));
      const k = i * grille.colonnes + j;
      const z = grille.z[k];
      const rappel = Math.min(RAPPEL_MAX, poids * RAPPEL_MAX);
      const nouveau = outil === "elever" ? z + force_m * poids
        : outil === "abaisser" ? z - force_m * poids
          : outil === "aplanir" ? z + (cible - z) * rappel
            : z + (moyenne_locale(avant, i, j) - z) * rappel;
      grille.z[k] = Math.max(ALTITUDE_MIN, Math.min(ALTITUDE_MAX, Math.round(nouveau)));
    }
  }
  return {i0, j0, lignes: i1 - i0 + 1, colonnes: j1 - j0 + 1};
}

/** Rendre l'altitude (m) du nœud le plus proche de (lat_deg, lon_deg), bornée à la grille. */
export function altitude_noeud(grille, lat_deg, lon_deg) {
  const i = Math.max(0, Math.min(grille.lignes - 1, Math.round((lat_deg - grille.lat_sud_deg) / grille.pas_lat_deg)));
  const j = Math.max(0, Math.min(grille.colonnes - 1, Math.round((lon_deg - grille.lon_ouest_deg) / grille.pas_lon_deg)));
  return grille.z[i * grille.colonnes + j];
}

/** Rendre le fichier d'unité de terrain de `grille` (FORMATS § 2.5), nommé `nom`. */
export function unite_de_grille(grille, nom, origine_texte) {
  const {z, ...geometrie} = grille;
  return {
    herite_de: "terrains/_terrain", nom: `Terrain édité : ${nom}`, fidelite: "notionnel",
    sources: [`Relief retouché à la main dans l'éditeur d'Égide, à partir de : ${origine_texte}. Ne décrit pas un terrain mesuré.`],
    ...geometrie, altitudes_b64: encoder_altitudes(z),
  };
}

const message_grille = (genre, id, grille, retouche) => {
  const {z, ...geometrie} = grille;
  return {genre, id, retouche, ...geometrie, altitudes_b64: encoder_altitudes(z)};
};

/** Rendre l'enregistrement « terrain » de la partie : la grille du scénario, ou id null s'il n'en cite pas. */
export function message_terrain(partie) {
  const t = partie.terrain;
  if (!t) return {genre: "terrain", id: null};
  return {
    genre: "terrain", id: t.id, lat_sud_deg: vers_degres(t.lat_sud), lon_ouest_deg: vers_degres(t.lon_ouest), pas_lat_deg: vers_degres(t.pas_lat), pas_lon_deg: vers_degres(t.pas_lon),
    lignes: t.lignes, colonnes: t.colonnes, altitudes_b64: t.altitudes_b64,
  };
}

/** Rendre le morceau {i0, j0, lignes, colonnes, altitudes_b64} de `grille` décrit par `rectangle`. */
function retouche_de(grille, rectangle) {
  const {i0, j0, lignes, colonnes} = rectangle;
  const z = new Int16Array(lignes * colonnes);
  for (let i = 0; i < lignes; i++) z.set(grille.z.subarray((i0 + i) * grille.colonnes + j0, (i0 + i) * grille.colonnes + j0 + colonnes), i * colonnes);
  return {genre: "terrain_retouche", ...rectangle, altitudes_b64: encoder_altitudes(z)};
}

/**
 * Rendre l'extension de salle de l'édition du relief. `lire_unite(id)` rend le fichier d'un terrain du catalogue,
 * `ecrire_terrain(nom, unite)` l'enregistre et rend son identifiant.
 */
export function creer_atelier_terrain({lire_unite, ecrire_terrain}) {
  return (acces) => {
    let [grille, id, origine_texte, cible] = [null, null, "", 0];
    const [passe, futur] = [[], []];

    function ouvrir(nouvelle, nouvel_id, texte) {
      [grille, id, origine_texte] = [nouvelle, nouvel_id, texte];
      passe.length = 0;
      futur.length = 0;
      acces.diffuser(message_grille("atelier_terrain", id, grille, false));
    }

    const exiger_grille = () => {
      if (!grille) throw new CommandeInvalide("aucun terrain ouvert");
    };

    function voyager(depuis, vers_pile) {
      exiger_grille();
      if (!depuis.length) throw new CommandeInvalide("rien à reprendre");
      vers_pile.push(grille.z.slice());
      grille.z = depuis.pop();
      acces.diffuser(message_grille("atelier_terrain", id, grille, true));
    }

    const lire_point = ({e, n}) => {
      if (!Number.isFinite(e) || !Number.isFinite(n)) throw new CommandeInvalide(`point invalide : e=${e}, n=${n}`);
      const point = acces.partie().point(e, n);
      return {lat_deg: vers_degres(point.lat), lon_deg: vers_degres(point.lon)};
    };

    return {
      commandes: {
        terrain_ouvrir: async ({id: voulu}) => {
          if (typeof voulu !== "string") throw new CommandeInvalide("terrain non désigné");
          ouvrir(grille_depuis_unite(await lire_unite(voulu)), voulu, voulu);
        },
        terrain_nouveau: ({rayon_km = 320, pas_km = 2}) => {
          if (!(rayon_km > 0 && pas_km > 0 && rayon_km / pas_km <= 1000)) throw new CommandeInvalide("dimensions de terrain invalides");
          const {lat_deg, lon_deg} = acces.partie().origine_deg();
          ouvrir(grille_plate({lat_deg, lon_deg, rayon_km, pas_km}), null, "un terrain plat");
        },
        // Début d'un trait : un seul retour en arrière pour tout ce trait.
        terrain_debut: (message) => {
          exiger_grille();
          const {lat_deg, lon_deg} = lire_point(message);
          cible = altitude_noeud(grille, lat_deg, lon_deg);
          passe.push(grille.z.slice());
          if (passe.length > HISTORIQUE_MAX) passe.shift();
          futur.length = 0;
        },
        terrain_pinceau: ({outil, rayon_m, force_m, e, n}) => {
          exiger_grille();
          if (!OUTILS.has(outil)) throw new CommandeInvalide(`outil inconnu : ${outil}`);
          if (!(rayon_m >= RAYON_MIN_M && rayon_m <= RAYON_MAX_M && force_m > 0 && force_m <= FORCE_MAX_M)) throw new CommandeInvalide("réglage de pinceau hors bornes");
          const rectangle = appliquer_pinceau(grille, {outil, ...lire_point({e, n}), rayon_m, force_m, cible});
          if (rectangle) acces.diffuser(retouche_de(grille, rectangle));
        },
        terrain_annuler: () => voyager(passe, futur),
        terrain_retablir: () => voyager(futur, passe),
        terrain_enregistrer: async ({nom}) => {
          exiger_grille();
          if (typeof nom !== "string" || !NOM_VALIDE.test(nom)) throw new CommandeInvalide("nom invalide : lettres, chiffres, - et _ seulement");
          id = ecrire_terrain(nom, unite_de_grille(grille, nom, origine_texte));
          acces.diffuser({genre: "enregistre", chemin: id});
          await acces.relancer(modifier_scenario(acces.partie().brut, {"theatre.terrain": id}));
        },
      },
    };
  };
}
