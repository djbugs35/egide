// Format de rejeu pour moteur de jeu (jalon 15.1, MODELE § 24, docs/FORMATS.md § 6).
import assert from "node:assert/strict";
import test from "node:test";
import {ajouter, depuis_ecef, depuis_enu, distance_oblique, vers_ecef} from "../src/moteur/geodesie.js";
import {bilan, simuler} from "../src/moteur/monde.js";
import {bilan_du_rejeu, COLONNES, creer_rejeu, ETATS, lire_rejeu, texte_rejeu} from "../src/moteur/rejeu.js";
import {modifier_scenario, resoudre_scenario} from "../src/moteur/scenario.js";
import {schemas} from "../outils/schemas.js";
import {FICHIERS, REFERENCE, REGISTRE} from "./aide_scenario.js";

const PETIT = {"rouge.nombre": 120, "bleu.sol.nombre": 40, "bleu.sol.munitions": 200};
const brut = (modifications = {}) => modifier_scenario(REFERENCE, {...PETIT, ...modifications});
const rejeu = async (modifications, options) => lire_rejeu(texte_rejeu(await creer_rejeu(brut(modifications), FICHIERS, REGISTRE, options)));
const REJEU = await rejeu();
const simule = (modifications, options = {}) => simuler(resoudre_scenario(brut(modifications), FICHIERS), {registre: REGISTRE, journal: false, ...options});
const colonne = (genre, nom) => COLONNES[genre].indexOf(nom);

test("rejeu : le bilan du fichier est celui d'une simulation sans journal ni observateur", () => {
  assert.deepEqual(REJEU.bilan, {genre: "bilan", ...bilan(simule())});
});

test("rejeu : images et évènements seuls redonnent fuites, destructions, munitions et durée", () => {
  const recalcule = bilan_du_rejeu(REJEU);
  for (const [cle, valeur] of Object.entries(recalcule)) assert.equal(valeur, REJEU.bilan[cle], cle);
});

test("rejeu : une même graine redonne le même fichier au caractère près", async () => {
  const [a, b] = await Promise.all([1, 2].map(() => creer_rejeu(brut(), FICHIERS, REGISTRE)));
  assert.equal(texte_rejeu(a), texte_rejeu(b));
});

test("rejeu : les colonnes ENU redonnent la position du moteur à moins de 1 m (critère du client)", () => {
  const origine = resoudre_scenario(brut(), FICHIERS).theatre.origine;
  const ecefOrigine = vers_ecef(origine);
  const images = REJEU.images.filter((_, i) => i % 97 === 0).filter((im) => im.drones.length);
  assert.ok(images.length > 1);
  const parInstant = new Map(images.map((im) => [im.t, im]));
  let verifies = 0;
  simule({}, {observer: (monde) => {
    const im = parInstant.get(monde.t);
    if (!im) return;
    for (const ligne of [...im.drones.map((l) => [l, monde.drones[l[0]]]), ...im.vecteurs.map((l) => [l, monde.avions[l[0]]])]) {
      const [[, e, n, u, alt], entite] = ligne;
      const ecef = ajouter(ecefOrigine, depuis_enu(origine, {e, n, u}));
      assert.ok(distance_oblique(ecef, entite.ecef) < 1, `écart à t = ${im.t}`);
      assert.ok(Math.abs(depuis_ecef(ecef).alt - entite.geo.alt) < 1);
      assert.ok(Math.abs(alt - entite.geo.alt) < 1);
      verifies++;
    }
  }});
  assert.ok(verifies > 100, `${verifies} positions vérifiées`);
});

test("rejeu : images à pas régulier et instants jamais décroissants, de 0 à la fin du raid", () => {
  assert.equal(REJEU.images[0].t, 0);
  assert.equal(REJEU.images.at(-1).t, REJEU.entete.duree_s);
  assert.equal(REJEU.images.length, REJEU.entete.images);
  REJEU.images.slice(1).forEach((im, i) => assert.equal(im.t - REJEU.images[i].t, 0.5));
  REJEU.evenements.slice(1).forEach((ev, i) => assert.ok(ev.t >= REJEU.evenements[i].t));
});

