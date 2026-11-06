// Point d'entrée de l'interface : charge le scénario, branche réglages, scope, lecture, tableau et balayage.
import {AlgoInvalide, charger_algos, ids_algos} from "../moteur/algos.js";
import {CatalogueInvalide, charger_unites} from "../moteur/catalogue.js";
import {positions_radars} from "../moteur/radars.js";
import {en_v2, ids_unites, modifier_scenario, resoudre_scenario, ScenarioInvalide} from "../moteur/scenario.js";
import {brancher_balayage, montrer} from "./balayage.js";
import {creer_camera, deplacer, zoomer} from "./camera.js";
import {cadrer_carte, creer_carte} from "./carte.js";
import {charger_index} from "./catalogue_prive.js";
import {lire_reglages_carte, memoriser_reglages_carte, style_carte} from "./carte_style.js";
import {aide_chemin, valeur_effective} from "./chemins.js";
import {CALQUES, calques_par_defaut, lire_calques, memoriser_calques} from "./calques.js";
import {creer_editeur} from "./editeur.js";
import {choisir_moyen, modifications_reseau_auto, palette} from "./deploiement.js";
import {fiches} from "./fiche.js";
import {couleur_pays, PAYS} from "./pays.js";
import {libelle_noeud, MOYENS_PAR_DEFAUT} from "./reseau_vue.js";
import {resume_situation} from "./situation.js";
import {FAMILLES, lignes_journal} from "./journal.js";
import {brancher_autoconfig} from "./autoconfig_panneau.js";
import {enregistrer_dans_bibliotheque, lire_bibliotheque_locale} from "./bibliotheque.js";
import {dessiner_inspection, inspection} from "./inspecteur.js";
import {dessiner_profil} from "./profil.js";
import {altitudes_relief, echantillonner_chemin} from "./relief.js";
import {publier_couleurs} from "./couleurs.js";
import {absorber, creer_effets, sauter} from "./effets.js";
import {format_duree} from "./format.js";
import {decrire} from "./infobulles.js";
import {MULTIPLICATEURS, aller_a, avancer_temps_reel, creer_lecteur} from "./lecteur.js";
import {enregistrer_prereglage, exporter_scenario, lire_prereglages} from "./prereglages.js";
import {brancher_panneaux} from "./panneaux.js";
import {construire_reglages} from "./reglages.js";
import {dessiner_scope, trouver_sous_curseur} from "./scope.js";
import {mettre_a_jour_tableau} from "./tableau.js";
import {creer_traces, echantillonner} from "./traces.js";

const $ = (selecteur) => document.querySelector(selecteur);
const mouvementReduit = matchMedia("(prefers-reduced-motion: reduce)");
// Un tour de faisceau toutes les 4 s simulées : le balayage visible suit le rythme des plots.
const VITESSE_BALAYAGE = (2 * Math.PI) / 4;

const etat = {base: null, modifications: {}, fichiers: {}, registre: {}, lecteur: null, traces: creer_traces(), effets: creer_effets(),
  camera: null, survol: null, angle: 0, dernierTableau: 0, afficher_reglages: null,
  carte: null, sources_carte: {}, reglages_carte: lire_reglages_carte(), cadrage: null, editeur: null, historique: [], inspection: null, derniereInspection: 0,
  calques: lire_calques(), panneaux: null, vue_pc: false, familles: new Set(Object.keys(FAMILLES)), dernierJournal: 0, journal: []};

const brut_courant = () => modifier_scenario(etat.base, etat.modifications);

async function lire_json(chemin) {
  const reponse = await fetch(chemin);
  if (!reponse.ok) throw new Error(`${reponse.status} sur ${chemin}`);
  return reponse.json();
}

/** Charger les unités du catalogue que cite `brut` et qui ne sont pas encore en mémoire. */
async function completer_catalogue(brut) {
  const manquantes = ids_unites(brut).filter((id) => !(id in etat.fichiers));
  if (manquantes.length) Object.assign(etat.fichiers, await charger_unites(manquantes, lire_json));
}

/** Charger les algorithmes que fait tourner le scénario résolu et qui ne sont pas encore en mémoire. */
async function completer_registre(scenario) {
  const manquants = ids_algos(scenario).filter((id) => !(id in etat.registre));
  const importer = (chemin) => import(new URL(chemin, document.baseURI).href);
  if (manquants.length) Object.assign(etat.registre, await charger_algos(manquants, importer));
}

const contexte_reglages = () => ({
  valeur: (chemin) => valeur_effective(brut_courant(), etat.fichiers, chemin),
  aide: (chemin) => aide_chemin(brut_courant(), etat.fichiers, chemin),
});

async function charger() {
  const enLecture = etat.lecteur?.enLecture ?? false;
  const multiplicateur = etat.lecteur?.multiplicateur ?? 1;
  const brut = brut_courant();
  try {
    await completer_catalogue(brut);
    const scenario = resoudre_scenario(brut, etat.fichiers);
    await completer_registre(scenario);
    etat.lecteur = creer_lecteur(scenario, etat.registre);
  } catch (erreur) {
    if (!(erreur instanceof ScenarioInvalide || erreur instanceof CatalogueInvalide || erreur instanceof AlgoInvalide)) throw erreur;
    $("[data-champ='message']").textContent = `Scénario refusé : ${erreur.message}`;
    return;
  }
  $("[data-champ='message']").textContent = "";
  Object.assign(etat.lecteur, {enLecture, multiplicateur});
  etat.traces = creer_traces();
  etat.effets = creer_effets();
  const {monde} = etat.lecteur;
  const nombres = {avion: monde.avions.length, drone: monde.drones.length, cible: monde.cibles.length, radar: positions_radars(monde.scenario).length, conduite: 1, centre: monde.scenario.reseau.centres.length};
  const existe = etat.inspection && etat.inspection.id < nombres[etat.inspection.type];
  if (etat.inspection && !existe) inspecter(null);
  $("[name='temps']").max = Math.ceil(etat.lecteur.duree);
  $("[name='graine']").value = brut.simulation.graine;
  cadrer();
  rafraichir_profil();
}

