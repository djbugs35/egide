// Édition du scénario depuis un client (docs/FORMATS.md § 10.4). Le client décrit un geste ; le serveur le traduit par les
// mêmes fonctions pures que l'éditeur du navigateur (MODELE § 12), si bien que les deux éditeurs ne peuvent pas diverger.
import {geo_deg, vers_ecef} from "../moteur/geodesie.js";
import {modifier_scenario} from "../moteur/scenario.js";
import {apercu_depot} from "../vue/aides_edition.js";
import {choisir_moyen, modifications_depot, palette} from "../vue/deploiement.js";
import {elements_editables, modifications_ajout_liaison, modifications_ajout_passage, modifications_ajout_zone, modifications_deplacement, modifications_suppression, noeud_element} from "../vue/edition.js";
import {position_noeud} from "../vue/reseau_vue.js";
import {CommandeInvalide} from "./salle.js";

const HISTORIQUE_MAX = 100;
const MOYEN_DEFAUT = "liaisons/radio_vhf_uhf_notionnelle";
const ZONE_POINTS_MIN = 3;

const finis = (...valeurs) => valeurs.every(Number.isFinite);

/** Rendre le point au sol du geste `{e, n}`, ou lever CommandeInvalide. */
function point_du_geste(partie, {e, n}) {
  if (!finis(e, n)) throw new CommandeInvalide(`point invalide : e=${e}, n=${n}`);
  return partie.point(e, n);
}

/** Rendre `cles` si c'est une liste de textes non vide, ou lever CommandeInvalide. */
function cles_du_geste(cles) {
  if (!Array.isArray(cles) || !cles.length || !cles.every((c) => typeof c === "string")) throw new CommandeInvalide("aucun élément désigné");
  return cles;
}

/** Rendre la description de ce qui s'édite : éléments, liaisons et zones, en (e, n) du repère du rejeu. */
export function description_edition(partie) {
  const {monde, brut, repere} = partie;
  const plan = (geo) => {
    const {e, n} = repere(vers_ecef({...geo, alt: geo.alt ?? 0}));
    return {e, n};
  };
  return {
    genre: "elements",
    liste: elements_editables(monde, brut).map(({cle, type, indice, geo}) => ({cle, type, indice, ...plan(geo)})),
    liaisons: monde.scenario.reseau.liaisons.flatMap(({de, vers}) => {
      const [a, b] = [position_noeud(monde, de), position_noeud(monde, vers)];
      return a && b ? [{de: plan(a), vers: plan(b)}] : [];
    }),
    zones: (brut.theatre.zones ?? []).map((zone) => zone.points.map((p) => plan(geo_deg(p.lat_deg, p.lon_deg, 0)))),
  };
}

/** Rendre la palette du catalogue ({familles}), chaque élément avec sa portée au sol pour l'aperçu de dépôt (m, ou null). */
export function message_palette(index, fichiers, altitude_essaim) {
  const familles = palette(index).map(({id, libelle, cible, aide, elements}) => ({
    id, libelle, cible, aide,
    elements: elements.map((e) => ({...e, rayon_m: apercu_depot(e.id, fichiers, altitude_essaim)?.rayon ?? null})),
  }));
  return {genre: "palette", familles};
}

/** Rendre l'extension de salle de l'édition du scénario (voir creer_salle) ; `bibliotheque` : {lister(), lire(id), ecrire(nom, brut)}. */
export function creer_atelier_scenario({index, fichiers, bibliotheque}) {
  return (acces) => {
    const [passe, futur] = [[], []];
    const partie = () => acces.partie();

    function exiger_debut() {
      if (partie().instant() !== 0) throw new CommandeInvalide("l'édition se fait à l'instant initial : lancer d'abord une nouvelle partie");
    }

    /** Relancer sur le scénario modifié, dont l'échec laisse l'historique tel qu'il était. */
    async function appliquer(modifications) {
      if (!Object.keys(modifications).length) throw new CommandeInvalide("ce geste n'a pas d'effet ici");
      const avant = partie().brut;
      await acces.relancer(modifier_scenario(avant, modifications));
      passe.push(avant);
      if (passe.length > HISTORIQUE_MAX) passe.shift();
      futur.length = 0;
    }

    const element_de = (cle) => elements_editables(partie().monde, partie().brut).find((e) => e.cle === cle) ?? null;

    function relier({de, vers, moyen = MOYEN_DEFAUT}) {
      const [a, b] = [element_de(de), element_de(vers)].map((e) => e && noeud_element(partie().monde, e));
      if (!a || !b) throw new CommandeInvalide("une liaison relie deux unités du réseau");
      const choisi = choisir_moyen(partie().brut, fichiers, a, b, moyen);
      if (!choisi) throw new CommandeInvalide("ces deux unités ne partagent aucun moyen de communication");
      return modifications_ajout_liaison(partie().monde, partie().brut, a, b, choisi);
    }

    function zone({points}) {
      if (!Array.isArray(points) || points.length < ZONE_POINTS_MIN) throw new CommandeInvalide(`une zone demande au moins ${ZONE_POINTS_MIN} sommets`);
      return modifications_ajout_zone(partie().brut, points.map((p) => point_du_geste(partie(), p)));
    }

    function deposer({id, e, n, sous = null, quantite = 1}) {
      if (typeof id !== "string" || !(id.startsWith("special/") || id in fichiers)) throw new CommandeInvalide(`unité inconnue : ${id}`);
      return modifications_depot(partie().monde, partie().brut, id, point_du_geste(partie(), {e, n}), {quantite, sous: sous === null ? null : element_de(sous)});
    }

    const GESTES = {
      deposer,
      relier,
      zone,
      passage: (geste) => modifications_ajout_passage(partie().brut, point_du_geste(partie(), geste)),
      deplacer: ({cles, de, vers}) => modifications_deplacement(partie().monde, partie().brut, cles_du_geste(cles), point_du_geste(partie(), de ?? {}), point_du_geste(partie(), vers ?? {})),
      supprimer: ({cles}) => modifications_suppression(partie().monde, partie().brut, cles_du_geste(cles)),
    };

    /** Revenir à l'état au sommet de `depuis`, en rangeant l'état courant dans `vers_pile`. */
    async function voyager(depuis, vers_pile) {
      exiger_debut();
      if (!depuis.length) throw new CommandeInvalide("rien à reprendre");
      const courant = partie().brut;
      await acces.relancer(depuis.at(-1));
      depuis.pop();
      vers_pile.push(courant);
    }

    return {
      arrivee: () => [message_palette(index, fichiers, partie().monde.scenario.rouge.altitude), {genre: "scenarios", liste: bibliotheque.lister()}],
      ouverture: () => (partie().instant() === 0 ? [description_edition(partie())] : []),
      commandes: {
        editer: (message) => {
          exiger_debut();
          if (!Object.hasOwn(GESTES, message.geste)) throw new CommandeInvalide(`geste inconnu : ${message.geste}`);
          return appliquer(GESTES[message.geste](message));
        },
        annuler: () => voyager(passe, futur),
        retablir: () => voyager(futur, passe),
        enregistrer_scenario: ({nom}) => {
          const chemin = bibliotheque.ecrire(nom, partie().brut);
          acces.diffuser({genre: "enregistre", chemin});
          acces.diffuser({genre: "scenarios", liste: bibliotheque.lister()});
        },
        charger_scenario: async ({id}) => {
          await acces.relancer(bibliotheque.lire(id));
          passe.length = 0;
          futur.length = 0;
        },
      },
    };
  };
}