test("rejeu : un échantillonnage plus lâche garde la dernière image ; plus fin que le pas, il est borné au pas", async () => {
  const lache = await rejeu({}, {pas_echantillon: 2});
  assert.equal(lache.entete.pas_echantillon_s, 2);
  assert.equal(lache.images[1].t, 2);
  assert.equal(lache.images.at(-1).t, lache.entete.duree_s);
  assert.deepEqual(lache.bilan, REJEU.bilan);
  assert.equal((await rejeu({}, {pas_echantillon: 0.1})).entete.pas_echantillon_s, 0.5);
});

test("rejeu : l'en-tête donne reproductibilité, origine et fiches des unités en jeu", () => {
  const {entete} = REJEU;
  assert.match(entete.empreinte, /^[0-9a-f]{64}$/);
  assert.equal(entete.graine, REFERENCE.simulation.graine);
  assert.deepEqual(entete.origine, {lat_deg: 47, lon_deg: 2.5, alt_m: 0});
  const drone = entete.catalogue.find((u) => u.id === REFERENCE.rouge.unite);
  assert.equal(drone.famille, "vecteurs/drones");
  assert.equal(entete.catalogue.find((u) => u.id.startsWith("sites/")).famille, "sites/postes");
  assert.ok(drone.nom && "pays" in drone && "icone" in drone && drone.dimensions === null);
});

test("rejeu : la famille d'une unité rangée à un seul niveau est son dossier, pas son propre identifiant", async () => {
  const moyen = "liaisons/radio_vhf_uhf_notionnelle";
  const {entete} = await rejeu({"bleu.reseau.mode": "liaisons", "bleu.reseau.liaisons": [{de: "radar:0", vers: "conduite", moyen}]});
  assert.equal(entete.catalogue.find((u) => u.id === moyen).famille, "liaisons");
});

test("rejeu : le statique décrit sites, radars, postes, centres, liaisons et zones, en géodésique et en ENU", async () => {
  const moyen = "liaisons/radio_vhf_uhf_notionnelle";
  const {statique} = await rejeu({
    "bleu.reseau.mode": "liaisons", "bleu.reseau.liaisons": [{de: "radar:0", vers: "conduite", moyen}],
    "theatre.zones": [{nom: "Z", type: "protegee", points: [{lat_deg: 47, lon_deg: 2.5}, {lat_deg: 47.1, lon_deg: 2.5}, {lat_deg: 47, lon_deg: 2.6}]}],
  });
  assert.equal(statique.sites.length, REFERENCE.theatre.cibles_nombre);
  assert.equal(statique.postes.length, 40);
  assert.ok(statique.radars.length >= 3 && statique.radars[0].unite);
  assert.equal(statique.centres[0].noeud, "conduite");
  assert.deepEqual(statique.liaisons, {mode: "liaisons", liste: [{de: "radar:0", vers: "conduite", moyen}]});
  const [sommet] = statique.zones[0].points;
  assert.equal(sommet.lat_deg, 47);
  assert.ok(Math.abs(sommet.e) < 0.1 && Math.abs(sommet.n) < 0.1);
});

test("rejeu : un intercepteur kamikaze consommé apparaît perdu, et chaque impact cite son drone", async () => {
  const {images, evenements} = await rejeu({"bleu.avions.3.nombre": 10});
  const perdu = ETATS.vecteurs.indexOf("perdu");
  assert.ok(images.at(-1).vecteurs.some((v) => v[colonne("vecteurs", "etat")] === perdu));
  for (const e of evenements.filter((ev) => ev.type === "impact")) assert.equal(typeof e.drone, "number");
});

