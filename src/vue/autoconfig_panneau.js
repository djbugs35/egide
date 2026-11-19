// Panneau d'auto-configuration (MODELE § 20) : menaces, moyens, zone (pays ou zone dessinée), puis recherche de la
// répartition dans un Worker, résultat comparé à la répartition uniforme, à appliquer ou ranger en bibliothèque.
import {format_decimal, format_entier} from "./format.js";
import {t} from "../i18n.js";

const TACTIQUES = [["fourmi", "vue.autoconfig.fourmi"], ["direct", "vue.autoconfig.direct"], ["disperse", "vue.autoconfig.disperse"]];
const MOYENS = [
  ["radars", "vue.autoconfig.radars", 0], ["centres", "vue.autoconfig.centres", 1], ["cibles", "vue.autoconfig.cibles", 1], ["postes", "vue.autoconfig.postes", 0],
  ["munitions_sol", "vue.autoconfig.munitions_sol", 0], ["avions_0", "vue.autoconfig.avions_ir", 0], ["avions_1", "vue.autoconfig.avions_laser", 0], ["avions_2", "vue.autoconfig.drones_armes", 0],
  ["avions_3", "vue.autoconfig.intercepteurs", 0], ["avions_4", "vue.autoconfig.brouilleurs", 0],
];

/** Rendre la description lisible d'une stratégie de répartition. */
export function decrire_strategie(s) {
  if (s.uniforme) return t("vue.autoconfig.uniforme");
  const pc = (x) => `${Math.round(100 * x)} %`;
  return t("vue.autoconfig.strategie", {avions: pc(s.avions), drones: pc(s.drones * 0.5), radars: s.radars ? t("vue.autoconfig.radars_pousses", {pc: pc(s.radars)}) : t("vue.autoconfig.radars_frontiere")});
}

/** Rendre les valeurs par défaut des moyens, lues dans le scénario affiché. */
function moyens_courants(brut) {
  const nb = (i) => brut.bleu.avions[i]?.nombre ?? 0;
  const radars = brut.bleu.radar.disposition === "sites" ? brut.bleu.radar.sites.length : 30;
  return {radars, centres: 1 + (brut.bleu.reseau?.centres?.length ?? 0), cibles: brut.theatre.cibles_nombre, postes: brut.bleu.sol.nombre,
    munitions_sol: brut.bleu.sol.munitions, avions_0: nb(0), avions_1: nb(1), avions_2: nb(2), avions_3: nb(3), avions_4: nb(4)};
}

/**
 * Brancher le panneau `racine`. `ctx` : {brut(), fichiers(), lire_json(chemin), appliquer(brut), enregistrer(nom, brut),
 * exporter(brut)}.
 */
