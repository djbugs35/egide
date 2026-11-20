// Captures de la documentation (jalon 27, lot 9) : refait les vues fixes du README dans chaque langue, par le navigateur
// de Playwright, dans docs/images/<langue>/, animations comprises. Les parties Godot ont leur script (clients/godot).
//
//   npm install --no-save playwright && npx playwright install chromium     # une fois
//   node outils/captures.js                          # toutes les captures, en anglais et en français
//   node outils/captures.js --langues en --seulement calques,journal
//   node outils/captures.js --hors-ligne             # sans fond de carte (scope seul) : sans réseau, ou pour comparer
//
// Les animations (.gif) sont des suites d'images assemblées par ffmpeg, qui doit être installé.
//
// Le site est servi par le script lui-même, sur un port libre. Une capture qui échoue est signalée, les autres continuent.
import {spawnSync} from "node:child_process";
import {createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync} from "node:fs";
import {tmpdir} from "node:os";
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
    // Le catalogue privé montré est celui de démonstration, jamais celui du poste : rien de privé ne part dans une capture.
    const fichier = chemin.startsWith("prive/") ? join(RACINE, "outils", "captures_prive", chemin.slice("prive/".length)) : join(RACINE, chemin || "index.html");
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
async function aller_a(page, t, attente = ATTENTE_MS) {
  await page.evaluate((instant) => {
    const {etat, sauter_a} = globalThis.egide_capture;
    etat.lecteur.enLecture = false;
    sauter_a(instant ?? etat.lecteur.duree);
  }, t);
  await page.waitForTimeout(attente);
}

const ouvrir_panneau = async (page, panneau) => (await page.click(`[data-panneau='${panneau}']`), page.waitForTimeout(ATTENTE_MS));

/** Appliquer des modifications par chemin au scénario, comme un geste de l'éditeur, puis revenir à t = 0. */
async function modifier(page, modifications) {
  await page.evaluate(async (m) => {
    await globalThis.egide_capture.appliquer(m);
    globalThis.egide_capture.etat.lecteur.enLecture = false;
  }, modifications);
  await page.waitForTimeout(ATTENTE_MS);
}

/** Choisir une tactique de l'essaim dans la barre du haut. */
const tactique = async (page, valeur) => (await page.locator(`[name='tactique'][value='${valeur}']`).check({force: true}), page.waitForTimeout(ATTENTE_MS));

/** Afficher ou masquer un calque par son identifiant (src/vue/calques.js), panneau refermé ensuite. */
async function calque(page, id, voulu = true) {
  await ouvrir_panneau(page, "calques");
  await page.setChecked(`[data-tiroir='calques'] input[value='${id}']`, voulu);
  await ouvrir_panneau(page, "calques");
}

/** Rendre la position à l'écran d'un point en degrés. */
const ecran_deg = (page, lat, lon) => page.evaluate(([la, lo]) => globalThis.egide_capture.ecran_deg(la, lo), [lat, lon]);

/** Rendre la position à l'écran du radar R<rang + 1>. */
const ecran_radar = (page, rang) => page.evaluate(async (i) => {
  const {positions_radars} = await import("/src/moteur/radars.js");
  const {etat, ecran_de} = globalThis.egide_capture;
  return ecran_de(positions_radars(etat.lecteur.monde.scenario)[i]);
}, rang);

/** Rendre la position à l'écran de la cible C<rang + 1>. */
const ecran_cible = (page, rang) => page.evaluate((i) => globalThis.egide_capture.ecran_de(globalThis.egide_capture.etat.lecteur.monde.cibles[i].geo), rang);

/** Zoomer la vue de `crans` crans de molette autour du point d'écran `point` (défaut : le centre). */
async function zoomer(page, crans, point = {x: 720, y: 450}) {
  await page.mouse.move(point.x, point.y);
  for (let k = 0; k < Math.abs(crans); k++) (await page.mouse.wheel(0, crans > 0 ? -240 : 240), await page.waitForTimeout(120));
  // La souris s'écarte : laissée sur la carte, elle ouvrirait l'infobulle de ce qu'elle survole.
  await page.mouse.move(4, 600);
  await page.waitForTimeout(ATTENTE_MS);
}

/**
 * Filmer `images` images dans `chemin` (.gif) : de l'instant `de` à `a` du raid, ou en appelant `geste(k)` avant chaque
 * image. ffmpeg assemble, à `ips` images par seconde et `largeur` pixels, sur une palette calculée pour l'animation.
 */
