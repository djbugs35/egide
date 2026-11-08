// Partie jouée en direct (docs/PLAN_JEU.md étape 5, MODELE § 26, docs/FORMATS.md § 10) : le raid avance pas à pas et reçoit
// des ordres du joueur. Mêmes enregistrements que le rejeu. Pur : ni réseau, ni horloge, Node et navigateur.
import {ajouter, depuis_ecef, depuis_enu, geo_deg, vers_degres, vers_ecef} from "./geodesie.js";
import {avancer_monde, bilan, creer_monde, est_termine} from "./monde.js";
import {empreinte} from "./preuve.js";
import {creer_lieu, creer_repere, en_lieux, entete, image, ligne_couvertures, statique} from "./rejeu.js";
import {en_v2, modifier_scenario, resoudre_scenario} from "./scenario.js";

export class OrdreInvalide extends Error {}

// Mesuré à 500 km de l'origine : la première passe ne fait que mesurer ; trois corrections laissent moins d'un millimètre.
const PASSES_NIVEAU_MER = 4;
// 1e-7 degré, soit 1 cm au sol, comme le rejeu.
const DECIMALES_DEGRE = 7;

const arrondi_degre = (valeur) => Math.round(valeur * 10 ** DECIMALES_DEGRE) / 10 ** DECIMALES_DEGRE;

/** Rendre le point {lat, lon, alt: 0} (rad) situé à (`e`, `n`) m de `origine`, dans le plan du repère ENU du rejeu. */
export function point_au_sol(origine, e, n) {
  const centre = vers_ecef(origine);
  let [point, u] = [null, 0];
  for (let passe = 0; passe < PASSES_NIVEAU_MER; passe++) {
    point = depuis_ecef(ajouter(centre, depuis_enu(origine, {e, n, u})));
    u -= point.alt;
  }
  return {lat: point.lat, lon: point.lon, alt: 0};
}

/** Lever OrdreInvalide si l'ordre n'est pas {avions: rangs de vecteurs existants, e et n finis}. */
function verifier_ordre({avions, e, n}, nombre_vecteurs) {
  const rang_valide = (id) => Number.isInteger(id) && id >= 0 && id < nombre_vecteurs;
  if (!Array.isArray(avions) || !avions.length || !avions.every(rang_valide)) throw new OrdreInvalide(`ordre sans vecteur valide : ${JSON.stringify(avions)}`);
  if (!Number.isFinite(e) || !Number.isFinite(n)) throw new OrdreInvalide(`point d'ordre invalide : e=${e}, n=${n}`);
}

/**
 * Rendre une partie du scénario `donne`, à l'instant initial : {ouverture(), avancer(), releve(), ordonner(ordre),
 * instant(), termine(), bilan(), scenario_joue(), brut, pas (s)}. Un scénario joué avec ses ordres, relu par `simuler`, redonne
 * exactement la même partie (MODELE § 26).
 */
export async function creer_partie(donne, fichiers, registre) {
  const brut = en_v2(donne);
  const scenario = resoudre_scenario(brut, fichiers);
  const trace = await empreinte(brut, fichiers, registre);
  const {pas} = scenario.simulation;
  const origine = {...scenario.theatre.origine, alt: scenario.theatre.origine.alt ?? 0};
  const repere = creer_repere(origine);
  const lieu = creer_lieu(repere);
  const monde = creer_monde(scenario, {registre, journal: true});
  const tete = entete(brut, fichiers, scenario, trace, {pas, duree: null, images: null});
  const fixes = statique(monde, lieu);
  const joues = [];
  const attente = [];
  let [journalises, reseau, derniere_image, bilan_donne] = [0, monde.reseau, monde.t, false];

  /** Ranger ce que le dernier pas a produit, dans l'ordre du rejeu : évènements, puis couvertures si le réseau a changé. */
  function collecter() {
    for (; journalises < monde.evenements.length; journalises++) attente.push({genre: "evenement", ...en_lieux(monde.evenements[journalises], lieu)});
    if (monde.reseau === reseau) return;
    reseau = monde.reseau;
    attente.push(ligne_couvertures(monde, lieu));
  }

  /** Placer l'ordre après ceux de même instant et avant ceux, déjà prévus au scénario, qui le suivent. */
  function inserer(ordre) {
    const suivant = scenario.ordres.findIndex((o, rang) => rang >= monde.ordres_appliques && o.t > ordre.t);
    scenario.ordres.splice(suivant < 0 ? scenario.ordres.length : suivant, 0, ordre);
  }

  return {
    brut,
    pas,
    monde,
    repere,
    terrain: scenario.theatre.terrain,
    origine,
    /** Rendre le point au sol (rad) situé à (`e`, `n`) m de l'origine. */
    point: (e, n) => point_au_sol(origine, e, n),
    origine_deg: () => ({lat_deg: vers_degres(origine.lat), lon_deg: vers_degres(origine.lon)}),
    instant: () => monde.t,
    termine: () => est_termine(monde),
    bilan: () => bilan(monde),
    /** Rendre ce qu'un client doit recevoir en arrivant : en-tête, statique (munitions de départ), couvertures et image courantes. */
    ouverture: () => [tete, fixes, ligne_couvertures(monde, lieu), image(monde, repere)],
    /** Avancer d'un pas ; sans effet quand le raid est fini. */
    avancer() {
      if (est_termine(monde)) return;
      avancer_monde(monde);
      collecter();
    },
    /** Rendre et oublier ce qui s'est passé depuis le dernier relevé : évènements, image courante, puis le bilan une seule fois. */
    releve() {
      const lignes = attente.splice(0);
      if (monde.t !== derniere_image) {
        derniere_image = monde.t;
        lignes.push(image(monde, repere));
      }
      if (est_termine(monde) && !bilan_donne) {
        bilan_donne = true;
        lignes.push({genre: "bilan", ...bilan(monde)});
      }
      return lignes;
    },
    /** Envoyer les vecteurs `avions` (rangs) rallier (`e`, `n`, m) ; l'ordre part au pas suivant, comme celui d'un scénario à cet instant. */
    ordonner({avions, e, n}) {
      if (est_termine(monde)) throw new OrdreInvalide("le raid est terminé");
      verifier_ordre({avions, e, n}, monde.avions.length);
      const vise = point_au_sol(origine, e, n);
      const ordre = {t_s: monde.t + pas, avions: [...avions], lat_deg: arrondi_degre(vers_degres(vise.lat)), lon_deg: arrondi_degre(vers_degres(vise.lon))};
      joues.push(ordre);
      // Par geo_deg, comme à la résolution : le point rejoué est identique au bit près.
      inserer({t: ordre.t_s, avions: ordre.avions, point: geo_deg(ordre.lat_deg, ordre.lon_deg, 0)});
    },
    /** Rendre le scénario v2 qui rejoue cette partie : le scénario de départ et les ordres donnés. */
    scenario_joue: () => modifier_scenario(brut, {"bleu.ordres": [...(brut.bleu.ordres ?? []), ...joues]}),
  };
}