export function brancher_autoconfig(racine, ctx) {
  const $ = (s) => racine.querySelector(s);
  let pays = null;
  let resultat = null;
  let travailleur = null;
  $("[data-zone='menaces']").innerHTML = TACTIQUES.map(([id, nom], i) =>
    `<label class="ligne-menace"><input type="checkbox" name="menace" value="${id}" ${i < 2 ? "checked" : ""}>${t(nom)}<input type="number" name="nombre_${id}" min="10" step="10" value="1000" aria-label="${t("vue.autoconfig.drones_de", {tactique: t(nom)})}"></label>`).join("");
  $("[data-zone='moyens']").innerHTML = MOYENS.map(([id, nom, min]) => `<label>${t(nom)}<input type="number" name="moyen_${id}" min="${min}" step="1"></label>`).join("");
  const remplir = () => {
    const brut = ctx.brut();
    for (const [id, valeur] of Object.entries(moyens_courants(brut))) $(`[name='moyen_${id}']`).value = valeur;
    const zones = brut.theatre.zones ?? [];
    $("[name='zone_dessinee']").innerHTML = zones.length ? zones.map((z, i) => `<option value="${i}">${z.nom}</option>`).join("") : `<option value="">${t("vue.autoconfig.aucune_zone")}</option>`;
    if (racine.querySelector("[name='source_zone']:checked").value === "pays") charger_pays();
  };
  const charger_pays = async () => {
    if (pays) return;
    try {
      pays = (await ctx.lire_json("cartes/frontieres/pays.json")).pays;
      $("#liste-pays").innerHTML = pays.map((p) => `<option value="${p.nom}">${p.iso}</option>`).join("");
    } catch {
      $("[data-champ='autoconfig_etat']").textContent = t("vue.autoconfig.sans_frontieres");
    }
  };
  racine.querySelectorAll("[name='source_zone']").forEach((r) => r.addEventListener("change", () => r.value === "pays" && charger_pays()));
  $("[data-action='autoconfig']").addEventListener("click", () => lancer());
  $("[data-action='autoconfig_appliquer']").addEventListener("click", () => resultat && ctx.appliquer(resultat.brut));
  $("[data-action='autoconfig_enregistrer']").addEventListener("click", () => resultat && ctx.enregistrer(resultat.brut.nom, resultat.brut));
  $("[data-action='autoconfig_exporter']").addEventListener("click", () => resultat && ctx.exporter(resultat.brut));
  $("[data-action='autoconfig_arreter']").addEventListener("click", () => arreter(t("vue.autoconfig.interrompue")));
  const bouton_rail = document.querySelector(".rail [data-panneau='autoconfig']");
  let debut = 0;

  /** Montrer l'avancement : barre (indéterminée tant que `fait` est nul), pourcentage et temps restant estimé ; aussi sur le bouton du rail. */
  function avancer(fait, total) {
    const barre = $("[data-champ='autoconfig_barre']");
    racine.querySelector(".progression-autoconfig").hidden = false;
    bouton_rail?.classList.add("en-cours");
    if (!total) return void (barre.removeAttribute("value"), ($("[data-champ='autoconfig_reste']").textContent = t("vue.autoconfig.preparation")));
    barre.max = total;
    barre.value = fait;
    bouton_rail?.style.setProperty("--avancement", String(fait / total));
    const ecoule = (performance.now() - debut) / 1000;
    const reste = fait > 0 ? (ecoule * (total - fait)) / fait : null;
    $("[data-champ='autoconfig_reste']").textContent = `${Math.floor((100 * fait) / total)} %${reste === null ? "" : ` · ${t("vue.autoconfig.reste", {duree: duree_lisible(reste)})}`}`;
    bouton_rail?.setAttribute("title", t("vue.autoconfig.titre_avancement", {pc: Math.floor((100 * fait) / total)}));
  }

  /** Arrêter le Worker et ranger la barre ; `message` remplace l'état affiché s'il est donné. */
  function arreter(message) {
    travailleur?.terminate();
    travailleur = null;
    racine.querySelector(".progression-autoconfig").hidden = true;
    bouton_rail?.classList.remove("en-cours");
    bouton_rail?.setAttribute("title", t("page.rail.autoconfig.title"));
    if (message) $("[data-champ='autoconfig_etat']").textContent = message;
  }

  /** Traiter un message du Worker. */
  function recevoir(data) {
    const etat = $("[data-champ='autoconfig_etat']");
    if (data.type === "erreur") arreter(t("vue.autoconfig.echec", {erreur: data.message}));
    if (data.type === "avancement") avancer(data.fait, data.total);
    if (data.type === "essai") {
      etat.textContent = t("vue.autoconfig.essai", {n: data.fait, total: data.total});
      $("[data-zone='essais']").insertAdjacentHTML("beforeend", `<li>${t("vue.autoconfig.ligne_essai", {frappes: format_decimal(data.essai.frappes), strategie: decrire_strategie(data.essai.strategie)})}</li>`);
    }
    if (data.type === "fin") {
      arreter();
      montrer_resultat(data.resultat);
    }
  }

  function zone_demandee() {
    const brut = ctx.brut();
    if (racine.querySelector("[name='source_zone']:checked").value === "dessinee") {
      const z = brut.theatre.zones?.[Number($("[name='zone_dessinee']").value)];
      return z ? {nom: z.nom, points: z.points} : null;
    }
    const p = pays?.find((x) => x.nom === $("[name='pays']").value);
    if (!p) return null;
    const anneau = anneau_principal(p);
    return {nom: p.nom, points: anneau.slice(0, -1).map(([lon, lat]) => ({lat_deg: lat, lon_deg: lon}))};
  }

  async function lancer() {
    if (racine.querySelector("[name='source_zone']:checked").value === "pays") await charger_pays();
    const zone = zone_demandee();
    const etat = $("[data-champ='autoconfig_etat']");
    if (!zone) return void (etat.textContent = t("vue.autoconfig.choisir_zone"));
    const menaces = [...racine.querySelectorAll("[name='menace']:checked")].map((c) => ({tactique: c.value, nombre: Number($(`[name='nombre_${c.value}']`).value)}));
    if (!menaces.length) return void (etat.textContent = t("vue.autoconfig.choisir_menace"));
    const v = (id) => Number($(`[name='moyen_${id}']`).value);
    const demande = {zone, menaces, moyens: {radars: v("radars"), centres: v("centres"), cibles: v("cibles"), postes: v("postes"),
      munitions_sol: v("munitions_sol"), avions: [0, 1, 2, 3, 4].map((i) => v(`avions_${i}`))}};
    arreter();
    resultat = null;
    racine.querySelector(".resultat-autoconfig").hidden = true;
    const liste = $("[data-zone='essais']");
    liste.innerHTML = "";
    etat.textContent = t("vue.autoconfig.en_cours");
    debut = performance.now();
    avancer(0, 0);
    travailleur = new Worker(new URL("./autoconfig_travailleur.js", import.meta.url), {type: "module"});
    travailleur.addEventListener("message", ({data}) => recevoir(data));
    travailleur.postMessage({base: ctx.brut(), demande, fichiers: ctx.fichiers(), tirages: Number($("[name='tirages_autoconfig']").value)});
  }

  // remplir() : à l'ouverture du panneau, les moyens reprennent ceux du scénario affiché.
  function montrer_resultat(r) {
    resultat = r;
    const d = r.comparaison.difference;
    $("[data-champ='autoconfig_etat']").textContent = t("vue.autoconfig.termine");
    $("[data-zone='resultat']").innerHTML = `<p>${t("vue.autoconfig.resultat", {meilleur: format_decimal(r.meilleur), uniforme: format_decimal(r.uniforme), ecart: format_decimal(d.moyenne), ic: format_decimal(d.ic95), n: format_entier(d.effectif),
      verdict: r.comparaison.verdict === "indiscernable" ? t("vue.autoconfig.indiscernable") : t("vue.autoconfig.significatif")})}</p>
      <p>${t("vue.autoconfig.retenue", {strategie: decrire_strategie(r.strategie)})}</p>`;
    racine.querySelector(".resultat-autoconfig").hidden = false;
  }  return {remplir};

}

/** Rendre une durée en secondes lisible : « 45 s », « 3 min 10 s ». */
export function duree_lisible(secondes) {
  const s = Math.max(0, Math.round(secondes));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`;
}

/** Aire approchée d'un anneau [lon, lat] : pour retenir le plus étendu d'un pays. */
const aire = (a) => Math.abs(a.reduce((s, [x1, y1], i) => {
  const [x2, y2] = a[(i + 1) % a.length];
  return s + (x1 * y2 - x2 * y1) * Math.cos(((y1 + y2) / 2) * Math.PI / 180);
}, 0)) / 2;

/** Rendre l'anneau le plus étendu d'un pays (la métropole plutôt qu'une île). */
export const anneau_principal = (p) => p.anneaux.reduce((a, b) => (aire(b) > aire(a) ? b : a));
