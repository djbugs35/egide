// Éditeur à la souris, à la manière d'un jeu de stratégie vu de dessus (jalon 3) : sélection au clic ou au rectangle,
// glisser pour déplacer, clic droit pour envoyer la sélection, groupes Ctrl+1–9, outils cible et plan de vol.
// Toute la logique vit dans edition.js ; ici, seulement les gestes et leur dessin.
import {aimanter, apercu_depot, apercu_liaison, consigne_outil, mesure, points_geodesique, regrouper, texte_distance, texte_mesure} from "./aides_edition.js";
import {creer_choix_superposes} from "./choix_superposes.js";
import {COULEURS} from "./couleurs.js";
import {chemin_cercle, ecran, geo_depuis_ecran} from "./ecran.js";
import {
  barycentre, dans_rectangle, element_sous, elements_editables, elements_superposes, libelle_element, modifications_centre_theatre, modifications_ajout_cible, modifications_ajout_passage,
  modifications_ajout_centre, modifications_ajout_radar, modifications_panne, modifications_tout_effacer, modifications_ajout_zone, modifications_reseau_complet, noeud_element, modifications_deplacement, modifications_ordre, modifications_suppression, translater,
} from "./edition.js";
import {element_visible} from "./calques.js";
import {famille_de, modifications_depot, preparer_liaison} from "./deploiement.js";
import {format_duree} from "./format.js";
import {libelle_noeud} from "./reseau_vue.js";

// Pas d'une flèche du clavier, en pixels d'écran.
const PAS_FLECHE = 90;
const FLECHES = {ArrowLeft: [PAS_FLECHE, 0], ArrowRight: [-PAS_FLECHE, 0], ArrowUp: [0, PAS_FLECHE], ArrowDown: [0, -PAS_FLECHE]};
const TOUCHES_OUTILS = {v: "selection", s: "selection", c: "cible", r: "radar", k: "centre", l: "liaison", p: "plan", z: "zone", x: "gomme", m: "mesure"};
// Couleurs du curseur de dépôt : vert pour ajouter, rouge pour effacer (Maj enfoncée, ou outil Gomme).
const AJOUT = "#4cc47a";
const EFFACEMENT = "#e5574b";
// En deçà de 4 px, un appui est un clic, pas un glisser : on ne déplace rien par mégarde.
const SEUIL_GLISSER = 4;
/** Rayon de prise d'une unité (px) : ses symboles débordent de 10 px, un clic sur leur bord les ratait. */
const RAYON_TOUCHE = 14;
/** Outils qui restent armés après un clic, et sous lesquels glisser une unité la déplace. */
const OUTILS_DE_POSE = new Set(["depot", "liaison", "cible", "radar", "centre"]);

/**
 * Rendre l'éditeur branché sur `env` : {vue, toile, barre, camera(), monde(), brut(), calques(), moyen(), appliquer(modifs),
 * annuler(), retablir(), consigne (élément de la ligne d'aide), panoramique(dx, dy), zoom(facteur, point), sur_activation(actif), quantite(), nom(id), signaler(texte),
 * sur_depot(id), choisir_moyen(id), reseau_auto(), aimantation(), fichiers(), preparer_unite(id)}. Un calque masqué ne s'édite pas.
 */