let minuterie = null;
function modifier(modification) {
  Object.assign(etat.modifications, modification);
  clearTimeout(minuterie);
  // Un raid se rejoue en entier pour connaître sa durée : on attend que le curseur se pose.
  minuterie = setTimeout(charger, 200);
}

const avec_carte = () => Boolean(etat.carte) && !etat.reglages_carte.scope_seul;

/** Recaler canevas et caméra sur la vue ; `forcer` recadre même si le théâtre n'a pas changé (double-clic). */
function cadrer(forcer = false) {
  const toile = $("#scope");
  const ratio = devicePixelRatio || 1;
  const [largeur, hauteur] = [Math.round(toile.clientWidth * ratio), Math.round(toile.clientHeight * ratio)];
  // Ne toucher aux tailles que si elles changent : redimensionner relance l'observateur de taille, et une carte
  // redimensionnée à chaque image tombait à 0,5 image/s.
  const tailleChangee = toile.width !== largeur || toile.height !== hauteur;
  if (tailleChangee) [toile.width, toile.height] = [largeur, hauteur];
  $("#vue").classList.toggle("avec-carte", avec_carte());
  const {monde} = etat.lecteur ?? {};
  if (!monde) return;
  const {origine} = monde.scenario.theatre;
  const rayon = monde.rayonDetection * 1.08;
  // En édition, la vue ne bouge pas sous la souris : un radar déposé loin agrandit le théâtre sans recadrer.
  const enEdition = etat.editeur?.est_actif() && !forcer;
  if (!avec_carte()) {
    if (!enEdition || tailleChangee || etat.camera?.type === "carte") etat.camera = creer_camera(toile.clientWidth, toile.clientHeight, rayon, origine);
    return;
  }
  if (tailleChangee) etat.carte.resize();
  etat.camera = {type: "carte", carte: etat.carte, largeur: toile.clientWidth, hauteur: toile.clientHeight};
  // On ne recadre la carte que si le théâtre change : un zoom ou une inclinaison de l'utilisateur sont respectés.
  const cadrage = `${origine.lat},${origine.lon},${rayon}`;
  if (forcer || (cadrage !== etat.cadrage && !enEdition)) cadrer_carte(etat.carte, origine, rayon);
  etat.cadrage = cadrage;
}

function image(maintenant, precedent) {
  // L'image suivante est demandée d'abord : une erreur de dessin ne doit pas figer l'affichage.
  requestAnimationFrame((suivant) => image(suivant, maintenant));
  const {lecteur} = etat;
  if (lecteur && etat.camera) {
    const fini = avancer_temps_reel(lecteur, (maintenant - precedent) / 1000, (monde) => echantillonner(etat.traces, monde));
    if (lecteur.enLecture) etat.angle = (lecteur.monde.t * VITESSE_BALAYAGE) % (2 * Math.PI);
    absorber(etat.effets, lecteur.monde, maintenant);
    const ctx = $("#scope").getContext("2d");
    ctx.setTransform(devicePixelRatio || 1, 0, 0, devicePixelRatio || 1, 0, 0);
    dessiner_scope(ctx, etat.camera, {monde: lecteur.monde, traces: etat.traces, effets: etat.effets, maintenant,
      angle: etat.angle, balayage: lecteur.enLecture && !mouvementReduit.matches, survol: etat.survol, calques: etat.calques, percue: etat.vue_pc});
    etat.editeur?.dessiner(ctx, etat.camera, lecteur.monde);
    rafraichir_fiche();
    dessiner_inspection(ctx, etat.camera, etat.inspection, lecteur.monde);
    if (fini || maintenant - etat.dernierTableau > 100) rafraichir_commandes(maintenant);
  }
}

/** Mettre à jour le panneau de l'inspecteur (au plus quatre fois par seconde : le texte se lit, il ne s'anime pas). */
function rafraichir_inspection(maintenant, forcer = false) {
  if (!etat.inspection || (!forcer && maintenant - etat.derniereInspection < 250)) return;
  etat.derniereInspection = maintenant;
  $("[data-zone='inspection']").innerHTML = inspection(etat.inspection, etat.lecteur.monde);
}

