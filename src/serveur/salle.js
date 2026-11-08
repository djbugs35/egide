// La salle (docs/FORMATS.md § 10) : la partie en cours, son horloge et les commandes des clients. Ne connaît ni socket ni
// temps réel : `tic` reçoit le temps écoulé et `maintenant` mesure le coût des pas, si bien que tout se teste sans réseau.
import {modifier_scenario} from "../moteur/scenario.js";

export const VITESSE_MAX = 60;
// Temps de calcul accordé à chaque tic de la période nominale : le reste sert à envoyer et à répondre aux commandes.
export const BUDGET_MS = 70;
// Un chemin vient du réseau et modifier_scenario crée les nœuds manquants : ces clés atteindraient le prototype d'Object.
const SEGMENTS_INTERDITS = new Set(["__proto__", "prototype", "constructor"]);

export class CommandeInvalide extends Error {}

/** Rendre vrai si `modifications` est un objet {chemin: valeur} dont aucun chemin n'atteint un prototype. */
const modifications_valides = (modifications) => modifications !== null && typeof modifications === "object" && !Array.isArray(modifications) && Object.keys(modifications).every((chemin) => chemin.split(".").every((s) => !SEGMENTS_INTERDITS.has(s)));

/**
 * Rendre la salle de la partie de scénario `brut` : {demarrer(), tic(dt_s), commander(message), arrivee(envoyer)}.
 * `preparer(brut)` (async) rend une partie (voir creer_partie) ; `diffuser(enregistrement)` l'envoie à tous les clients ;
 * `archiver(scenario_joue)` (async) rend ce qu'il faut annoncer à la fin d'un raid ; `maintenant()` donne des ms.
 */
export function creer_salle({brut, preparer, diffuser, archiver, maintenant}) {
  let [partie, pause, vitesse, reserve, obtenue, occupee] = [null, true, 1, 0, 0, false];

  const etat = () => ({genre: "etat", t: partie.instant(), pause, vitesse, vitesse_obtenue: obtenue, termine: partie.termine(), bilan: partie.bilan()});

  /** Mettre en place `nouvelle`, en pause à son instant initial, et l'annoncer à tous. */
  function installer(nouvelle) {
    [partie, pause, reserve, obtenue] = [nouvelle, true, 0, 0];
    nouvelle.ouverture().forEach(diffuser);
    diffuser(etat());
  }

  /** Préparer le scénario `voulu` ; la partie en cours continue si cela échoue, ou tant que ce n'est pas prêt. */
  async function relancer(voulu) {
    occupee = true;
    try {
      installer(await preparer(voulu));
    } finally {
      occupee = false;
    }
  }

  /** Diffuser ce qui s'est passé depuis le dernier relevé ; à la fin du raid, archiver la partie et annoncer l'archive. */
  async function emettre() {
    const lignes = partie.releve();
    lignes.forEach(diffuser);
    diffuser(etat());
    if (lignes.some((ligne) => ligne.genre === "bilan")) diffuser({genre: "archive", ...(await archiver(partie.scenario_joue()))});
  }

  const COMMANDES = {
    pause: () => {
      pause = true;
      diffuser(etat());
    },
    reprendre: () => {
      pause = false;
      diffuser(etat());
    },
    vitesse: ({valeur}) => {
      if (!(valeur > 0 && valeur <= VITESSE_MAX)) throw new CommandeInvalide(`vitesse hors de ]0, ${VITESSE_MAX}] : ${valeur}`);
      vitesse = valeur;
      diffuser(etat());
    },
    ordre: (message) => partie.ordonner(message),
    recommencer: () => relancer(partie.brut),
    modifier: ({modifications}) => {
      if (!modifications_valides(modifications)) throw new CommandeInvalide("modifications illisibles : un objet {chemin: valeur} est attendu");
      return relancer(modifier_scenario(partie.brut, modifications));
    },
  };

  return {
    demarrer: () => relancer(brut),
    /** Avancer la partie du temps écoulé `dt_s` (s) sans dépasser le budget : un retard non rattrapable est abandonné. */
    tic(dt_s) {
      if (!partie || occupee || pause || partie.termine()) return null;
      const {pas} = partie;
      reserve += (dt_s * vitesse) / pas;
      const debut = maintenant();
      let joues = 0;
      while (reserve >= 1 && !partie.termine() && maintenant() - debut < BUDGET_MS) {
        partie.avancer();
        reserve--;
        joues++;
      }
      reserve %= 1;
      obtenue = dt_s > 0 ? (joues * pas) / dt_s : 0;
      return joues ? emettre() : null;
    },
    /** Exécuter la commande `message` du client ; une commande refusée s'annonce à tous, sans toucher la partie. */
    async commander(message) {
      try {
        if (occupee || !partie) throw new CommandeInvalide("partie en cours de préparation");
        if (!Object.hasOwn(COMMANDES, message?.type)) throw new CommandeInvalide(`commande inconnue : ${message?.type}`);
        await COMMANDES[message.type](message);
      } catch (erreur) {
        // Frontière réseau : une commande mauvaise, quelle qu'elle soit, ne doit pas arrêter la partie.
        console.error(`commande ${message?.type} refusée : ${erreur.message}`);
        diffuser({genre: "erreur", commande: message?.type ?? null, message: erreur.message});
      }
    },
    /** Envoyer à un nouveau client de quoi rejoindre la partie en cours. */
    arrivee(envoyer) {
      if (!partie) return;
      partie.ouverture().forEach(envoyer);
      envoyer(etat());
    },
  };
}