test("rejeu : le cap de chaque drone et vecteur en mouvement est sa direction de déplacement", () => {
  const ecart = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const verifier = (avant, apres, largeur) => {
    const suivants = new Map(apres.map((l) => [l[0], l]));
    let mesures = 0;
    for (const ligne of avant) {
      const suivant = suivants.get(ligne[0]);
      if (!suivant || Math.hypot(suivant[1] - ligne[1], suivant[2] - ligne[2]) < 20) continue;
      const route = (Math.atan2(suivant[1] - ligne[1], suivant[2] - ligne[2]) * 180) / Math.PI;
      // Le cap d'un vecteur est celui du pas qui s'achève : il regarde où il vient d'aller, d'où la comparaison à l'image suivante.
      assert.ok(ecart(suivant[colonne(largeur, "cap_deg")], route) < 12, `${largeur} ${ligne[0]} : cap ${suivant[colonne(largeur, "cap_deg")]}, route ${route}`);
      mesures++;
    }
    return mesures;
  };
  const rangs = [300, 500, 700].filter((r) => r + 1 < REJEU.images.length);
  const drones = rangs.reduce((n, r) => n + verifier(REJEU.images[r].drones, REJEU.images[r + 1].drones, "drones"), 0);
  const vecteurs = REJEU.images.slice(0, -1).reduce((n, im, r) => n + verifier(im.vecteurs, REJEU.images[r + 1].vecteurs, "vecteurs"), 0);
  assert.ok(drones > 20 && vecteurs > 20, `${drones} drones, ${vecteurs} vecteurs mesurés`);
});

test("rejeu : les positions des évènements sont écrites comme des lieux, sans radian du moteur", () => {
  const tir = REJEU.evenements.find((e) => e.type === "tir");
  for (const point of [tir.de, tir.vers]) assert.deepEqual(Object.keys(point), ["lat_deg", "lon_deg", "alt_m", "e", "n", "u"]);
});

test("rejeu : les couvertures sont écrites au départ, puis seulement quand le réseau change", async () => {
  assert.equal(REJEU.couvertures.length, 1);
  const [depart] = REJEU.couvertures;
  assert.equal(depart.t, 0);
  assert.equal(depart.c2[0].noeud, "conduite");
  assert.ok(depart.objets.find((o) => o.genre === "poste").interception > 0);
  const panne = await rejeu({"bleu.reseau.pannes": [{t_s: 200, element: "radar:0", duree_s: null}]});
  assert.equal(panne.couvertures.length, 2);
  assert.equal(panne.couvertures[1].t, 200);
  assert.ok(panne.couvertures[1].c2[0].membres.length < panne.couvertures[0].c2[0].membres.length);
});

test("rejeu : un autre fichier ou une autre version sont refusés", () => {
  assert.throws(() => lire_rejeu('{"format":"autre"}\n'), /pas un fichier de rejeu/);
  assert.throws(() => lire_rejeu('{"format":"egide-rejeu","version":99}\n'), /version de rejeu 99/);
});

test("rejeu : chaque ligne respecte le schéma généré (genre, clés requises, largeur des colonnes)", () => {
  const {oneOf} = schemas()["rejeu.schema.json"];
  const parGenre = Object.fromEntries(oneOf.map((s) => [s.properties.genre.const, s]));
  for (const ligne of [REJEU.entete, REJEU.statique, REJEU.images[1], REJEU.evenements[0], REJEU.couvertures[0], REJEU.bilan]) {
    for (const cle of parGenre[ligne.genre].required) assert.ok(cle in ligne, `${ligne.genre} : ${cle}`);
  }
  assert.ok(REJEU.images[1].vecteurs.every((v) => v.length === COLONNES.vecteurs.length));
  for (const im of REJEU.images.filter((i) => i.drones.length).slice(0, 5)) assert.ok(im.drones.every((d) => d.length === COLONNES.drones.length));
});