/** Montrer la fiche de déploiement des éléments sélectionnés dans l'éditeur ; refaite quand la sélection ou le scénario change. */
function rafraichir_fiche() {
  const editeur = etat.editeur;
  const cles = editeur?.est_actif() && editeur.mode() === "edition" ? editeur.selection() : [];
  const signature = `${cles.join(",")}|${etat.historique.length}|${JSON.stringify(etat.modifications).length}|${Boolean(etat.lecteur)}`;
  if (signature === etat.signature_fiche) return;
  etat.signature_fiche = signature;
  $(".fiche").hidden = !cles.length;
  if (!cles.length || !etat.lecteur) return;
  const nom = (id) => etat.noms_unites?.[id] ?? id;
  etat.fiches = fiches(cles, etat.lecteur.monde, brut_courant(), {index: etat.index_unites ?? [], algos: etat.index_algos ?? [], nom});
  $("[data-zone='fiche']").innerHTML = etat.fiches.map((f, i) => `<section><h3>${echapper_html(f.titre)}</h3>${f.note ? `<p class="note">${echapper_html(f.note)}</p>` : ""}
    ${f.controles.map((c, j) => controle_html(c, i, j)).join("")}</section>`).join("");
}

/** Rendre le HTML d'un contrôle de fiche, repéré par sa fiche `i` et son rang `j`. */
function controle_html(c, i, j) {
  const repere = `data-fiche="${i}" data-controle="${j}"`;
  const option = (o) => `<option value="${echapper_html(o.valeur)}" ${o.valeur === c.valeur ? "selected" : ""}>${echapper_html(o.libelle.replace(/ \(notionnel(le)?\)$/, ""))}</option>`;
  if (c.type === "choix") return `<label>${c.libelle}<select ${repere}>${c.options.map(option).join("")}</select></label>`;
  if (c.type === "nombre") return `<label>${c.libelle}<input type="number" ${repere} value="${c.valeur}" min="${c.min}" step="${c.pas}"></label>`;
  if (c.type === "texte") return `<label>${c.libelle}<input ${repere} value="${echapper_html(c.valeur)}"></label>`;
  return `<fieldset ${repere}><legend>${c.libelle} (aucun : tout moyen accepté)</legend>${c.options.map((o) =>
    `<label><input type="checkbox" value="${echapper_html(o.valeur)}" ${c.valeur.includes(o.valeur) ? "checked" : ""}>${echapper_html(o.libelle.replace(/ \(notionnel(le)?\)$/, ""))}</label>`).join("")}</fieldset>`;
}

/** Appliquer le réglage d'un contrôle de fiche changé par l'utilisateur. */
function brancher_fiche() {
  $("[data-zone='fiche']").addEventListener("change", (e) => {
    const porteur = e.target.closest("[data-controle]");
    if (!porteur) return;
    const controle = etat.fiches[Number(porteur.dataset.fiche)].controles[Number(porteur.dataset.controle)];
    const valeur = controle.type === "cases" ? [...porteur.querySelectorAll("input:checked")].map((c) => c.value)
      : controle.type === "nombre" ? Number(e.target.value) : e.target.value;
    appliquer_edition(controle.modifications(valeur));
  });
}

