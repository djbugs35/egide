// Captures de la documentation (jalon 27, lot 9) : refait les vues fixes du README dans chaque langue, par le navigateur
// de Playwright, dans docs/images/<langue>/. Les animations (GIF) se refont à la main.
//
//   npm install --no-save playwright && npx playwright install chromium     # une fois
//   node outils/captures.js                          # toutes les captures, en anglais et en français
//   node outils/captures.js --langues en --seulement calques,journal
//   node outils/captures.js --hors-ligne             # sans fond de carte (scope seul) : sans réseau, ou pour comparer
//
// Le site est servi par le script lui-même, sur un port libre. Une capture qui échoue est signalée, les autres continuent.
import {createReadStream, existsSync, mkdirSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {extname, join, normalize} from "node:path";
import {pathToFileURL} from "node:url";
import {RACINE} from "../src/moteur/catalogue_node.js";
import {LANGUES, t} from "../src/i18n.js";
import {preparer_langue} from "../src/langue_node.js";

const TYPES = {".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".wav": "audio/wav", ".wasm": "application/wasm"};
const BUREAU = {viewport: {width: 1440, height: 900}, deviceScaleFactor: 1};
const ATTENTE_MS = 1500;

/** Servir le dépôt en lecture ; rendre {adresse, fermer}. */
function servir() {
  const serveur = createServer((requete, reponse) => {
    const chemin = normalize(decodeURIComponent(new URL(requete.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    const fichier = join(RACINE, chemin || "index.html");
    if (!fichier.startsWith(RACINE) || !existsSync(fichier) || statSync(fichier).isDirectory()) return reponse.writeHead(404).end();
    reponse.writeHead(200, {"Content-Type": TYPES[extname(fichier)] ?? "application/octet-stream"});
    createReadStream(fichier).pipe(reponse);
  });
  return new Promise((rendre) => serveur.listen(0, "127.0.0.1", () => rendre({adresse: `http://127.0.0.1:${serveur.address().port}`, fermer: () => serveur.close()})));
}

/** Ouvrir l'interface dans `langue`, prête à piloter (egide_capture), lecture arrêtée. */
async function ouvrir_interface(page, adresse, langue) {
  await page.goto(`${adresse}/index.html?lang=${langue}&capture`);
  await page.waitForFunction(() => globalThis.egide_capture, null, {timeout: 120_000});
  await page.waitForTimeout(ATTENTE_MS);
}

/** Aller à l'instant `t` (s) du raid, ou à sa fin si `t` est null. */
async function aller_a(page, t) {
  await page.evaluate((instant) => {
    const {etat, sauter_a} = globalThis.egide_capture;
    etat.lecteur.enLecture = false;
    sauter_a(instant ?? etat.lecteur.duree);
  }, t);
  await page.waitForTimeout(ATTENTE_MS);
}

const ouvrir_panneau = async (page, panneau) => (await page.click(`[data-panneau='${panneau}']`), page.waitForTimeout(ATTENTE_MS));

/** Les recettes : {fichier: async (page, adresse, langue)}. Chacune laisse la page dans l'état à photographier. */
const RECETTES = {
  calques: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await aller_a(page, 540);
    await ouvrir_panneau(page, "calques");
  },
  journal: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await aller_a(page, 420);
    await ouvrir_panneau(page, "journal");
  },
  inspecteur: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await aller_a(page, 600);
    await page.evaluate(() => globalThis.egide_capture.inspecter({type: "avion", id: 41}));
    await page.waitForTimeout(ATTENTE_MS);
  },
  vue_pc: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await aller_a(page, 600);
    await page.click("[data-action='vue_pc']");
    await page.waitForTimeout(ATTENTE_MS);
  },
  debriefing: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await aller_a(page, null);
    await ouvrir_panneau(page, "debriefing");
  },
  editeur: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await page.click("[data-action='editer']");
    await page.waitForTimeout(ATTENTE_MS);
  },
  brouillard: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await aller_a(page, 437);
    await page.click("[data-action='vue_pc']");
    await page.waitForTimeout(ATTENTE_MS);
  },
  icones: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await page.click("[data-action='editer']");
    await page.selectOption("[name='pays_palette']", "FRA");
    await page.waitForTimeout(ATTENTE_MS);
  },
  balayage: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await ouvrir_panneau(page, "balayage");
    // Moins de raids qu'au réglage par défaut : la courbe a la même allure, en quelques dizaines de secondes.
    await page.fill("[data-tiroir='balayage'] [name='tirages']", "5");
    await page.click("[data-action='balayer']");
    // Fini quand la progression ne finit plus par « … » (avancement) et que la courbe est tracée.
    await page.waitForFunction(() => document.querySelector("[data-zone='courbes'] svg") && !document.querySelector("[data-champ='progression']").textContent.endsWith("…"), null, {timeout: 600_000});
    await page.waitForTimeout(ATTENTE_MS);
  },
  catalogue_unite: async (page, adresse, langue) => {
    await page.goto(`${adresse}/catalogue.html?lang=${langue}#unite/vecteurs%2Favions%2Fturbopropulseur_ir_notionnel`);
    await page.waitForSelector("#fiche h2", {timeout: 60_000});
    await page.waitForTimeout(ATTENTE_MS);
  },
  catalogue_algo: async (page, adresse, langue) => {
    await page.goto(`${adresse}/catalogue.html?lang=${langue}#algo/global%2Fcomportement%2Fessaim_fourmi`);
    await page.waitForSelector("#fiche h2", {timeout: 60_000});
    await page.waitForTimeout(ATTENTE_MS);
  },
  mobile: {appareil: {viewport: {width: 390, height: 664}, deviceScaleFactor: 3, isMobile: true, hasTouch: true}, faire: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await aller_a(page, 540);
  }},
};

