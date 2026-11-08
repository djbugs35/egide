// Schémas JSON (draft 2020-12) des fichiers que lit Égide, générés depuis le catalogue lui-même : les clés, leurs
// types et leurs phrases d'aide viennent des classes de base, si bien qu'un schéma ne peut pas dériver du code.
// Écrits dans schemas/ par node outils/indexer.js ; un outil externe s'en sert pour produire des fichiers valides,
// puis node outils/valider.js applique les règles complètes (docs/FORMATS.md).
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {ROLES} from "../src/moteur/algos.js";
import {FIDELITES, unite_brute} from "../src/moteur/catalogue.js";
import {RACINE, ids_unites_disque} from "../src/moteur/catalogue_node.js";
import {COLONNES, ETATS, FORMAT_REJEU, VERSION_REJEU} from "../src/moteur/rejeu.js";

// Familles d'unités : schéma, classe de base dont on lit les clés, dossier où ranger les fichiers.
export const FAMILLES = [
  ["drone", "vecteurs/drones/_drone", "unites/vecteurs/drones/"],
  ["avion", "vecteurs/avions/_avion", "unites/vecteurs/avions/"],
  ["drone_defensif", "vecteurs/drones_defensifs/_drone_defensif", "unites/vecteurs/drones_defensifs/"],
  ["roquette", "effecteurs/roquettes/_roquette_guidee", "unites/effecteurs/roquettes/"],
  ["charge_drone", "effecteurs/drones/_charge_drone", "unites/effecteurs/drones/"],
  ["brouillage", "effecteurs/brouillage/brouillage_notionnel", "unites/effecteurs/brouillage/"],
  ["radar", "capteurs/radars/radar_basse_altitude_notionnel", "unites/capteurs/radars/"],
  ["poste", "sites/postes/poste_sol_air_notionnel", "unites/sites/postes/"],
  ["liaison", "liaisons/_liaison", "unites/liaisons/"],
  ["terrain", "terrains/_terrain", "unites/terrains/"],
];

const ENTETE = "https://json-schema.org/draft/2020-12/schema";

/** Rendre le type JSON Schema d'une valeur d'exemple ; pays et icône acceptent null. */
function type_de(cle, valeur) {
  if (cle === "pays" || cle === "icone") return {type: ["string", "null"]};
  if (cle === "fidelite") return {enum: FIDELITES};
  if (cle === "sources") return {type: "array", items: {type: "string"}, minItems: 1};
  if (cle === "algos") return {type: "object", propertyNames: {enum: Object.keys(ROLES)}, additionalProperties: {type: "string"}};
  if (Array.isArray(valeur)) return {type: "array"};
  if (valeur === null) return {};
  if (typeof valeur === "number") return {type: Number.isInteger(valeur) && !/_(km|kmh|m|s|ms|g|deg)$/.test(cle) && !["pk", "facteur_conduite"].includes(cle) ? "integer" : "number"};
  return {type: typeof valeur};
}

/** Rendre le schéma d'une famille d'unités. */
function schema_famille(nom, base, dossier, fichiers) {
  const unite = unite_brute(base, fichiers);
  const proprietes = {
    herite_de: {type: "string", description: `${unite._aide.herite_de} Pour cette famille : ${base}, ou une unité qui en descend.`, examples: [base]},
    _aide: {type: "object", additionalProperties: {type: "string"}, description: "Phrase d'aide de chaque clé que l'unité ajoute ; les clés héritées ont déjà la leur."},
  };
  for (const [cle, valeur] of Object.entries(unite)) {
    if (cle.startsWith("_") || cle === "id" || cle === "herite_de") continue;
    proprietes[cle] = {...type_de(cle, valeur), description: unite._aide[cle], default: valeur};
  }
  return {
    $schema: ENTETE, $id: `egide/schemas/unite.${nom}.schema.json`, title: `Unité Égide : ${nom}`,
    description: `${fichiers[base]._aide?._ ?? `Unité de la famille ${nom}.`} Fichier ${dossier}<nom>.json (ou prive/${dossier}<nom>.json) ; identifiant = chemin sans « unites/ » ni « .json ». Toute clé ajoutée doit avoir sa phrase dans _aide. Valeurs en unités d'affichage, converties en SI selon le suffixe (docs/FORMATS.md).`.trim(),
    type: "object", required: ["herite_de", "nom", "sources"], properties: proprietes, additionalProperties: true,
  };
}