/** Brancher la sauvegarde du déploiement (bibliothèque du navigateur, export) et l'import d'un fichier de scénario. */
function brancher_sauvegarde() {
  $("[data-action='ranger_deploiement']").addEventListener("click", () => {
    const nom = $("[name='nom_deploiement']").value.trim() || brut_courant().nom;
    const brut = {...brut_courant(), nom};
    $("[data-champ='message']").textContent = enregistrer_dans_bibliotheque(nom, brut) ? `« ${nom} » rangé dans la bibliothèque : panneau Scénario pour le recharger.` : "Ce navigateur refuse d'enregistrer : exportez le scénario.";
    remplir_bibliotheque();
  });
  $("[data-action='exporter_deploiement']").addEventListener("click", () => {
    const nom = $("[name='nom_deploiement']").value.trim();
    exporter_scenario(nom ? {...brut_courant(), nom} : brut_courant(), `egide-${(nom || "deploiement").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
  });
  for (const champ of ["importer_deploiement", "importer_scenario"]) {
    $(`[name='${champ}']`).addEventListener("change", async (e) => {
      const fichier = e.target.files[0];
      e.target.value = "";
      if (!fichier) return;
      try {
        await remplacer_base(JSON.parse(await fichier.text()));
      } catch (erreur) {
        $("[data-champ='message']").textContent = `Fichier illisible : ${erreur.message}`;
      }
    });
  }
}

function inspecter(cible) {
  etat.inspection = cible;
  $(".inspecteur").hidden = !cible;
  if (cible) rafraichir_inspection(performance.now(), true);
}

/** Remplir le panneau Journal (au plus trois fois par seconde, et seulement s'il est ouvert). */
function rafraichir_journal(maintenant, forcer = false) {
  if (etat.panneaux?.ouvert() !== "journal" || (!forcer && maintenant - etat.dernierJournal < 330)) return;
  etat.dernierJournal = maintenant;
  const lignes = lignes_journal(etat.lecteur.monde).filter((l) => etat.familles.has(l.famille)).slice(-200).reverse();
  etat.journal = lignes;
  $("[data-zone='journal']").innerHTML = lignes.length
    ? lignes.map((l, i) => `<li class="${l.famille}" data-ligne="${i}"><time>${format_duree(l.t)}</time><span>${l.texte}</span></li>`).join("")
    : `<li class="vide"><time></time><span>Rien encore : lancez la lecture.</span></li>`;
}

function brancher_journal() {
  const filtres = $("[data-zone='filtres_journal']");
  filtres.innerHTML = Object.entries(FAMILLES).map(([id, libelle]) => `<label><input type="checkbox" value="${id}" checked>${libelle}</label>`).join("");
  filtres.addEventListener("change", (e) => {
    if (e.target.checked) etat.familles.add(e.target.value);
    else etat.familles.delete(e.target.value);
    rafraichir_journal(performance.now(), true);
  });
  $("[data-zone='journal']").addEventListener("click", (e) => {
    const ligne = etat.journal[Number(e.target.closest("[data-ligne]")?.dataset.ligne)];
    if (ligne?.cible) inspecter(ligne.cible);
  });
}

function rafraichir_commandes(maintenant) {
  const {lecteur} = etat;
  etat.dernierTableau = maintenant;
  rafraichir_journal(maintenant);
  rafraichir_inspection(maintenant);
  mettre_a_jour_tableau($("#tableau"), lecteur.monde);
  $("[name='temps']").value = lecteur.monde.t;
  $("[data-champ='horloge']").textContent = `${format_duree(lecteur.monde.t)} sur ${format_duree(lecteur.duree)}`;
  if (etat.vue_pc) {
    const s = resume_situation(lecteur.monde);
    $("[data-champ='bandeau_pc']").textContent = `Vue du CDC : ${s.connus} drone${s.connus > 1 ? "s" : ""} connu${s.connus > 1 ? "s" : ""} sur ${s.en_vol} en vol, ${s.pistes} piste${s.pistes > 1 ? "s" : ""}`;
  }
  $("[data-action='lire']").textContent = lecteur.enLecture ? "Pause" : lecteur.monde.t >= lecteur.duree ? "Rejouer" : "Lire";
}

function sauter_a(t) {
  if (t < etat.lecteur.monde.t) etat.traces = creer_traces();
  aller_a(etat.lecteur, t, (monde) => echantillonner(etat.traces, monde));
  sauter(etat.effets, etat.lecteur.monde);
}

function basculer_lecture() {
  const {lecteur} = etat;
  // Lire, c'est quitter l'édition : on ne modifie pas un raid en cours.
  if (etat.editeur?.est_actif()) etat.editeur.activer(false);
  if (lecteur.monde.t >= lecteur.duree) sauter_a(0);
  lecteur.enLecture = !lecteur.enLecture;
}

function basculer_vue_pc() {
  etat.vue_pc = !etat.vue_pc;
  $("[data-action='vue_pc']").setAttribute("aria-pressed", String(etat.vue_pc));
  $("[data-champ='bandeau_pc']").hidden = !etat.vue_pc;
}

function brancher_transport() {
  $("[data-action='vue_pc']").addEventListener("click", basculer_vue_pc);
  $("[name='terrain']").addEventListener("change", (e) => modifier({"theatre.terrain": e.target.value || null}));
  $("[name='conduite_ciblee']").addEventListener("change", (e) => modifier({"bleu.reseau.conduite_ciblee": e.target.checked}));
  $("[data-action='lire']").addEventListener("click", basculer_lecture);
  $("[data-action='debut']").addEventListener("click", () => sauter_a(0));
  $("[name='temps']").addEventListener("input", (e) => sauter_a(Number(e.target.value)));
  const vitesses = $("[data-zone='vitesses']");
  vitesses.innerHTML = MULTIPLICATEURS.map((m) => `<label><input type="radio" name="vitesse" value="${m}" ${m === 1 ? "checked" : ""}>×${String(m).replace(".", ",")}</label>`).join("");
  vitesses.addEventListener("change", (e) => (etat.lecteur.multiplicateur = Number(e.target.value)));
  $("[name='graine']").addEventListener("change", (e) => modifier({"simulation.graine": Number(e.target.value)}));
  $("[data-action='autre_graine']").addEventListener("click", () => modifier({"simulation.graine": Math.floor(Math.random() * 1e6)}));
  document.querySelectorAll("[name='tactique']").forEach((bouton) => bouton.addEventListener("change", () => modifier({"rouge.tactique": bouton.value})));
  $("[name='essaim_reactif']").addEventListener("change", (e) => modifier({"rouge.reaction": e.target.checked ? "adaptatif" : null}));
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
    const edition = etat.editeur?.est_actif();
    const panneau = /^Digit([1-7])$/.exec(e.code)?.[1];
    if (panneau && !edition) etat.panneaux.basculer(etat.panneaux.ids()[Number(panneau) - 1]);
    if (e.key.toLowerCase() === "e" && !edition) etat.editeur.activer(true);
    if (e.key.toLowerCase() === "v" && !edition) basculer_vue_pc();
    if (e.key.toLowerCase() === "r" && !edition) $("[name='essaim_reactif']").click();
    if (e.key === "Escape" && !edition && !etat.inspection) etat.panneaux.fermer();
    if (e.code === "Space") (e.preventDefault(), basculer_lecture());
    if (e.code === "ArrowRight") sauter_a(etat.lecteur.monde.t + 30);
    if (e.code === "ArrowLeft") sauter_a(Math.max(0, etat.lecteur.monde.t - 30));
  });
}

function brancher_scope() {
  const toile = $("#scope");
  const vue = $("#vue");
  const infobulle = $("#infobulle");
  let glisse = null;
  // Zoom et déplacement propres au scope ; en édition, c'est l'éditeur qui reçoit la souris.
  const scope_libre = () => etat.camera?.type === "scope" && !etat.editeur?.est_actif();
  // Les panneaux flottent dans la vue : seuls les gestes faits sur la carte ou le scope la concernent.
  const sur_la_vue = (e) => e.target === toile || Boolean(e.target.closest("#carte"));
  toile.addEventListener("wheel", (e) => {
    if (!scope_libre()) return;
    e.preventDefault();
    etat.camera = zoomer(etat.camera, e.deltaY < 0 ? 1.15 : 1 / 1.15, {x: e.offsetX, y: e.offsetY});
  }, {passive: false});
  toile.addEventListener("pointerdown", (e) => scope_libre() && (glisse = {x: e.clientX, y: e.clientY}, toile.setPointerCapture(e.pointerId)));
  toile.addEventListener("pointerup", () => (glisse = null));
  vue.addEventListener("dblclick", (e) => {
    // En édition, le double-clic ferme une zone : il ne doit pas recadrer la vue.
    if (etat.editeur?.est_actif() || !sur_la_vue(e)) return;
    e.preventDefault();
    cadrer(true);
  });
  toile.addEventListener("pointermove", (e) => {
    if (!glisse) return;
    etat.camera = deplacer(etat.camera, e.clientX - glisse.x, e.clientY - glisse.y);
    glisse = {x: e.clientX, y: e.clientY};
  });
  // Survol écouté sur la vue entière : sur la carte, le canevas laisse passer la souris à MapLibre.
  vue.addEventListener("pointermove", (e) => {
    if (glisse || !etat.camera || !etat.lecteur) return;
    if (!sur_la_vue(e)) return void (etat.survol = null, montrer(infobulle, null));
    const cadre = vue.getBoundingClientRect();
    etat.survol = trouver_sous_curseur(etat.camera, etat.lecteur.monde, {x: e.clientX - cadre.left, y: e.clientY - cadre.top}, etat.calques, etat.vue_pc);
    montrer(infobulle, etat.survol && decrire(etat.survol, etat.lecteur.monde), e.clientX, e.clientY);
  });
  vue.addEventListener("pointerleave", () => (etat.survol = null, montrer(infobulle, null)));
  // Clic sur une entité : l'inspecter. Un glisser (déplacement de carte) n'est pas un clic.
  let appui = null;
  vue.addEventListener("pointerdown", (e) => (appui = {x: e.clientX, y: e.clientY}));
  vue.addEventListener("click", (e) => {
    if (etat.editeur?.est_actif() || !sur_la_vue(e)) return;
    if (appui && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 4) return;
    const cadre = vue.getBoundingClientRect();
    const touche = trouver_sous_curseur(etat.camera, etat.lecteur.monde, {x: e.clientX - cadre.left, y: e.clientY - cadre.top}, etat.calques, etat.vue_pc);
    if (touche) inspecter({type: touche.type, id: touche.type === "conduite" ? 0 : ["cible", "radar", "centre"].includes(touche.type) ? touche.indice : touche.objet.id});
  });
  $("[data-action='fermer_inspecteur']").addEventListener("click", () => inspecter(null));
  addEventListener("keydown", (e) => e.key === "Escape" && !etat.editeur?.est_actif() && inspecter(null));
  new ResizeObserver(() => cadrer()).observe(vue);
}

function rafraichir_reglages() {
  etat.afficher_reglages(contexte_reglages());
  $("[name='conduite_ciblee']").checked = Boolean(brut_courant().bleu.reseau?.conduite_ciblee);
  $("[name='terrain']").value = brut_courant().theatre.terrain ?? "";
  document.querySelector(`[name='tactique'][value='${brut_courant().rouge.tactique}']`).checked = true;
  $("[name='essaim_reactif']").checked = Boolean(brut_courant().rouge.reaction);
}

/** Faire du scénario `brut` la nouvelle base (bibliothèque, auto-configuration) : les modifications repartent de zéro. */
async function remplacer_base(brut) {
  etat.base = en_v2(structuredClone(brut));
  etat.modifications = {};
  etat.historique = [];
  await charger();
  rafraichir_reglages();
  cadrer(true);
}

let bibliotheque = {depot: [], locale: {}};
async function remplir_bibliotheque() {
  try {
    bibliotheque.depot = await lire_json("scenarios/index.json");
  } catch {
    bibliotheque.depot = [];
  }
  bibliotheque.locale = lire_bibliotheque_locale();
  const liste = $("[name='bibliotheque']");
  liste.innerHTML = `<option value="">Bibliothèque de scénarios…</option>`
    + bibliotheque.depot.map((s) => `<option value="depot:${s.id}">${s.nom}</option>`).join("")
    + Object.keys(bibliotheque.locale).map((nom) => `<option value="locale:${nom}">${nom} (ce navigateur)</option>`).join("");
}

function brancher_bibliotheque() {
  remplir_bibliotheque();
  $("[name='bibliotheque']").addEventListener("change", async (e) => {
    const [source, id] = [e.target.value.split(":")[0], e.target.value.slice(e.target.value.indexOf(":") + 1)];
    if (!source) return;
    const brut = source === "depot" ? await lire_json(`scenarios/${id}.json`) : bibliotheque.locale[id];
    if (brut) await remplacer_base(brut);
    e.target.value = "";
  });
}

function brancher_prereglages() {
  const liste = $("[name='prereglage']");
  const remplir = () => (liste.innerHTML = `<option value="">Réglages enregistrés…</option>${Object.keys(lire_prereglages()).map((nom) => `<option>${nom}</option>`).join("")}`);
  remplir();
  liste.addEventListener("change", () => {
    const choisi = lire_prereglages()[liste.value];
    if (!choisi) return;
    etat.modifications = {...choisi};
    charger().then(rafraichir_reglages);
  });
  $("[data-action='enregistrer']").addEventListener("click", () => {
    const nom = $("[name='nom_prereglage']").value.trim();
    if (!nom) return;
    $("[data-champ='message']").textContent = enregistrer_prereglage(nom, etat.modifications) ? `Réglage « ${nom} » enregistré.` : "Ce navigateur refuse d'enregistrer : exportez le scénario.";
    remplir();
  });
  $("[data-action='exporter']").addEventListener("click", () => exporter_scenario(brut_courant(), "egide-scenario.json"));
  $("[data-action='reinitialiser']").addEventListener("click", () => {
    etat.modifications = {};
    charger().then(rafraichir_reglages);
  });
}

async function charger_sources_carte() {
  const index = await lire_json("cartes/index.json");
  const sources = await Promise.all(index.map(({id}) => lire_json(`cartes/${id}.json`)));
  etat.sources_carte = Object.fromEntries(index.map(({id}, i) => [id, sources[i]]));
}

function brancher_reglages_carte() {
  const panneau = $(".reglages-carte");
  const fonds = Object.entries(etat.sources_carte).filter(([id]) => id.startsWith("fonds/"));
  const choix = panneau.querySelector("[name='fond_carte']");
  choix.innerHTML = fonds.map(([id, source]) => `<option value="${id}" title="${source.conditions}">${source.nom}</option>`).join("");
  choix.value = etat.reglages_carte.fond;
  for (const cle of ["ombrage", "relief_3d", "batiments", "globe", "scope_seul"]) panneau.querySelector(`[name='${cle}']`).checked = Boolean(etat.reglages_carte[cle]);
  panneau.addEventListener("change", (e) => {
    const cle = e.target.name === "fond_carte" ? "fond" : e.target.name;
    etat.reglages_carte = {...etat.reglages_carte, [cle]: e.target.type === "checkbox" ? e.target.checked : e.target.value};
    memoriser_reglages_carte(etat.reglages_carte);
    if (cle === "scope_seul") preparer_carte();
    else if (etat.carte) etat.carte.setStyle(style_carte(etat.sources_carte, etat.reglages_carte));
    cadrer(cle === "scope_seul");
  });
}

/**
 * Créer la carte MapLibre au premier besoin seulement : en vue scope seule, une carte masquée consommait du rendu
 * pour rien. Sans WebGL, les réglages de carte sont grisés et la vue reste au scope.
 */
function preparer_carte() {
  if (etat.carte || etat.reglages_carte.scope_seul || etat.carte_indisponible) return;
  etat.carte = creer_carte($("#carte"), etat.sources_carte, etat.reglages_carte);
  if (etat.carte) return;
  etat.carte_indisponible = true;
  const panneau = $(".reglages-carte");
  panneau.querySelectorAll("select, input:not([name='scope_seul'])").forEach((champ) => (champ.disabled = true));
  panneau.title = "Carte indisponible dans ce navigateur (WebGL) : vue scope seule.";
}

/** Appliquer un geste d'édition : il s'empile pour l'annulation, puis le raid est recalculé à t = 0. */
async function appliquer_edition(modifications) {
  if (!Object.keys(modifications).length) return;
  etat.historique.push(structuredClone(etat.modifications));
  Object.assign(etat.modifications, modifications);
  await recharger_au_meme_instant();
}

async function annuler_edition() {
  if (!etat.historique.length) return;
  etat.modifications = etat.historique.pop();
  await recharger_au_meme_instant();
}

// Un échantillon par km le long du plan, au plus 600 : assez fin pour le relief, assez léger pour le navigateur.
const PAS_PROFIL = 1_000;
const ECHANTILLONS_MAX = 600;

/** Mettre à jour la vue en profil du plan de vol, si elle est ouverte. */
async function rafraichir_profil() {
  const panneau = $("#profil");
  const zone = panneau.querySelector("[data-zone='profil']");
  const {rouge} = etat.lecteur?.scenario ?? {};
  if (panneau.hidden || !rouge) return;
  if (rouge.plan_de_vol.length < 2) {
    zone.innerHTML = `<p class="note-profil">Dessinez un plan de vol d'au moins deux points dans l'éditeur pour voir son profil.</p>`;
    return;
  }
  const brut = echantillonner_chemin(rouge.plan_de_vol, PAS_PROFIL);
  const echantillons = brut.length > ECHANTILLONS_MAX ? echantillonner_chemin(rouge.plan_de_vol, (brut.at(-1).distance / ECHANTILLONS_MAX) * 1.01) : brut;
  const source = Object.entries(etat.sources_carte).find(([id]) => id.startsWith("relief/"))?.[1];
  dessiner_profil(zone, echantillons, null, rouge.altitude);
  const relief = await altitudes_relief(echantillons, source);
  if (relief) dessiner_profil(zone, echantillons, relief, rouge.altitude);
}

/** Recalculer le raid après un geste ; en mode ordres, le rejouer jusqu'à l'instant où l'on était. */
async function recharger_au_meme_instant() {
  const instant = etat.lecteur.monde.t;
  await charger();
  rafraichir_reglages();
  if (instant > 0) sauter_a(instant);
}

function brancher_editeur() {
  const bouton = $("[data-action='editer']");
  etat.editeur = creer_editeur({
    vue: $("#vue"), toile: $("#scope"), barre: $(".barre-edition"),
    camera: () => etat.camera, monde: () => etat.lecteur.monde, brut: brut_courant, calques: () => etat.calques,
    moyen: () => $("[name='moyen_liaison']").value,
    appliquer: appliquer_edition, annuler: annuler_edition,
    quantite: () => Number($("[name='quantite_depot']").value) || 1,
    nom: (id) => etat.noms_unites?.[id] ?? id,
    signaler: (texte) => ($("[data-champ='message']").textContent = texte),
    choisir_moyen: (de, vers) => choisir_moyen(brut_courant(), etat.fichiers, de, vers, $("[name='moyen_liaison']").value),
    reseau_auto: async () => {
      const {modifications, liaisons, isoles} = modifications_reseau_auto(etat.lecteur.monde, brut_courant(), etat.fichiers);
      if (!liaisons) return void ($("[data-champ='message']").textContent = "Aucune liaison possible : équipez les unités et au moins un centre C2 d'un même moyen (palette, Communications).");
      await appliquer_edition(modifications);
      $("[data-champ='message']").textContent = `${liaisons} liaison${liaisons > 1 ? "s" : ""} créée${liaisons > 1 ? "s" : ""}${isoles.length ? ` ; hors réseau : ${isoles.map((n) => libelle_noeud(etat.lecteur.monde, n)).join(", ")}` : ""}.`;
    },
    sur_depot: (id) => $("[data-zone='palette']").querySelectorAll("[data-unite]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.unite === id))),
    panoramique: (dx, dy) => {
      if (etat.camera.type === "carte") etat.carte.panBy([-dx, -dy], {duration: 0});
      else etat.camera = deplacer(etat.camera, dx, dy);
    },
    zoom: (facteur, point) => {
      if (etat.camera.type !== "carte") return void (etat.camera = zoomer(etat.camera, facteur, point));
      etat.carte.zoomTo(etat.carte.getZoom() + Math.log2(facteur), {around: etat.carte.unproject([point.x, point.y]), duration: 0});
    },
    sur_activation: (actif, mode) => {
      bouton.setAttribute("aria-pressed", String(actif));
      $(".palette").hidden = !(actif && mode === "edition");
      if (!actif) return;
      // Pour éditer, on dégage la vue : les panneaux se replient.
      etat.panneaux.fermer();
      etat.lecteur.enLecture = false;
      if (mode === "edition") sauter_a(0);
    },
  });
  bouton.addEventListener("click", () => etat.editeur.activer(!etat.editeur.est_actif()));
}

// Pastille de légende de chaque calque (classes définies dans style.css).
const PASTILLES = {avions_ir: "ami-plein", avions_laser: "ami-creux", missions: "trait-ami", radars: "radar", reseau: "reseau", couverture: "trait-ami",
  drones_defensifs: "drone-def", balayage: "faisceau", postes: "sol", drones_detectes: "hostile", drones_inconnus: "inconnu", plots: "plots", plan: "trait-hostile",
  tirs: "eclat", messages: "message", cibles: "cible", zones: "zone", anneaux: "trait", icones: "ami-plein"};

function brancher_calques() {
  const zone = $("[data-zone='calques']");
  const groupes = [...new Set(CALQUES.map((c) => c.groupe))];
  zone.innerHTML = groupes.map((groupe) => `<h3>${groupe}</h3>${CALQUES.filter((c) => c.groupe === groupe).map((c) =>
    `<label class="calque"><input type="checkbox" name="calque" value="${c.id}"><i class="${PASTILLES[c.id] ?? ""}"></i>${c.libelle}</label>`).join("")}`).join("");
  const afficher = () => zone.querySelectorAll("[name='calque']").forEach((c) => (c.checked = etat.calques[c.value]));
  const changer = (calques) => {
    etat.calques = calques;
    memoriser_calques(calques);
    afficher();
  };
  zone.addEventListener("change", (e) => changer({...etat.calques, [e.target.value]: e.target.checked}));
  $("[data-action='calques_tous']").addEventListener("click", () => changer(calques_par_defaut()));
  $("[data-action='calques_aucun']").addEventListener("click", () => changer(Object.fromEntries(CALQUES.map((c) => [c.id, false]))));
  afficher();
}

// Pastille de chaque famille de la palette, aux couleurs des entités sur la carte.
const PASTILLES_PALETTE = {infrastructures: "var(--texte)", capteurs: "var(--ami)", sol: "var(--sol)", avions: "var(--ami)", drones_defensifs: "var(--ami)",
  liaisons: "var(--texte-secondaire)", effecteurs: "var(--sol)", menace: "var(--hostile)", terrains: "var(--inconnu)"};
const echapper_html = (texte) => texte.replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);

/** Rendre le nom court d'une unité : sans la mention « (notionnel) » ni le pays, montré à part. */
const nom_court = (nom) => nom.replace(/ \((?:[A-Z]{3}, )?notionnel(le)?\)$/, "");

/** Rendre le bouton d'une unité de la palette : son icône de jeu sur la pastille de son pays, son nom, son pays. */
function bouton_palette(e, famille) {
  const fond = couleur_pays(e.pays, PASTILLES_PALETTE[famille]);
  const vignette = e.icone ? `<i class="vignette" style="background: ${fond}"><img src="icones/${echapper_html(e.icone)}.svg" alt=""></i>` : `<i style="--pastille: ${PASTILLES_PALETTE[famille]}"></i>`;
  const pays = e.pays ? `<small title="${echapper_html(PAYS[e.pays]?.nom ?? e.pays)}">${e.pays}</small>` : "";
  return `<button class="unite-palette" draggable="true" data-unite="${echapper_html(e.id)}" aria-pressed="false" title="${echapper_html(e.nom)}">${vignette}<span>${echapper_html(nom_court(e.nom))}</span>${pays}</button>`;
}

/** Remplir la palette du déploiement (MODELE § 21) : une famille par rubrique, chaque unité à cliquer ou à glisser sur la carte. */
function remplir_palette(index) {
  etat.noms_unites = Object.fromEntries(palette(index).flatMap((f) => f.elements.map((e) => [e.id, nom_court(e.nom)])));
  const zone = $("[data-zone='palette']");
  const choixPays = $("[name='pays_palette']");
  const presents = [...new Set(index.map((u) => u.pays).filter(Boolean))].sort((a, b) => (PAYS[a]?.nom ?? a).localeCompare(PAYS[b]?.nom ?? b));
  choixPays.innerHTML = `<option value="">Tous les pays</option>${presents.map((p) => `<option value="${p}">${PAYS[p]?.nom ?? p}</option>`).join("")}`;
  const dessiner = () => {
    const ouvertes = new Set([...zone.querySelectorAll("details[open]")].map((d) => d.dataset.famille));
    zone.innerHTML = palette(index, choixPays.value).map((f, i) => `<details data-famille="${f.id}" ${(ouvertes.size ? ouvertes.has(f.id) : i < 5) ? "open" : ""}><summary>${f.libelle}</summary><p class="famille-aide">${f.aide}</p>
      ${f.elements.map((e) => bouton_palette(e, f.id)).join("")}</details>`).join("");
  };
  dessiner();
  choixPays.addEventListener("change", dessiner);
  zone.addEventListener("click", (e) => {
    const choix = e.target.closest("[data-unite]");
    if (choix) etat.editeur.armer_depot(choix.dataset.unite);
  });
  zone.addEventListener("dragstart", (e) => {
    const choix = e.target.closest("[data-unite]");
    if (!choix) return;
    e.dataTransfer.setData("text/egide-unite", choix.dataset.unite);
    e.dataTransfer.effectAllowed = "copy";
  });
}

/** Proposer dans la barre d'édition les moyens de liaison du catalogue (unites/liaisons/), radio par défaut. */
async function remplir_moyens() {
  // Catalogue privé importé depuis la page Catalogue : fusionné au public ou à sa place, selon le mode retenu.
  const {index, erreur} = await charger_index(lire_json);
  if (erreur) console.warn(`Catalogue privé : ${erreur}`);
  etat.index_unites = index;
  etat.index_algos = await lire_json("algos/index.json");
  remplir_palette(index);
  const moyens = index.filter((u) => u.famille === "liaisons" && !u.base);
  const choix = $("[name='moyen_liaison']");
  choix.innerHTML = moyens.map((u) => `<option value="${u.id}">${u.nom.replace(/ \(notionnelle?\)$/, "")}</option>`).join("");
  // En remplacement, la radio publique par défaut peut manquer : on prend alors une radio V/UHF, sinon le premier moyen.
  const repli = moyens.find((u) => /UHF/i.test(u.nom)) ?? moyens[0];
  choix.value = moyens.some((u) => u.id === MOYENS_PAR_DEFAUT.avions) ? MOYENS_PAR_DEFAUT.avions : repli?.id ?? "";
  const terrains = index.filter((u) => u.famille === "terrains" && !u.base);
  $("[name='terrain']").insertAdjacentHTML("beforeend", terrains.map((u) => `<option value="${u.id}">${u.nom}</option>`).join(""));
}

async function demarrer() {
  publier_couleurs(document.documentElement);
  await charger_sources_carte();
  brancher_reglages_carte();
  preparer_carte();
  etat.base = en_v2(await lire_json("scenarios/reference.json"));
  etat.afficher_reglages = construire_reglages($("#reglages"), modifier);
  brancher_transport();
  brancher_scope();
  brancher_editeur();
  brancher_calques();
  await remplir_moyens();
  brancher_journal();
  const autoconfig = brancher_autoconfig($("#autoconfig"), {
    brut: brut_courant, fichiers: () => etat.fichiers, lire_json,
    appliquer: (brut) => remplacer_base(brut),
    enregistrer: (nom, brut) => {
      $("[data-champ='message']").textContent = enregistrer_dans_bibliotheque(nom, brut) ? `« ${nom} » rangé dans la bibliothèque de ce navigateur.` : "Ce navigateur refuse d'enregistrer : exportez le scénario.";
      remplir_bibliotheque();
    },
    exporter: (brut) => exporter_scenario(brut, "egide-autoconfiguration.json"),
  });
  etat.panneaux = brancher_panneaux($("#vue"), $(".rail"), (id) => {
    if (id === "profil") rafraichir_profil();
    if (id === "journal" && etat.lecteur) rafraichir_journal(performance.now(), true);
    if (id === "autoconfig") autoconfig.remplir();
  });
  brancher_prereglages();
  brancher_bibliotheque();
  brancher_fiche();
  brancher_sauvegarde();
  brancher_balayage($("#balayage"), () => ({brut: brut_courant(), fichiers: etat.fichiers}), $("#infobulle"));
  await charger();
  rafraichir_reglages();
  requestAnimationFrame((t) => image(t, t));
}

demarrer();