async function filmer(page, chemin, {de, a, geste, images = 40, ips = 8, largeur = 960, pause = 250}) {
  const dossier = mkdtempSync(join(tmpdir(), "egide-film-"));
  try {
    for (let k = 0; k < images; k++) {
      if (geste) await geste(k);
      else await aller_a(page, de + ((a - de) * k) / (images - 1), pause);
      await page.screenshot({path: join(dossier, `${String(k).padStart(4, "0")}.png`)});
    }
    const filtre = `fps=${ips},scale=${largeur}:-1:flags=lanczos,split[x][y];[x]palettegen=max_colors=160:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=4`;
    const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(ips), "-i", join(dossier, "%04d.png"), "-vf", filtre, "-loop", "0", chemin]);
    if (r.status !== 0) throw new Error(String(r.stderr ?? r.error));
  } finally {
    rmSync(dossier, {recursive: true, force: true});
  }
}

/** Poser par le scénario un radar longue portée (R11) relié par satellite au CDC, et trois batteries de moyenne portée. */
async function deployer(page) {
  await page.evaluate(async () => {
    const {positions_radars} = await import("/src/moteur/radars.js");
    const {liaisons_par_defaut} = await import("/src/vue/reseau_vue.js");
    const {etat, appliquer} = globalThis.egide_capture;
    const deg = (r) => (r * 180) / Math.PI;
    const monde = etat.lecteur.monde;
    const sites = positions_radars(monde.scenario).map((g) => ({lat_deg: deg(g.lat), lon_deg: deg(g.lon)}));
    sites.push({lat_deg: 48.55, lon_deg: 3.6, unite: "capteurs/radars/radar_longue_portee_notionnel"});
    const liaisons = liaisons_par_defaut(monde).map((l) => ({de: l.de, vers: l.vers, moyen: l.moyen}));
    liaisons.push({de: `radar:${sites.length - 1}`, vers: "conduite", moyen: "liaisons/satellite_notionnelle"});
    const batterie = (lat, lon) => ({lat_deg: lat, lon_deg: lon, unite: "sites/postes/batterie_moyenne_portee_notionnelle", munitions: 40});
    await appliquer({"bleu.radar.disposition": "sites", "bleu.radar.sites": sites, "bleu.reseau.mode": "liaisons", "bleu.reseau.liaisons": liaisons,
      "bleu.sol.batteries": [batterie(47.55, 2.2), batterie(46.75, 3.05), batterie(46.65, 1.9)]});
    etat.lecteur.enLecture = false;
  });
  await page.waitForTimeout(ATTENTE_MS);
}

/** Passer le réseau en liaisons : celles par défaut, transformées par `changer(liaisons)` (fonction sérialisée). */
async function relier(page, changer) {
  await page.evaluate(async (texte) => {
    const {liaisons_par_defaut} = await import("/src/vue/reseau_vue.js");
    const {etat, appliquer} = globalThis.egide_capture;
    const liaisons = liaisons_par_defaut(etat.lecteur.monde).map((l) => ({de: l.de, vers: l.vers, moyen: l.moyen}));
    await appliquer({"bleu.reseau.mode": "liaisons", "bleu.reseau.liaisons": (0, eval)(texte)(liaisons)});
    etat.lecteur.enLecture = false;
  }, changer.toString());
  await page.waitForTimeout(ATTENTE_MS);
}