/** Rendre le schéma de la fiche `meta` d'un algorithme. */
function schema_meta() {
  const texte = {type: "string", minLength: 1};
  const liste = {type: "array", items: {type: "string"}};
  return {
    $schema: ENTETE, $id: "egide/schemas/algo_meta.schema.json", title: "Fiche « meta » d'un algorithme Égide",
    description: "Objet exporté sous le nom « meta » par un module ES algos/global/<rôle>/<nom>.js (ou prive/algos/…), qui exporte aussi les fonctions de son rôle (docs/FORMATS.md § 4).",
    type: "object", required: ["role", "nom", "fidelite", "description", "equations", "hypotheses", "domaine_validite", "references", "parametres"],
    properties: {
      role: {enum: Object.keys(ROLES), description: `Rôle tenu ; fonctions exigées : ${Object.entries(ROLES).map(([r, f]) => `${r} → ${f.join(", ")}`).join(" ; ")}.`},
      nom: texte, fidelite: {enum: FIDELITES}, description: texte, domaine_validite: texte,
      equations: liste, hypotheses: liste, references: {...liste, minItems: 1},
      parametres: {type: "object", description: "Clés SI lues dans l'unité porteuse (sans suffixe : vitesse_kmh devient vitesse).",
        additionalProperties: {type: "object", required: ["unite", "aide"], properties: {unite: {type: "string"}, aide: {type: "string"}}}},
    },
    additionalProperties: false,
  };
}

/** Rendre le schéma d'une ligne d'un fichier de rejeu ; colonnes et états viennent du moteur. */
function schema_rejeu() {
  const nombre = {type: "number"};
  const liste = {type: "array"};
  const lignes = (colonnes) => ({type: "array", items: {type: "array", minItems: colonnes.length, maxItems: colonnes.length, items: nombre}, description: `Colonnes : ${colonnes.join(", ")}.`});
  const genre = (nom, required, properties, description) => ({type: "object", description, required: ["genre", ...required], properties: {genre: {const: nom}, ...properties}});
  return {
    $schema: ENTETE, $id: "egide/schemas/rejeu.schema.json", title: "Ligne d'un fichier de rejeu Égide",
    description: "Un fichier .egide-rejeu est du JSON lignes compressé en gzip ; chaque ligne valide ce schéma (docs/FORMATS.md § 6).",
    oneOf: [
      genre("entete", ["format", "version", "empreinte", "graine", "origine", "repere", "duree_s", "pas_simulation_s", "pas_echantillon_s", "images", "colonnes", "etats", "catalogue"], {
        format: {const: FORMAT_REJEU}, version: {const: VERSION_REJEU}, empreinte: {type: "string"}, graine: nombre, repere: {type: "string"}, duree_s: nombre, pas_simulation_s: nombre, pas_echantillon_s: nombre, images: {type: "integer"},
        origine: {type: "object", required: ["lat_deg", "lon_deg", "alt_m"]}, colonnes: {const: COLONNES}, etats: {const: ETATS},
        catalogue: {type: "array", items: {type: "object", required: ["id", "famille", "nom", "pays", "icone", "dimensions"]}},
      }, "Première ligne du fichier."),
      genre("statique", ["drones", "vecteurs", "sites", "radars", "postes", "centres", "liaisons", "zones"], {drones: {type: "object", required: ["unite", "nombre"]}, vecteurs: liste, sites: liste, radars: liste, postes: liste, centres: liste, liaisons: {type: "object", required: ["mode", "liste"]}, zones: liste}, "Deuxième ligne : ce qui ne bouge pas."),
      genre("image", ["t", "drones", "vecteurs", "postes"], {t: nombre, drones: lignes(COLONNES.drones), vecteurs: lignes(COLONNES.vecteurs), postes: {type: "array", items: {type: "integer"}, description: "Munitions de chaque poste, dans l'ordre du statique."}}, "État du monde à l'instant t (s)."),
      genre("evenement", ["t", "type"], {t: nombre, type: {type: "string"}}, "Évènement daté du journal ; ses positions sont écrites comme les lieux du statique."),
      genre("couvertures", ["t", "objets", "c2"], {t: nombre, objets: {type: "array", items: {type: "object", required: ["noeud", "genre", "id", "unite", "lieu", "detection", "conduite", "interception", "profil"]}}, c2: {type: "array", items: {type: "object", required: ["noeud", "nom", "hs", "membres"]}}}, "Couvertures de chaque objet et résultante des C2 : à l'instant initial et à chaque changement du réseau."),
      genre("bilan", ["fuites", "fuites_max_cible", "duree"], {fuites: {type: "integer"}, fuites_max_cible: {type: "integer"}, duree: nombre}, "Dernière ligne : bilan de la simulation."),
    ],
  };
}

/** Rendre {nom de fichier: schéma} pour tout le dossier schemas/. */
export function schemas() {
  const ids = ids_unites_disque().filter((id) => !id.startsWith("prive/"));
  const fichiers = Object.fromEntries(ids.map((id) => [id, JSON.parse(readFileSync(join(RACINE, "unites", `${id}.json`), "utf-8"))]));
  const sortie = Object.fromEntries(FAMILLES.map(([nom, base, dossier]) => [`unite.${nom}.schema.json`, schema_famille(nom, base, dossier, fichiers)]));
  sortie["algo_meta.schema.json"] = schema_meta();
  sortie["rejeu.schema.json"] = schema_rejeu();
  return sortie;
}