export function creer_editeur(env) {
  // mode « edition » : on prépare le scénario à t = 0 ; mode « ordres » : en pause au cours du raid, on envoie des avions.
  const etat = {actif: false, mode: "edition", outil: "selection", selection: [], groupes: {}, geste: null, brouillon: [], curseur: null, liaison: null, depot: null, maj: false, mesure: null};
  const elements = () => elements_editables(env.monde(), env.brut(), etat.mode).filter((e) => element_visible(env.calques(), e));
  const vers_ecran = (geo) => ecran(env.camera(), geo);
  const choix = creer_choix_superposes(env.vue);

  /** Proposer les unités de `liste` superposées au point écran `p` ; rendre vrai si la liste s'est ouverte, `action` recevant l'unité choisie. */
  function proposer_superposes(liste, p, action) {
    const superposes = elements_superposes(liste, vers_ecran, p, RAYON_TOUCHE);
    if (superposes.length < 2) return false;
    choix.ouvrir(p, superposes.map((element) => ({libelle: libelle_element(env.monde(), element), valeur: element})), action);
    return true;
  }
  const local = (e) => {
    const cadre = env.vue.getBoundingClientRect();
    return {x: e.clientX - cadre.left, y: e.clientY - cadre.top};
  };

  function choisir_outil(outil) {
    choix.fermer();
    etat.outil = outil;
    etat.liaison = null;
    if (outil !== "mesure") etat.mesure = null;
    if (outil !== "depot" && etat.depot) {
      etat.depot = null;
      env.sur_depot(null);
    }
    env.vue.dataset.outil = outil;
    env.barre.querySelectorAll("[data-outil]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.outil === outil)));
  }

  function activer(actif) {
    const mode = env.monde().t > 0 ? "ordres" : "edition";
    Object.assign(etat, {actif, mode, selection: [], geste: null, brouillon: []});
    env.vue.classList.toggle("edition", actif);
    env.vue.dataset.mode = mode;
    env.barre.hidden = !actif;
    env.consigne.hidden = !actif;
    env.barre.querySelector("[data-champ='instant_ordres']").textContent = format_duree(env.monde().t);
    choisir_outil("selection");
    choix.fermer();
    env.sur_activation(actif, mode);
  }

  /** Rendre le point de pose visé en `p`, aimanté selon la barre (édition seulement) ; `exclure` : clés des unités qu'on déplace. */
  function pose(p, exclure = []) {
    const geo = geo_depuis_ecran(env.camera(), p);
    const choix = etat.mode === "edition" ? env.aimantation() : "aucune";
    if (choix === "aucune") return geo;
    if (choix === "unites") return aimanter(geo, p, {type: "unites", elements: elements().filter((e) => !exclure.includes(e.cle)), versEcran: vers_ecran});
    return aimanter(geo, p, {type: "grille", pas: Number(choix), origine: env.monde().scenario.theatre.origine});
  }

  /** Armer le dépôt de l'unité `id` du catalogue (palette) : chaque clic sur la carte en dépose une, jusqu'à Échap. */
  function armer_depot(id) {
    if (!etat.actif) activer(true);
    if (etat.mode !== "edition") return;
    // Un moyen de communication se tire entre deux unités : le clic sur la palette arme donc l'outil Liaison.
    if (famille_de(id)?.id === "liaisons") {
      env.choisir_moyen(id);
      return choisir_outil("liaison");
    }
    choisir_outil("depot");
    etat.depot = id;
    env.sur_depot(id);
  }

  /** Déposer l'unité `id` au point écran `p` ; sur une unité déjà placée si le point en touche une (moyens, armements). */
  function deposer(id, p) {
    const sous = element_sous(elements(), vers_ecran, p, RAYON_TOUCHE);
    const modifications = modifications_depot(env.monde(), env.brut(), id, pose(p), {quantite: env.quantite(), sous});
    if (!Object.keys(modifications).length) return env.signaler(`${env.nom(id)} : à déposer sur une unité déjà placée (et pas deux fois le même moyen).`);
    env.signaler("");
    env.appliquer(modifications);
  }

  /** Rendre vrai si un clic efface : outil Gomme, ou Maj enfoncée pendant un dépôt. */
  const en_effacement = () => etat.outil === "gomme" || (etat.outil === "depot" && etat.maj);

  /** Effacer l'unité sous le point écran `p` (radar, batterie, site, C2, avion, liaison, zone, point de passage). */
  function effacer(p) {
    if (proposer_superposes(elements(), p, effacer_element)) return;
    effacer_element(element_sous(elements(), vers_ecran, p, RAYON_TOUCHE));
  }

  /** Effacer `touche`, ou dire pourquoi c'est impossible. */
  function effacer_element(touche) {
    if (!touche) return env.signaler("Rien à effacer ici : visez une unité.");
    if (touche.type === "conduite") return env.signaler("Le CDC principal ne s'efface pas : déplacez-le.");
    const modifications = modifications_suppression(env.monde(), env.brut(), [touche.cle]);
    if (!Object.keys(modifications).length) return env.signaler("Cette unité ne peut pas être effacée (il faut au moins un site à défendre).");
    env.signaler("");
    etat.selection = etat.selection.filter((cle) => cle !== touche.cle);
    env.appliquer(modifications);
  }

  /** Outil liaison : un clic sur un premier nœud (radar, conduite, avion), un clic sur le second, et la liaison existe. */
  function relier(p) {
    const noeuds = elements().filter((element) => noeud_element(env.monde(), element));
    if (proposer_superposes(noeuds, p, relier_element)) return;
    relier_element(element_sous(noeuds, vers_ecran, p, RAYON_TOUCHE));
  }

  /** Prendre `touche` pour extrémité de la liaison en cours ; à la seconde, tirer la liaison ou dire pourquoi elle est refusée. */
  function relier_element(touche) {
    const noeud = touche && noeud_element(env.monde(), touche);
    // Un clic à côté ne perd pas la première extrémité : on le dit, et l'utilisateur vise de nouveau.
    if (!noeud) return env.signaler("Aucune unité à cet endroit : visez un radar, un centre, un site, une batterie ou un avion.");
    env.signaler("");
    if (!etat.liaison) {
      env.preparer_unite(env.moyen());
      return void (etat.liaison = {noeud, geo: touche.geo});
    }
    const {refus, modifications, resume} = preparer_liaison(env.monde(), env.brut(), env.fichiers(), etat.liaison.noeud, noeud, env.moyen());
    if (refus) return env.signaler(refus);
    etat.liaison = null;
    Promise.resolve(env.appliquer(modifications)).then(() => env.signaler(resume));
  }

  function fermer_zone() {
    if (etat.brouillon.length >= 3) env.appliquer(modifications_ajout_zone(env.brut(), etat.brouillon));
    etat.brouillon = [];
  }

  /** Exécuter l'outil en cours au point écran `p` : un clic sans glissement ; `clics` : 2 pour un double-clic. */
  function agir(p, clics) {
    const geo = pose(p);
    if (en_effacement()) return effacer(p);
    if (etat.outil === "theatre") {
      choisir_outil("selection");
      return env.appliquer(modifications_centre_theatre(geo));
    }
    if (etat.outil === "depot" && etat.depot) return deposer(etat.depot, p);
    if (etat.outil === "cible") return env.appliquer(modifications_ajout_cible(env.monde(), geo));
    if (etat.outil === "radar") return env.appliquer(modifications_ajout_radar(env.monde(), geo));
    if (etat.outil === "centre") return env.appliquer(modifications_ajout_centre(env.brut(), geo));
    if (etat.outil === "liaison") return relier(p);
    if (etat.outil === "plan") return env.appliquer(modifications_ajout_passage(env.brut(), geo));
    if (etat.outil === "zone") {
      // Double-clic (ou Entrée) : la zone se ferme ; le second clic du double-clic n'ajoute pas de sommet.
      if (clics >= 2) return fermer_zone();
      etat.brouillon.push(geo);
    }
  }

  /** Un clic agit au relâchement : si la souris a bougé entre-temps, c'était un déplacement de la carte. */
  const geste_clic = (p, action) => ({type: "clic", depart: p, dernier: p, deplace: false, action});
  /** Glisser `touche` ; sans mouvement au relâchement, `au_clic` s'exécute (outil de pose armé sur une unité). */
  const geste_glisser = (p, touche, au_clic = null) => ({type: "glisser", depart: p, de: touche.geo, vers: touche.geo, deplace: false, cle: touche.cle, au_clic});

  /** Rendre l'unité déplaçable sous le point écran `p`, ou null (une liaison ne se déplace pas). */
  function deplacable_sous(p) {
    const touche = element_sous(elements(), vers_ecran, p, RAYON_TOUCHE);
    return touche?.type === "liaison" ? null : touche;
  }

  function commencer(e) {
    // Cliquer ailleurs referme la liste sans agir ; un clic droit ne doit pas, en plus, quitter l'outil.
    if (choix.fermer()) return void (etat.menu_contextuel_ignore = e.button === 2);
    const p = local(e);
    if (e.button === 1 || (e.button === 0 && (e.altKey || etat.espace))) {
      etat.geste = {type: "panoramique", dernier: p};
      return;
    }
    if (e.button !== 0) return;
    if (etat.outil === "mesure") {
      const geo = pose(p);
      etat.mesure = {de: geo, vers: geo};
      etat.geste = {type: "mesure"};
      return;
    }
    if (etat.outil !== "selection") {
      const clics = e.detail;
      const action = () => agir(p, clics);
      // L'outil reste armé après une pose : glisser l'unité qu'on vient de poser doit la déplacer, pas la carte.
      const sous = OUTILS_DE_POSE.has(etat.outil) && !en_effacement() ? deplacable_sous(p) : null;
      etat.geste = sous ? geste_glisser(p, sous, action) : geste_clic(p, action);
      return;
    }
    const touche = element_sous(elements(), vers_ecran, p, RAYON_TOUCHE);
    if (touche) {
      if (!etat.selection.includes(touche.cle)) etat.selection = e.shiftKey ? [...etat.selection, touche.cle] : [touche.cle];
      // En mode ordres, on ne déplace pas un avion en vol : on le sélectionne, puis on l'envoie au clic droit.
      const au_clic = e.shiftKey ? null : () => proposer_superposes(elements(), p, (element) => (etat.selection = [element.cle]));
      if (etat.mode === "edition") etat.geste = touche.type === "liaison" ? geste_clic(p, () => {}) : geste_glisser(p, touche, au_clic);
    } else if (e.shiftKey || etat.mode === "ordres") {
      // En cours de raid, le cadre reste le geste principal : c'est lui qui choisit les avions à envoyer.
      if (!e.shiftKey) etat.selection = [];
      etat.geste = {type: "rectangle", rectangle: {x0: p.x, y0: p.y, x1: p.x, y1: p.y}, ajout: e.shiftKey};
    } else {
      etat.geste = geste_clic(p, () => (etat.selection = []));
    }
  }

  /** Clic droit en préparation : quitter l'outil en cours, ou à défaut vider la sélection. */
  function abandonner() {
    etat.brouillon = [];
    if (etat.outil !== "selection") choisir_outil("selection");
    else etat.selection = [];
  }

  function suivre(e) {
    etat.curseur = local(e);
    etat.maj = e.shiftKey;
    const geste = etat.geste;
    if (!geste) return;
    const p = local(e);
    if (geste.type === "clic") {
      geste.deplace ||= Math.hypot(p.x - geste.depart.x, p.y - geste.depart.y) > SEUIL_GLISSER;
      if (geste.deplace) env.panoramique(p.x - geste.dernier.x, p.y - geste.dernier.y);
      geste.dernier = p;
    } else if (geste.type === "panoramique") {
      env.panoramique(p.x - geste.dernier.x, p.y - geste.dernier.y);
      geste.dernier = p;
    } else if (geste.type === "glisser") {
      geste.deplace ||= Math.hypot(p.x - geste.depart.x, p.y - geste.depart.y) > SEUIL_GLISSER;
      if (geste.deplace && !etat.selection.includes(geste.cle)) etat.selection = [geste.cle];
      if (geste.deplace) geste.vers = pose(p, etat.selection);
    } else if (geste.type === "mesure") {
      etat.mesure.vers = pose(p);
    } else {
      Object.assign(geste.rectangle, {x1: p.x, y1: p.y});
    }
  }

  function terminer() {
    const geste = etat.geste;
    etat.geste = null;
    if (geste?.type === "clic" && !geste.deplace) geste.action();
    else if (geste?.type === "glisser" && geste.deplace) {
      env.appliquer(modifications_deplacement(env.monde(), env.brut(), etat.selection, geste.de, geste.vers));
    } else if (geste?.type === "glisser") {
      geste.au_clic?.();
    } else if (geste?.type === "rectangle") {
      const cles = dans_rectangle(elements(), vers_ecran, geste.rectangle);
      etat.selection = geste.ajout ? [...new Set([...etat.selection, ...cles])] : cles;
    }
  }

  /** Envoyer la sélection au point visé : en édition, son barycentre y vient (formation conservée) ; en ordres, les avions y vont. */
  function envoyer(e) {
    const choisis = elements().filter((element) => etat.selection.includes(element.cle));
    if (!choisis.length) return;
    const vers = geo_depuis_ecran(env.camera(), local(e));
    if (etat.mode === "ordres") return env.appliquer(modifications_ordre(env.brut(), env.monde(), etat.selection, vers));
    env.appliquer(modifications_deplacement(env.monde(), env.brut(), etat.selection, barycentre(choisis.map((c) => c.geo)), vers));
  }

  function clavier(e) {
    if (!etat.actif || e.target.closest("input, select, textarea")) return;
    const commande = e.ctrlKey || e.metaKey;
    const chiffre = /^Digit([1-9])$/.exec(e.code)?.[1];
    // Tab et Maj parcourent la liste ; toute autre touche la referme, car elle peut changer les unités proposées.
    if (e.key !== "Tab" && e.key !== "Shift" && choix.fermer() && e.key === "Escape") return e.preventDefault();
    if (e.key === "Escape" && etat.liaison) etat.liaison = null;
    else if (e.key === "Escape" && etat.brouillon.length) etat.brouillon = [];
    else if (e.key === "Enter" && etat.outil === "zone") fermer_zone();
    else if (e.key === "Escape") etat.outil === "selection" ? (etat.selection = []) : choisir_outil("selection");
    else if ((e.key === "Delete" || e.key === "Backspace") && etat.mode === "ordres") {
      // En cours de raid, on ne supprime rien : on met hors service, à cet instant.
      env.appliquer(modifications_panne(env.brut(), env.monde(), etat.selection));
      etat.selection = [];
    } else if (e.key === "Delete" || e.key === "Backspace") {
      env.appliquer(modifications_suppression(env.monde(), env.brut(), etat.selection));
      etat.selection = [];
    } else if (commande && e.key.toLowerCase() === "z" && e.shiftKey) env.retablir();
    else if (commande && e.key.toLowerCase() === "y") env.retablir();
    else if (commande && e.key.toLowerCase() === "z") env.annuler();
    else if (FLECHES[e.code] && etat.mode === "edition") env.panoramique(...FLECHES[e.code]);
    else if (chiffre && commande) etat.groupes[chiffre] = [...etat.selection];
    else if (chiffre) etat.selection = [...(etat.groupes[chiffre] ?? [])];
    else if (!commande && etat.mode === "edition" && TOUCHES_OUTILS[e.key.toLowerCase()]) choisir_outil(TOUCHES_OUTILS[e.key.toLowerCase()]);
    else return;
    e.preventDefault();
  }

  const si_actif = (fonction) => (e) => etat.actif && fonction(e);
  env.toile.addEventListener("pointerdown", si_actif((e) => {
    env.toile.setPointerCapture(e.pointerId);
    commencer(e);
  }));
  env.toile.addEventListener("pointermove", si_actif(suivre));
  env.toile.addEventListener("pointerup", si_actif(terminer));
  env.toile.addEventListener("contextmenu", si_actif((e) => {
    e.preventDefault();
    if (etat.menu_contextuel_ignore) return void (etat.menu_contextuel_ignore = false);
    if (etat.mode === "ordres") envoyer(e);
    else abandonner();
  }));
  env.toile.addEventListener("wheel", si_actif((e) => {
    e.preventDefault();
    choix.fermer();
    env.zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, local(e));
  }), {passive: false});
  addEventListener("keydown", clavier);
  // Maj suivie à part : le curseur de dépôt passe au rouge dès qu'on l'enfonce, sans attendre un mouvement.
  addEventListener("keydown", (e) => {
    if (e.key === "Shift") etat.maj = true;
    if (e.code !== "Space" || !etat.actif || etat.mode !== "edition" || e.target.closest("input, select, textarea")) return;
    etat.espace = true;
    e.preventDefault();
  });
  addEventListener("keyup", (e) => e.code === "Space" && (etat.espace = false));
  addEventListener("keyup", (e) => e.key === "Shift" && (etat.maj = false));
  addEventListener("blur", () => Object.assign(etat, {maj: false, espace: false}));
  // Glisser-déposer depuis la palette : la vue entière reçoit le dépôt, carte comprise.
  env.vue.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("text/egide-unite")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  env.vue.addEventListener("drop", (e) => {
    const id = e.dataTransfer.getData("text/egide-unite");
    if (!id) return;
    e.preventDefault();
    if (!etat.actif) activer(true);
    if (etat.mode === "edition") deposer(id, local(e));
  });
  env.barre.addEventListener("click", (e) => {
    const bouton = e.target.closest("button");
    if (bouton?.dataset.outil) choisir_outil(bouton.dataset.outil);
    if (bouton?.dataset.action === "annuler_edition") env.annuler();
    if (bouton?.dataset.action === "retablir_edition") env.retablir();
    if (bouton?.dataset.action === "terminer_edition") activer(false);
    if (bouton?.dataset.action === "reseau_complet") env.appliquer(modifications_reseau_complet());
    if (bouton?.dataset.action === "reseau_auto") env.reseau_auto();
    if (bouton?.dataset.action === "tout_effacer") {
      etat.selection = [];
      // Le message suit le rechargement, qui efface l'ancien.
      Promise.resolve(env.appliquer(modifications_tout_effacer(env.brut())))
        .then(() => env.signaler("Carte vidée : il reste le CDC principal et un site à défendre. Ctrl+Z (Annuler) revient en arrière."));
    }
    if (bouton?.dataset.action === "mettre_hors_service") {
      env.appliquer(modifications_panne(env.brut(), env.monde(), etat.selection));
      etat.selection = [];
    }
  });

  /** Curseur de dépôt et d'effacement : « + unité » en vert, « − Effacer » en rouge, l'unité visée cerclée de rouge. */
  function dessiner_curseur(ctx) {
    if (!etat.curseur || (!etat.depot && etat.outil !== "gomme")) return;
    const {x, y} = etat.curseur;
    ctx.font = "bold 13px system-ui, sans-serif";
    if (!en_effacement()) {
      ctx.fillStyle = AJOUT;
      ctx.fillText(`+ ${env.nom(etat.depot)}`, x + 12, y - 10);
      return;
    }
    const touche = element_sous(elements(), vers_ecran, etat.curseur, RAYON_TOUCHE);
    ctx.fillStyle = EFFACEMENT;
    ctx.fillText(touche ? "− Effacer" : "−", x + 12, y - 10);
    if (!touche) return;
    const p = vers_ecran(touche.geo);
    ctx.strokeStyle = EFFACEMENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, 2 * Math.PI);
    ctx.moveTo(p.x - 7, p.y - 7);
    ctx.lineTo(p.x + 7, p.y + 7);
    ctx.moveTo(p.x + 7, p.y - 7);
    ctx.lineTo(p.x - 7, p.y + 7);
    ctx.stroke();
  }

  /** Dessiner zones, plan de vol et ordres (toujours) puis, en édition, la sélection, le glisser, le rectangle, le brouillon. */
  function dessiner(ctx, camera, monde) {
    const calques = env.calques();
    if (calques.zones) dessiner_zones(ctx, camera, monde);
    if (calques.plan) dessiner_plan(ctx, camera, monde);
    if (calques.missions) dessiner_ordres(ctx, camera, monde);
    if (!etat.actif) return;
    afficher_consigne();
    dessiner_brouillon(ctx, camera);
    dessiner_groupes(ctx, camera);
    dessiner_apercu(ctx, camera, monde);
    dessiner_mesure(ctx, camera);
    dessiner_curseur(ctx);
    if (etat.liaison && etat.curseur) {
      const p = ecran(camera, etat.liaison.geo);
      ctx.strokeStyle = COULEURS.selection;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(etat.curseur.x, etat.curseur.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const choisis = elements().filter((element) => etat.selection.includes(element.cle));
    const geste = etat.geste;
    const survol = etat.outil === "selection" && !geste && etat.curseur ? element_sous(elements(), vers_ecran, etat.curseur, RAYON_TOUCHE) : null;
    if (survol && !etat.selection.includes(survol.cle)) {
      const p = ecran(camera, survol.geo);
      ctx.strokeStyle = COULEURS.texte;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.strokeStyle = COULEURS.selection;
    ctx.lineWidth = 1.5;
    for (const element of choisis) {
      const p = ecran(camera, element.geo);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, 2 * Math.PI);
      ctx.stroke();
      if (geste?.type === "glisser" && geste.deplace) {
        const q = ecran(camera, translater(element.geo, geste.de, geste.vers));
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.arc(q.x, q.y, 9, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (geste?.type === "rectangle") {
      const {x0, y0, x1, y1} = geste.rectangle;
      ctx.fillStyle = "rgba(242, 242, 242, 0.08)";
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }

  /** Écrire `texte` sur un cartouche, lisible sur tout fond de carte. */
  function etiquette(ctx, texte, x, y, couleur) {
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.fillStyle = COULEURS.fond;
    ctx.fillRect(x - 4, y - 13, ctx.measureText(texte).width + 8, 18);
    ctx.fillStyle = couleur;
    ctx.fillText(texte, x, y);
  }

  /** Porter le nombre d'avions superposés à l'écran, dont les symboles se cachent les uns les autres. */
  function dessiner_groupes(ctx, camera) {
    const avions = elements().filter((element) => element.type === "avion").map((element) => ecran(camera, element.geo));
    for (const {x, y, nombre} of regrouper(avions)) etiquette(ctx, `×${nombre}`, x + 12, y - 12, COULEURS.texte);
  }

  /** Montrer, avant de poser : portée du radar ou bulle de la batterie au point visé, portée de la liaison en cours. */
  function dessiner_apercu(ctx, camera, monde) {
    if (!etat.curseur) return;
    const id = etat.depot ?? (etat.outil === "radar" ? env.brut().bleu.radar.unite : null);
    const apercu = id && !en_effacement() ? apercu_depot(id, env.fichiers(), monde.scenario.rouge.altitude) : null;
    if (apercu) {
      dessiner_disque(ctx, camera, pose(etat.curseur), apercu.rayon, AJOUT);
      etiquette(ctx, `${apercu.libelle} ${texte_distance(apercu.rayon)}`, etat.curseur.x + 12, etat.curseur.y + 12, AJOUT);
    }
    if (!etat.liaison) return;
    const portee = apercu_liaison(monde, etat.liaison.noeud, env.moyen(), env.fichiers());
    if (portee === null) return;
    const distance = mesure(etat.liaison.geo, geo_depuis_ecran(camera, etat.curseur)).distance;
    const couleur = distance > portee ? EFFACEMENT : AJOUT;
    dessiner_disque(ctx, camera, etat.liaison.geo, portee, couleur);
    etiquette(ctx, `${texte_distance(distance)} / portée ${texte_distance(portee)}`, etat.curseur.x + 12, etat.curseur.y + 12, couleur);
  }

  function dessiner_disque(ctx, camera, centre, rayon, couleur) {
    chemin_cercle(ctx, camera, centre, rayon, 96);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = couleur;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = couleur;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Tracer la règle le long de la géodésique, avec distance et cap ; elle reste posée jusqu'au changement d'outil. */
  function dessiner_mesure(ctx, camera) {
    if (!etat.mesure) return;
    const {de, vers} = etat.mesure;
    const points = points_geodesique(de, vers).map((geo) => ecran(camera, geo));
    ctx.strokeStyle = COULEURS.selection;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    for (const p of [points[0], points.at(-1)]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      ctx.stroke();
    }
    const fin = points.at(-1);
    etiquette(ctx, texte_mesure(mesure(de, vers)), fin.x + 10, fin.y - 10, COULEURS.selection);
  }

  function dessiner_zones(ctx, camera, monde) {
    ctx.font = "12px system-ui, sans-serif";
    monde.zones.forEach((zone, i) => {
      const protegee = zone.type === "protegee";
      ctx.beginPath();
      zone.points.forEach((point, j) => {
        const p = ecran(camera, point);
        if (j === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = protegee ? "rgba(227, 234, 241, 0.07)" : "rgba(227, 234, 241, 0.03)";
      ctx.fill();
      ctx.setLineDash(protegee ? [10, 5] : [2, 4]);
      ctx.strokeStyle = COULEURS.texte;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
      const centre = ecran(camera, zone.centre);
      ctx.fillStyle = COULEURS.texte;
      ctx.textAlign = "center";
      ctx.fillText(zone.nom, centre.x, centre.y - 4);
      if (protegee) {
        ctx.fillStyle = monde.incursions[i].size ? COULEURS.hostile : COULEURS.texte_secondaire;
        ctx.fillText(`${monde.incursions[i].size} incursions`, centre.x, centre.y + 12);
      }
      ctx.textAlign = "start";
    });
  }

  function dessiner_ordres(ctx, camera, monde) {
    ctx.strokeStyle = COULEURS.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    for (const avion of monde.avions) {
      if (!avion.ordre) continue;
      const [a, b] = [ecran(camera, avion.geo), ecran(camera, avion.point)];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.moveTo(b.x - 5, b.y - 5);
      ctx.lineTo(b.x + 5, b.y + 5);
      ctx.moveTo(b.x + 5, b.y - 5);
      ctx.lineTo(b.x - 5, b.y + 5);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /** Tenir à jour la ligne de consigne ; on n'écrit que si le texte change : cette fonction tourne à chaque image. */
  function afficher_consigne() {
    const texte = consigne_outil({outil: etat.outil, mode: etat.mode, nom_depot: etat.depot && env.nom(etat.depot), efface: en_effacement(), liaison: etat.liaison, nom_moyen: env.nom(env.moyen()), origine: etat.liaison && libelle_noeud(env.monde(), etat.liaison.noeud), sommets: etat.brouillon.length, choisis: etat.selection.length});
    if (env.consigne.textContent !== texte) env.consigne.textContent = texte;
  }

  function dessiner_brouillon(ctx, camera) {
    if (!etat.brouillon.length) return;
    const points = etat.brouillon.map((geo) => ecran(camera, geo));
    if (etat.curseur) points.push(etat.curseur);
    ctx.strokeStyle = COULEURS.selection;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of points.slice(0, etat.brouillon.length)) ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
  }

  function dessiner_plan(ctx, camera, monde) {
    const {plan_de_vol: plan, comportement} = monde.scenario.rouge;
    if (!plan.length || !comportement.endsWith("plan_de_vol")) return;
    const points = plan.map((geo) => ecran(camera, geo));
    ctx.strokeStyle = COULEURS.hostile;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    points.forEach((p, i) => {
      ctx.fillStyle = COULEURS.fond;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COULEURS.texte;
      ctx.fillText(String(i + 1), p.x, p.y + 4);
    });
    ctx.textAlign = "start";
  }

  return {activer, dessiner, armer_depot, choisir_outil, est_actif: () => etat.actif, mode: () => etat.mode, selection: () => etat.selection};
}
