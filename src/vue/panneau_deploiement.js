// Panneau de déploiement de l'éditeur (MODELE § 12) : recherche, onglets par famille et réglages du théâtre. Il ne calcule
// rien : la palette vient de deploiement.js et les réglages deviennent des modifications par chemin dans edition.js.
import {sans_mention} from "../catalogue_langue.js";
import {t} from "../i18n.js";
import {chemin_icone} from "../moteur/catalogue.js";
import {filtrer_palette, palette} from "./deploiement.js";
import {modifications_reglage_theatre} from "./edition.js";
import {echapper_html} from "./format.js";
import {couleur_pays, nom_pays} from "./pays.js";

// Pastille de chaque famille de la palette, aux couleurs des entités sur la carte.
const PASTILLES = {infrastructures: "var(--texte)", capteurs: "var(--ami)", sol: "var(--sol)", avions: "var(--ami)", drones_defensifs: "var(--ami)",
  liaisons: "var(--texte-secondaire)", effecteurs: "var(--sol)", menace: "var(--hostile)", terrains: "var(--inconnu)"};
const ONGLETS = {infrastructures: "vue.onglet.sites", capteurs: "vue.onglet.radars", sol: "vue.onglet.sol", avions: "vue.onglet.aviation", drones_defensifs: "vue.onglet.drones", liaisons: "vue.onglet.reseau", effecteurs: "vue.onglet.armes", menace: "vue.onglet.menace", terrains: "vue.onglet.relief"};
const ONGLET_THEATRE = "theatre";
// Seuls ces vecteurs se déposent à plusieurs d'un coup.
const FAMILLES_QUANTITE = new Set(["avions", "drones_defensifs"]);
const CHAMPS_THEATRE = {theatre_lat: "theatre.origine_lat_deg", theatre_lon: "theatre.origine_lon_deg", theatre_rayon: "theatre.zone_rayon_km", theatre_cibles: "theatre.cibles_nombre"};

/** Rendre le nom court d'une unité : sans la mention « (notionnel) » ni le pays, montré à part. */
const nom_court = sans_mention;

/** Rendre le bouton d'une unité : son icône de jeu sur la pastille de son pays, son nom, son pays. */
function bouton_unite(e, famille) {
  const fond = couleur_pays(e.pays, PASTILLES[famille]);
  const vignette = e.icone ? `<i class="vignette" style="background: ${fond}"><img src="${echapper_html(chemin_icone(e.icone).replace(/\.svg$/, ""))}.svg" alt=""></i>` : `<i style="background: ${fond}"></i>`;
  const pays = e.pays ? `<small title="${echapper_html(nom_pays(e.pays))}">${e.pays}</small>` : "";
  return `<button class="unite-palette" draggable="true" data-unite="${echapper_html(e.id)}" aria-pressed="false" title="${echapper_html(e.nom)}">${vignette}<span>${echapper_html(nom_court(e.nom))}</span>${pays}</button>`;
}

/**
 * Brancher le panneau et rendre {noms, rafraichir} : noms courts par identifiant, et rafraichir() qui relit le théâtre du scénario.
 * `env` : {racine, index, armer(id), brut(), appliquer(modifications), placer_theatre()}.
 */
export function brancher_panneau_deploiement({racine, index, armer, brut, appliquer, placer_theatre}) {
  const $ = (selecteur) => racine.querySelector(selecteur);
  const [zone, onglets, recherche, choixPays] = [$("[data-zone='palette']"), $("[data-zone='onglets_palette']"), $("[name='recherche_palette']"), $("[name='pays_palette']")];
  const toutes = palette(index);
  const presents = [...new Set(index.map((u) => u.pays).filter(Boolean))].sort((a, b) => nom_pays(a).localeCompare(nom_pays(b)));
  choixPays.innerHTML = `<option value="">${t("vue.palette.tous_pays")}</option>${presents.map((p) => `<option value="${p}">${nom_pays(p)}</option>`).join("")}`;
  let onglet = "capteurs";

  function dessiner() {
    const texte = recherche.value;
    const theatre = onglet === ONGLET_THEATRE && !texte.trim();
    const familles = filtrer_palette(palette(index, choixPays.value), {texte, famille: onglet});
    $("[data-zone='theatre']").hidden = !theatre;
    $("[data-zone='filtres_palette']").hidden = theatre;
    $("[name='quantite_depot']").closest("label").hidden = !(texte.trim() || FAMILLES_QUANTITE.has(onglet));
    onglets.querySelectorAll("[role='tab']").forEach((b) => b.setAttribute("aria-selected", String(!texte.trim() && b.dataset.onglet === onglet)));
    zone.innerHTML = theatre ? "" : familles.map((f) => `${texte.trim() ? `<h3 class="famille-titre">${f.libelle}</h3>` : ""}<p class="famille-aide">${f.aide}</p>${f.elements.map((e) => bouton_unite(e, f.id)).join("")}`).join("") || `<p class="famille-aide">${t("vue.palette.aucune")}</p>`;
  }

  /** Remettre dans les champs ce que dit le scénario : après une annulation ou un clic sur la carte, ils ne doivent pas mentir. */
  function rafraichir() {
    const {theatre} = brut();
    for (const [nom, chemin] of Object.entries(CHAMPS_THEATRE)) {
      const champ = $(`[name='${nom}']`);
      if (document.activeElement !== champ) champ.value = theatre[chemin.split(".")[1]];
    }
  }

  onglets.innerHTML = [[ONGLET_THEATRE, t("vue.onglet.theatre")], ...toutes.map((f) => [f.id, ONGLETS[f.id] ? t(ONGLETS[f.id]) : f.libelle])].map(([id, libelle]) => `<button role="tab" data-onglet="${id}" aria-selected="false">${libelle}</button>`).join("");
  onglets.addEventListener("click", (e) => {
    const bouton = e.target.closest("[data-onglet]");
    if (!bouton) return;
    onglet = bouton.dataset.onglet;
    recherche.value = "";
    dessiner();
  });
  recherche.addEventListener("input", dessiner);
  choixPays.addEventListener("change", dessiner);
  zone.addEventListener("click", (e) => {
    const choix = e.target.closest("[data-unite]");
    if (choix) armer(choix.dataset.unite);
  });
  zone.addEventListener("dragstart", (e) => {
    const choix = e.target.closest("[data-unite]");
    if (!choix) return;
    e.dataTransfer.setData("text/egide-unite", choix.dataset.unite);
    e.dataTransfer.effectAllowed = "copy";
  });
  for (const [nom, chemin] of Object.entries(CHAMPS_THEATRE)) {
    $(`[name='${nom}']`).addEventListener("change", (e) => {
      const modifications = modifications_reglage_theatre(chemin, Number(e.target.value));
      if (Object.keys(modifications).length) appliquer(modifications);
      else rafraichir();
    });
  }
  $("[data-action='placer_theatre']").addEventListener("click", placer_theatre);
  dessiner();
  return {noms: Object.fromEntries(toutes.flatMap((f) => f.elements.map((e) => [e.id, nom_court(e.nom)]))), rafraichir};
}