/** Lire la ligne de commande : {langues, seulement, hors_ligne, sortie}. */
export function lire_options(argv) {
  const valeur = (nom) => (argv.includes(`--${nom}`) ? argv[argv.indexOf(`--${nom}`) + 1] : null);
  return {
    langues: (valeur("langues") ?? Object.keys(LANGUES).join(",")).split(",").filter((c) => c in LANGUES),
    seulement: valeur("seulement")?.split(",") ?? Object.keys(RECETTES),
    hors_ligne: argv.includes("--hors-ligne"),
    sortie: valeur("sortie") ?? join(RACINE, "docs", "images"),
  };
}

async function principal(argv) {
  const options = lire_options(argv);
  const inconnues = options.seulement.filter((nom) => !(nom in RECETTES));
  if (inconnues.length) throw new Error(t("cli.captures.inconnues", {liste: inconnues.join(", "), connues: Object.keys(RECETTES).join(", ")}));
  // Playwright n'est pas une dépendance d'Égide : on le cherche depuis le dépôt, puis tel qu'installé sur le poste.
  const {chromium} = createRequire(join(RACINE, "package.json"))("playwright");
  const {adresse, fermer} = await servir();
  const navigateur = await chromium.launch();
  let echecs = 0;
  try {
    for (const langue of options.langues) {
      const dossier = join(options.sortie, langue);
      mkdirSync(dossier, {recursive: true});
      for (const nom of options.seulement) {
        const recette = typeof RECETTES[nom] === "function" ? {appareil: BUREAU, faire: RECETTES[nom]} : RECETTES[nom];
        const contexte = await navigateur.newContext(recette.appareil);
        // Réglages de carte retenus par le site (src/vue/carte_style.js) : hors ligne, le scope seul, sans fond.
        if (options.hors_ligne) await contexte.addInitScript(() => localStorage.setItem("egide.carte", JSON.stringify({fond: "fonds/aucun", ombrage: false, scope_seul: true})));
        const page = await contexte.newPage();
        try {
          await recette.faire(page, adresse, langue);
          // Garde-fou : une clé de dictionnaire affichée telle quelle trahit un texte oublié par t().
          const cles = await page.evaluate(() => [...new Set((document.body.innerText + [...document.querySelectorAll("svg text")].map((e) => e.textContent).join(" "))
            .match(/⟦[^⟧]+⟧|\b(?:vue|page|commun|cli)\.[a-z0-9_]+\.[a-z0-9_.]+/g) ?? [])]);
          if (cles.length) console.warn(t("cli.captures.cles", {nom, langue, cles: cles.join(", ")}));
          const chemin = join(dossier, `${nom}.png`);
          await page.screenshot({path: chemin});
          console.log(`→ ${chemin}`);
        } catch (erreur) {
          echecs++;
          console.error(t("cli.captures.echec", {nom, langue, erreur: erreur.message.split("\n")[0]}));
        } finally {
          await contexte.close();
        }
      }
    }
  } finally {
    await navigateur.close();
    fermer();
  }
  return echecs ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await principal(preparer_langue(process.argv.slice(2)));