/** Lancer l'auto-configuration sur la Belgique, avec peu de raids par essai, et attendre la répartition retenue. */
async function lancer_autoconfig(page) {
  await ouvrir_panneau(page, "autoconfig");
  await page.fill("[name='pays']", "Belgique");
  await page.fill("[name='tirages_autoconfig']", "1").catch(() => {});
  await page.click("[data-action='autoconfig']");
  await page.waitForSelector("[data-action='autoconfig_appliquer']:not([disabled])", {timeout: 900_000});
  await page.waitForTimeout(ATTENTE_MS);
}

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
  // Animations de la vue 2D.
  interface: {film: true, faire: async (page, adresse, langue, chemin) => {
    await ouvrir_interface(page, adresse, langue);
    await filmer(page, chemin, {de: 60, a: 660, images: 48});
  }},
  eclatement: {film: true, faire: async (page, adresse, langue, chemin) => {
    await ouvrir_interface(page, adresse, langue);
    await aller_a(page, 420);
    await zoomer(page, 4, await ecran_cible(page, 8));
    await filmer(page, chemin, {de: 420, a: 780, images: 45});
  }},
  direct: {film: true, faire: async (page, adresse, langue, chemin) => {
    await ouvrir_interface(page, adresse, langue);
    await tactique(page, "direct");
    await filmer(page, chemin, {de: 0, a: 660, images: 45});
  }},
  disperse: {film: true, faire: async (page, adresse, langue, chemin) => {
    await ouvrir_interface(page, adresse, langue);
    await tactique(page, "disperse");
    await filmer(page, chemin, {de: 0, a: 900, images: 45});
  }},
  reactif: {film: true, faire: async (page, adresse, langue, chemin) => {
    await ouvrir_interface(page, adresse, langue);
    await tactique(page, "disperse");
    await page.locator("[name='essaim_reactif']").check({force: true});
    await page.waitForTimeout(ATTENTE_MS);
    await ouvrir_panneau(page, "journal");
    await filmer(page, chemin, {de: 540, a: 1260, images: 48});
  }},
  information: {film: true, faire: async (page, adresse, langue, chemin) => {
    await ouvrir_interface(page, adresse, langue);
    await tactique(page, "disperse");
    await filmer(page, chemin, {de: 165, a: 215, images: 50, ips: 10});
  }},
  ambiance: {film: true, faire: async (page, adresse, langue, chemin) => {
    await ouvrir_interface(page, adresse, langue);
    await aller_a(page, 972);
    const [c9, c10] = [await ecran_cible(page, 8), await ecran_cible(page, 9)];
    await zoomer(page, 5, {x: (c9.x + c10.x) / 2, y: (c9.y + c10.y) / 2});
    await filmer(page, chemin, {de: 972, a: 1118, images: 45});
  }},
  // Vues fixes de raids réglés par le scénario.
  essaim_reactif_inspecteur: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await tactique(page, "disperse");
    await page.locator("[name='essaim_reactif']").check({force: true});
    await aller_a(page, 1080);
    await ouvrir_panneau(page, "journal");
    await page.evaluate(() => globalThis.egide_capture.inspecter({type: "drone", id: 26}));
    await page.waitForTimeout(ATTENTE_MS);
  },
  fin_de_raid: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await aller_a(page, null);
  },
  sans_avions: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await modifier(page, {"bleu.avions.0.nombre": 0, "bleu.avions.1.nombre": 0});
    await aller_a(page, null);
  },
  incidents: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await ouvrir_panneau(page, "scenario");
    await page.click("[data-action='incidents_hasard']");
    await page.waitForTimeout(ATTENTE_MS);
    await ouvrir_panneau(page, "scenario");
    await aller_a(page, 200);
  },
  couvertures: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await calque(page, "resultante_c2");
    await aller_a(page, 300);
  },
  drones_defensifs: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await modifier(page, {"bleu.avions.2.nombre": 20, "bleu.avions.3.nombre": 20, "bleu.avions.4.nombre": 8});
    await aller_a(page, 560);
  },
  relief: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await modifier(page, {"theatre.terrain": "terrains/crete_notionnelle"});
    await aller_a(page, 240);
  },
  reseau: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await relier(page, (liaisons) => liaisons.map((l) => (l.de === "radar:9" ? {...l, moyen: "liaisons/satellite_notionnelle"} : l.de === "radar:0" ? {...l, moyen: "liaisons/optique_notionnelle"} : l)));
    await aller_a(page, 300);
    await page.evaluate(() => globalThis.egide_capture.inspecter({type: "conduite", id: 0}));
    await page.waitForTimeout(ATTENTE_MS);
  },
  cdc: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await modifier(page, {"bleu.reseau.centres": [{nom: "CDC 2", lat_deg: 46.35, lon_deg: 1.55}]});
    await relier(page, (liaisons) => [...liaisons, {de: "centre:0", vers: "sol:1", moyen: "liaisons/radio_vhf_uhf_notionnelle"}]);
    await aller_a(page, 300);
    await page.evaluate(() => globalThis.egide_capture.inspecter({type: "centre", id: 0}));
    await page.waitForTimeout(ATTENTE_MS);
  },
  ordres: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await modifier(page, {
      "bleu.reseau.pannes": [{t_s: 300, element: "radar:3"}],
      "bleu.ordres": [{t_s: 360, avions: [0, 1, 2, 3, 4, 5, 6, 7], lat_deg: 47.9, lon_deg: 1.4}],
    });
    await aller_a(page, 420);
  },
  // Déploiement : un radar longue portée relié par satellite au CDC et trois batteries, posés par le scénario.
  deploiement: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await deployer(page);
    await page.click("[data-action='editer']");
    await page.waitForTimeout(ATTENTE_MS);
  },
  fiche_unite: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await deployer(page);
    await page.click("[data-action='editer']");
    await page.waitForTimeout(ATTENTE_MS);
    const r11 = await ecran_radar(page, 10);
    await page.mouse.click(r11.x, r11.y);
    await page.waitForTimeout(ATTENTE_MS);
  },
  aides_deploiement: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await page.click("[data-action='editer']");
    await page.waitForTimeout(ATTENTE_MS);
    await page.selectOption("[name='aimantation']", "25000");
    await page.click("[data-outil='mesure']");
    const [a, b] = [await ecran_deg(page, 46.4, 1.0), await ecran_deg(page, 46.85, 3.0)];
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, {steps: 12});
    await page.waitForTimeout(ATTENTE_MS);
  },
  edition: {film: true, faire: async (page, adresse, langue, chemin) => {
    await ouvrir_interface(page, adresse, langue);
    await page.click("[data-action='editer']");
    await page.waitForTimeout(ATTENTE_MS);
    const [pose, cible, cdc] = [await ecran_deg(page, 48.3, 3.9), await ecran_deg(page, 48.55, 3.6), await ecran_deg(page, 47.0, 2.5)];
    // Poser le radar depuis la palette, le glisser sans changer d'outil, le relier au CDC par satellite, puis sa fiche.
    const gestes = {
      3: () => page.click(".unite-palette[data-unite='capteurs/radars/radar_longue_portee_notionnel']"),
      6: () => page.mouse.click(pose.x, pose.y),
      // Glisser l'unité posée, outil encore armé : appui, déplacement en plusieurs pas, relâchement.
      10: async () => (await page.mouse.move(pose.x, pose.y), await page.mouse.down(), await page.mouse.move((pose.x + cible.x) / 2, (pose.y + cible.y) / 2, {steps: 6})),
      12: async () => (await page.mouse.move(cible.x, cible.y, {steps: 6}), await page.mouse.up()),
      // Le choix du moyen vit dans le menu Réseau, replié : on le règle comme le ferait ce menu.
      15: async () => {
        await page.evaluate(() => {
          const choix = document.querySelector("[name='moyen_liaison']");
          choix.value = "liaisons/satellite_notionnelle";
          choix.dispatchEvent(new Event("change", {bubbles: true}));
        });
        await page.click("[data-outil='liaison']");
      },
      17: async () => {
        const r11 = await ecran_radar(page, 10);
        await page.mouse.click(r11.x, r11.y);
      },
      19: () => page.mouse.click(cdc.x, cdc.y),
      22: async () => {
        await page.click("[data-outil='selection']");
        const r11 = await ecran_radar(page, 10);
        await page.mouse.click(r11.x, r11.y);
      },
    };
    await filmer(page, chemin, {images: 34, ips: 4, geste: async (k) => {
      if (gestes[k]) await gestes[k]();
      await page.waitForTimeout(400);
    }});
  }},
  autoconfig: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await lancer_autoconfig(page);
  },
  autoconfig_scenario: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await lancer_autoconfig(page);
    await page.click("[data-action='autoconfig_appliquer']");
    await page.waitForTimeout(3 * ATTENTE_MS);
    await ouvrir_panneau(page, "autoconfig");
    await aller_a(page, 300);
  },
  // Catalogue privé de démonstration (outils/captures_prive/, servi à la place de prive/ : jamais le vôtre).
  catalogue_prive: {film: true, faire: async (page, adresse, langue, chemin) => {
    await page.goto(`${adresse}/catalogue.html?lang=${langue}#unite/capteurs%2Fradars%2Fradar_basse_altitude_notionnel`);
    await page.waitForSelector("#fiche h2", {timeout: 60_000});
    // Public seul, puis fusionné (fiche de « Mon radar »), puis en remplacement : 6, 10 et 8 images.
    const changer = async (mode, fiche) => {
      await page.locator(`[name='mode_prive'][value='${mode}']`).check({force: true});
      await page.waitForLoadState("load");
      if (fiche) await page.evaluate((h) => (location.hash = h), fiche);
      await page.waitForSelector("#fiche h2", {timeout: 60_000});
      await page.waitForTimeout(ATTENTE_MS);
    };
    await filmer(page, chemin, {images: 24, ips: 2, geste: async (k) => {
      if (k === 6) await changer("fusion", "#unite/prive%2Fcapteurs%2Fradars%2Fmon_radar");
      if (k === 16) await changer("remplacement", "#unite/prive%2Fcapteurs%2Fradars%2Fmon_radar");
    }});
  }},
  palette_privee: {film: true, faire: async (page, adresse, langue, chemin) => {
    await page.addInitScript(() => localStorage.setItem("egide.catalogue_prive", "remplacement"));
    await ouvrir_interface(page, adresse, langue);
    await page.click("[data-action='editer']");
    await page.waitForTimeout(ATTENTE_MS);
    const poses = [["prive/capteurs/radars/mon_radar", 47.6, 3.4], ["prive/sites/postes/ma_batterie", 46.6, 2.2], ["prive/sites/postes/ma_batterie", 47.2, 1.6],
      ["prive/vecteurs/drones_defensifs/mon_intercepteur", 47.0, 3.0]];
    await filmer(page, chemin, {images: poses.length + 30, ips: 4, geste: async (k) => {
      if (k < poses.length) {
        const [id, lat, lon] = poses[k];
        const bouton = page.locator(`.unite-palette[data-unite='${id}']`);
        if (await bouton.count()) await bouton.first().click();
        const p = await ecran_deg(page, lat, lon);
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(ATTENTE_MS);
      } else if (k === poses.length) {
        await page.click("[data-action='terminer_edition']").catch(() => {});
        await page.waitForTimeout(ATTENTE_MS);
      } else {
        await aller_a(page, 30 * (k - poses.length), 250);
      }
    }});
  }},
  // Vue 3D (CesiumJS) : le navigateur doit savoir faire du WebGL.
  vue3d: {film: true, faire: async (page, adresse, langue, chemin) => {
    await ouvrir_interface(page, adresse, langue);
    await aller_a(page, 420);
    await page.click("[data-action='observer']");
    await page.waitForTimeout(8 * ATTENTE_MS);
    // Vue du commandant aux altitudes × 10, puis depuis un radar, puis près de l'essaim (caméra du site visé).
    const plans = [["commandant", "10"], ["radar", "1"], ["site", "1"]];
    await filmer(page, chemin, {images: 36, geste: async (k) => {
      if (k % 12 === 0) {
        const [camera, exageration] = plans[k / 12];
        await page.selectOption("[name='camera_3d']", camera);
        await page.selectOption("[name='exageration_3d']", exageration);
        await page.waitForTimeout(3 * ATTENTE_MS);
      }
      await aller_a(page, 420 + 10 * k, 600);
    }});
  }},
  modeles3d: async (page, adresse, langue) => {
    await ouvrir_interface(page, adresse, langue);
    await aller_a(page, 729);
    await page.click("[data-action='observer']");
    await page.waitForTimeout(6 * ATTENTE_MS);
    await page.selectOption("[name='camera_3d']", "site");
    await page.waitForTimeout(10 * ATTENTE_MS);
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
        const recette = typeof RECETTES[nom] === "function" ? {appareil: BUREAU, faire: RECETTES[nom]} : {appareil: BUREAU, ...RECETTES[nom]};
        const contexte = await navigateur.newContext(recette.appareil);
        // Réglages de carte retenus par le site (src/vue/carte_style.js) : hors ligne, le scope seul, sans fond.
        if (options.hors_ligne) await contexte.addInitScript(() => localStorage.setItem("egide.carte", JSON.stringify({fond: "fonds/aucun", ombrage: false, scope_seul: true})));
        const page = await contexte.newPage();
        try {
          const chemin = join(dossier, `${nom}.${recette.film ? "gif" : "png"}`);
          await recette.faire(page, adresse, langue, chemin);
          // Garde-fou : une clé de dictionnaire affichée telle quelle trahit un texte oublié par t().
          const cles = await page.evaluate(() => [...new Set((document.body.innerText + [...document.querySelectorAll("svg text")].map((e) => e.textContent).join(" "))
            .match(/⟦[^⟧]+⟧|\b(?:vue|page|commun|cli)\.[a-z0-9_]+\.[a-z0-9_.]+/g) ?? [])]);
          if (cles.length) console.warn(t("cli.captures.cles", {nom, langue, cles: cles.join(", ")}));
          if (!recette.film) await page.screenshot({path: chemin});
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
