// Salle du serveur de partie : horloge, pause, commandes refusées. Partie factice : seules les règles de la salle comptent.
import assert from "node:assert/strict";
import test from "node:test";
import {BUDGET_MS, creer_salle, VITESSE_MAX} from "../src/serveur/salle.js";

function fausse_partie(brut = {nom: "a"}, duree = 1000) {
  const p = {
    brut, pas: 0.5, t: 0, ordres: [], avances: 0,
    instant: () => p.t, termine: () => p.t >= duree, bilan: () => ({fuites: 0}),
    ouverture: () => [{genre: "entete"}], avancer: () => { p.t += 0.5; p.avances++; },
    releve: () => (p.t >= duree && !p.fini ? ((p.fini = true), [{genre: "image"}, {genre: "bilan"}]) : [{genre: "image"}]),
    ordonner: (m) => p.ordres.push(m), scenario_joue: () => p.brut,
  };
  return p;
}

async function salle_de_test({duree, cout_ms = 0} = {}) {
  const [diffuses, parties] = [[], []];
  let horloge = 0;
  const salle = creer_salle({
    brut: {nom: "depart"},
    preparer: async (voulu) => {
      if (voulu.casse) throw new Error("scénario impossible");
      parties.push(fausse_partie(voulu, duree));
      return parties.at(-1);
    },
    diffuser: (e) => diffuses.push(e),
    archiver: async () => ({chemin: "x.json", empreinte: "e"}),
    maintenant: () => (horloge += cout_ms),
  });
  await salle.demarrer();
  return {salle, diffuses, parties};
}

test("démarrage en pause : un tic n'avance rien tant que le joueur n'a pas repris", async () => {
  const {salle, parties} = await salle_de_test();
  salle.tic(1);
  assert.equal(parties[0].avances, 0);
  await salle.commander({type: "reprendre"});
  salle.tic(1);
  assert.equal(parties[0].avances, 2);
});

test("vitesse : ×10 joue dix fois plus de pas, le temps de moins d'un pas s'accumule", async () => {
  const {salle, parties} = await salle_de_test();
  await salle.commander({type: "reprendre"});
  await salle.commander({type: "vitesse", valeur: 10});
  salle.tic(0.1);
  assert.equal(parties[0].avances, 2);
  await salle.commander({type: "vitesse", valeur: 1});
  for (let i = 0; i < 4; i++) salle.tic(0.1);
  assert.equal(parties[0].avances, 2);
  salle.tic(0.1);
  assert.equal(parties[0].avances, 3);
});

test("budget : le retard non rattrapable est abandonné au lieu de s'accumuler", async () => {
  const {salle, diffuses, parties} = await salle_de_test({cout_ms: BUDGET_MS / 3});
  await salle.commander({type: "reprendre"});
  await salle.commander({type: "vitesse", valeur: VITESSE_MAX});
  salle.tic(1);
  const premier = parties[0].avances;
  assert.ok(premier < 5, `${premier} pas joués`);
  assert.ok(diffuses.filter((e) => e.genre === "etat").at(-1).vitesse_obtenue < VITESSE_MAX);
  salle.tic(0.0001);
  assert.equal(parties[0].avances, premier, "le retard a été conservé");
});

test("fin de raid : la partie est archivée une fois et annoncée après le bilan", async () => {
  const {salle, diffuses} = await salle_de_test({duree: 1});
  await salle.commander({type: "reprendre"});
  await salle.tic(1);
  salle.tic(1);
  const genres = diffuses.map((e) => e.genre);
  assert.equal(genres.filter((g) => g === "archive").length, 1);
  assert.ok(genres.indexOf("archive") > genres.indexOf("bilan"));
});

test("modifier : relance la partie par chemin, en pause, et annonce la nouvelle ouverture", async () => {
  const {salle, diffuses, parties} = await salle_de_test();
  await salle.commander({type: "reprendre"});
  await salle.commander({type: "modifier", modifications: {"simulation.graine": 7}});
  assert.equal(parties.length, 2);
  assert.equal(parties[1].brut.simulation.graine, 7);
  assert.equal(diffuses.filter((e) => e.genre === "entete").length, 2);
  salle.tic(1);
  assert.equal(parties[1].avances, 0);
});

test("modification qui échoue : annoncée, et la partie en cours continue", async () => {
  const {salle, diffuses, parties} = await salle_de_test();
  await salle.commander({type: "modifier", modifications: {casse: true}});
  assert.equal(diffuses.at(-1).genre, "erreur");
  assert.equal(parties.length, 1);
  await salle.commander({type: "reprendre"});
  salle.tic(1);
  assert.equal(parties[0].avances, 2);
});

test("chemin vers un prototype refusé : un client ne peut pas polluer Object", async () => {
  const {salle, diffuses, parties} = await salle_de_test();
  for (const chemin of ["__proto__.pollue", "a.constructor.prototype.pollue"]) {
    await salle.commander({type: "modifier", modifications: {[chemin]: true}});
    assert.equal(diffuses.at(-1).genre, "erreur");
  }
  assert.equal(parties.length, 1);
  assert.equal({}.pollue, undefined);
});

test("commandes invalides : type inconnu ou hérité, vitesse hors bornes, sans effet sur la partie", async () => {
  const {salle, diffuses} = await salle_de_test();
  for (const mauvaise of [{type: "toString"}, {type: "inconnue"}, null, {type: "vitesse", valeur: 0}, {type: "vitesse", valeur: VITESSE_MAX + 1}, {type: "vitesse", valeur: "x"}]) {
    await salle.commander(mauvaise);
    assert.equal(diffuses.at(-1).genre, "erreur", JSON.stringify(mauvaise));
  }
});

test("arrivée en cours de partie : le nouveau client reçoit l'ouverture puis l'état", async () => {
  const {salle} = await salle_de_test();
  const recus = [];
  salle.arrivee((e) => recus.push(e.genre));
  assert.deepEqual(recus, ["entete", "etat"]);
});
