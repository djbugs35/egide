// Serveur local d'une partie en direct (docs/PLAN_JEU.md étape 5, docs/FORMATS.md § 10), à piloter depuis Godot :
//
//   node src/direct.js                                        # scénario de référence, port 8767
//   node src/direct.js --scenario scenarios/autre.json --port 9000 --simulation.graine 7
//
// La partie démarre en pause. N'écoute que sur 127.0.0.1. À la fin d'un raid, le scénario joué, ordres compris, va dans
// resultats/parties/ : `node src/rejeu.js --scenario <ce fichier>` en refait le rejeu.
import {existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {join} from "node:path";
import {performance} from "node:perf_hooks";
import {pathToFileURL} from "node:url";
import {lire_arguments} from "./arguments.js";
import {index_unites, index_unites_prive} from "../outils/indexer.js";
import {charger_unites, chemin_unite} from "./moteur/catalogue.js";
import {charger_tous_algos, charger_unites_scenario, ids_unites_disque, lire_fichier, RACINE} from "./moteur/catalogue_node.js";
import {creer_partie} from "./moteur/partie.js";
import {empreinte} from "./moteur/preuve.js";
import {en_v2, modifier_scenario} from "./moteur/scenario.js";
import {creer_atelier_scenario} from "./serveur/atelier_scenario.js";
import {creer_atelier_terrain, message_terrain} from "./serveur/atelier_terrain.js";
import {CommandeInvalide, creer_salle} from "./serveur/salle.js";
import {cle_acceptation, creer_lecteur, OPCODES, origine_admise, trame, TrameInvalide} from "./serveur/websocket.js";

const ADRESSE = "127.0.0.1";
export const PORT_DEFAUT = 8767;
const PERIODE_TIC_MS = 100;
// Client qui ne suit pas (mesuré : une image de référence fait environ 50 ko) : on saute ses images, jamais ses évènements.
const ATTENTE_MAX_OCTETS = 1 << 22;
const FERMETURE_PROTOCOLE = 1002;
const NOM_VALIDE = /^[\p{L}\p{N}_-]{1,64}$/u;

/** Écrire `scenario_joue` sous resultats/parties/, de façon atomique ; rendre {chemin, empreinte}. */
async function archiver(scenario_joue, registre) {
  const dossier = join(RACINE, "resultats", "parties");
  mkdirSync(dossier, {recursive: true});
  const fichiers = await charger_unites_scenario(scenario_joue);
  const trace = await empreinte(scenario_joue, fichiers, registre);
  const chemin = join(dossier, `partie-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(`${chemin}.tmp`, JSON.stringify(scenario_joue, null, 1));
  renameSync(`${chemin}.tmp`, chemin);
  console.log(`Partie enregistrée : ${chemin}`);
  return {chemin, empreinte: trace.empreinte};
}

/** Écrire `contenu` en JSON dans `chemin`, de façon atomique. */
function ecrire_json(chemin, contenu) {
  writeFileSync(`${chemin}.tmp`, `${JSON.stringify(contenu, null, 2)}\n`);
  renameSync(`${chemin}.tmp`, chemin);
}

/** Rendre la bibliothèque des scénarios : ceux du dépôt, lisibles, et ceux du joueur, sous prive/, jamais publiés. */
function creer_bibliotheque() {
  const dossier_joueur = join(RACINE, "prive", "scenarios");
  const sous = (dossier, prefixe) => (existsSync(join(RACINE, dossier)) ? readdirSync(join(RACINE, dossier)).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => ({id: `${dossier}/${f}`, nom: `${prefixe}${f.replace(/\.json$/, "")}`})) : []);
  const lister = () => [...sous("scenarios", ""), ...sous("prive/scenarios", "moi : ")];
  return {
    lister,
    lire(id) {
      if (!lister().some((s) => s.id === id)) throw new CommandeInvalide(`scénario inconnu : ${id}`);
      return JSON.parse(readFileSync(join(RACINE, id), "utf-8"));
    },
    ecrire(nom, brut) {
      if (typeof nom !== "string" || !NOM_VALIDE.test(nom)) throw new CommandeInvalide("nom invalide : lettres, chiffres, - et _ seulement");
      mkdirSync(dossier_joueur, {recursive: true});
      ecrire_json(join(dossier_joueur, `${nom}.json`), brut);
      return `prive/scenarios/${nom}.json`;
    },
  };
}

/** Enregistrer un terrain édité sous prive/, tenir à jour l'index privé et la palette ; rendre son identifiant. */
function ecrire_terrain(nom, unite, index, fichiers) {
  const id = `prive/terrains/${nom}`;
  mkdirSync(join(RACINE, "prive", "unites", "terrains"), {recursive: true});
  ecrire_json(join(RACINE, chemin_unite(id)), unite);
  const prive = index_unites_prive();
  ecrire_json(join(RACINE, "prive", "unites", "index.json"), prive);
  fichiers[id] = unite;
  if (!index.some((u) => u.id === id)) index.push(prive.find((u) => u.id === id));
  return id;
}

/** Rendre les extensions de la salle : édition du scénario, du relief, et grille de terrain à chaque ouverture. */
function extensions_salle(index, fichiers) {
  const scenario = creer_atelier_scenario({index, fichiers, bibliotheque: creer_bibliotheque()});
  const terrain = creer_atelier_terrain({lire_unite: (id) => lire_fichier(chemin_unite(id)), ecrire_terrain: (nom, unite) => ecrire_terrain(nom, unite, index, fichiers)});
  return (acces) => {
    const [a, b] = [scenario(acces), terrain(acces)];
    return {
      arrivee: a.arrivee,
      ouverture: () => [message_terrain(acces.partie()), ...a.ouverture()],
      commandes: {
        ...a.commandes, ...b.commandes,
        // Le relief enregistré doit apparaître aussitôt dans les listes du client.
        terrain_enregistrer: async (message) => {
          await b.commandes.terrain_enregistrer(message);
          acces.diffuser(a.arrivee()[0]);
        },
      },
    };
  };
}

/** Brancher le client de la connexion `socket` sur la salle ; `clients` : l'ensemble de ceux à qui diffuser. */
function brancher_client(socket, salle, clients) {
  const lire = creer_lecteur();
  const envoyer = (enregistrement) => {
    if (enregistrement.genre === "image" && socket.writableLength > ATTENTE_MAX_OCTETS) return;
    socket.write(trame(OPCODES.texte, Buffer.from(JSON.stringify(enregistrement))));
  };
  const client = {envoyer, socket};
  const traiter = ({opcode, charge}) => {
    if (opcode === OPCODES.fermeture) socket.end(trame(OPCODES.fermeture, charge.subarray(0, 2)));
    else if (opcode === OPCODES.ping) socket.write(trame(OPCODES.pong, charge));
    else if (opcode === OPCODES.texte) salle.commander(JSON.parse(charge.toString("utf-8")));
  };
  socket.on("data", (morceau) => {
    try {
      lire(morceau).forEach(traiter);
    } catch (erreur) {
      if (!(erreur instanceof TrameInvalide || erreur instanceof SyntaxError)) throw erreur;
      console.error(`client refusé : ${erreur.message}`);
      const code = Buffer.alloc(2);
      code.writeUInt16BE(FERMETURE_PROTOCOLE);
      socket.end(trame(OPCODES.fermeture, code));
    }
  });
  socket.on("close", () => clients.delete(client));
  socket.on("error", (erreur) => console.error(`liaison coupée : ${erreur.message}`));
  clients.add(client);
  salle.arrivee(envoyer);
}

/** Répondre à la demande de passage en WebSocket, ou la refuser si elle ne vient pas de ce poste. */
function accepter(requete, socket, salle, clients) {
  const cle = requete.headers["sec-websocket-key"];
  if (!cle || requete.headers["sec-websocket-version"] !== "13" || !origine_admise(requete.headers.origin)) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${cle_acceptation(cle)}\r\n\r\n`);
  socket.setNoDelay(true);
  brancher_client(socket, salle, clients);
}

async function principal() {
  const {options, modifications} = lire_arguments(process.argv.slice(2), {scenario: "scenarios/reference.json", port: PORT_DEFAUT});
  const brut = modifier_scenario(en_v2(JSON.parse(readFileSync(options.scenario, "utf-8"))), modifications);
  const registre = await charger_tous_algos();
  const catalogue = await charger_unites(ids_unites_disque(), lire_fichier);
  const index = [...index_unites(), ...index_unites_prive()];
  const clients = new Set();
  const salle = creer_salle({
    brut,
    preparer: async (voulu) => creer_partie(voulu, await charger_unites_scenario(voulu), registre),
    diffuser: (enregistrement) => clients.forEach((client) => client.envoyer(enregistrement)),
    archiver: (scenario_joue) => archiver(scenario_joue, registre),
    maintenant: () => performance.now(),
    extensions: extensions_salle(index, catalogue),
  });
  await salle.demarrer();
  const serveur = createServer((_, reponse) => reponse.writeHead(426, {"Content-Type": "text/plain; charset=utf-8"}).end("Serveur de partie Égide : connexion WebSocket attendue.\n"));
  serveur.on("upgrade", (requete, socket) => accepter(requete, socket, salle, clients));
  serveur.listen(options.port, ADRESSE, () => console.log(`Partie prête, en pause : ws://${ADRESSE}:${options.port}`));
  let precedent = performance.now();
  setInterval(() => {
    const instant = performance.now();
    const dt_s = (instant - precedent) / 1000;
    precedent = instant;
    salle.tic(dt_s)?.catch((erreur) => console.error(`archivage impossible : ${erreur.message}`));
  }, PERIODE_TIC_MS);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
