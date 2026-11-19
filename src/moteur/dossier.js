// Dossier de preuve en Markdown (MODELE § 14.5) : ce qu'un lecteur doit avoir pour juger et refaire un résultat.
// Partie pure : reçoit des résultats déjà calculés, ne lance aucune simulation.
import {unite_brute} from "./catalogue.js";
import {GRANDEURS} from "./campagne.js";
import {t} from "../i18n.js";
import {meta_traduite, nom_unite, sources_unite} from "../catalogue_langue.js";

const LIBELLES = {
  fuites: "cli.dossier.g_fuites", fuites_max_cible: "cli.dossier.g_fuites_max_cible", detruits_air: "cli.dossier.g_detruits_air",
  detruits_sol: "cli.dossier.g_detruits_sol", tirs_air: "cli.dossier.g_tirs_air", tirs_sol: "cli.dossier.g_tirs_sol", duree: "cli.dossier.g_duree",
};
const libelle = (g) => t(LIBELLES[g]);

const nombre = (x, chiffres = 1) => (x === null || x === undefined ? "—" : Number.isFinite(x) ? x.toFixed(chiffres) : "∞");
const valeur = (v) => (typeof v === "object" ? JSON.stringify(v) : String(v));
const tableau = (entetes, lignes) => [`| ${entetes.join(" | ")} |`, `|${entetes.map(() => "---").join("|")}|`, ...lignes.map((l) => `| ${l.join(" | ")} |`)].join("\n");

function section_empreinte({empreinte}) {
  const parties = Object.entries(empreinte.parties).map(([cle, h]) => `\`${cle}\` ${h.slice(0, 16)}`).join(" · ");
  return `## ${t("cli.dossier.empreinte")}\n\n\`${empreinte.empreinte}\`\n\n${parties}\n\n${t("cli.dossier.empreinte_texte")}`;
}

function section_differentiel({differentiel}) {
  if (differentiel.length === 0) return `## ${t("cli.dossier.ecarts")}\n\n${t("cli.dossier.aucun_ecart")}`;
  return `## ${t("cli.dossier.ecarts")}\n\n${tableau([t("cli.dossier.chemin"), t("cli.dossier.reference"), t("cli.dossier.ici")], differentiel.map((d) => [`\`${d.chemin}\``, valeur(d.avant), valeur(d.apres)]))}`;
}

function section_modeles({fichiers, registre, empreinte}) {
  const unites = Object.keys(fichiers).filter((id) => !id.split("/").at(-1).startsWith("_")).sort().map((id) => {
    const u = unite_brute(id, fichiers);
    return [`\`${id}\``, u.nom ? nom_unite(id, u.nom) : "", u.fidelite ?? "", (sources_unite(id, u.sources) ?? []).join(" ; ")];
  });
  const algos = empreinte.algos.map((id) => {
    const meta = meta_traduite(id, registre[id].meta);
    return [`\`${id}\``, meta.fidelite, meta.hypotheses.join(" ; ")];
  });
  return [
    `## ${t("cli.dossier.modeles")}`,
    tableau([t("cli.dossier.unite"), t("cli.dossier.nom"), t("cli.dossier.fidelite"), t("cli.dossier.sources")], unites),
    tableau([t("cli.dossier.algorithme"), t("cli.dossier.fidelite"), t("cli.dossier.hypotheses")], algos),
  ].join("\n\n");
}

function section_resultats({tirages, resume}) {
  const lignes = GRANDEURS.map((g) => [libelle(g), `${nombre(resume[g].moyenne)} ± ${nombre(resume[g].ic95)}`, nombre(resume[g].ecart_type)]);
  return `## ${t("cli.dossier.resultats")}\n\n${t("cli.dossier.resultats_texte", {n: tirages})}\n\n${tableau([t("cli.dossier.grandeur"), t("cli.dossier.moyenne_ic"), t("cli.dossier.ecart_type")], lignes)}`;
}

function section_convergence({convergence}) {
  if (!convergence) return `## ${t("cli.dossier.convergence")}\n\n${t("cli.dossier.non_evaluee")}`;
  const entetes = [t("cli.dossier.pas_s"), ...GRANDEURS.map(libelle), t("cli.dossier.conforme")];
  const lignes = convergence.lignes.map((l) => [
    l.pas_s === convergence.pas_s ? `**${l.pas_s}**` : String(l.pas_s),
    ...GRANDEURS.map((g) => `${nombre(l.resume[g].moyenne)} (z ${nombre(l.ecarts[g].z, 1)})`),
    l.conforme ? t("cli.dossier.oui") : `**${t("cli.dossier.non")}**`,
  ]);
  const verdict = `**${t(convergence.converge ? "cli.dossier.verdict_oui" : "cli.dossier.verdict_non")}**`;
  return [
    `## ${t("cli.dossier.convergence")}`,
    t("cli.dossier.convergence_texte", {n: convergence.tirages, pas: convergence.pas_reference_s}),
    tableau(entetes, lignes),
    verdict,
  ].join("\n\n");
}

/** Rendre le dossier de preuve en Markdown à partir de résultats calculés (voir src/preuve.js). */
export function dossier_markdown(donnees) {
  const entete = [
    `# ${t("cli.dossier.titre", {nom: donnees.nom})}`,
    t("cli.dossier.produit", {date: donnees.date, version: donnees.version, node: donnees.node}),
    `${t("cli.dossier.reproduire")} \`${donnees.commande}\``,
  ].join("\n\n");
  const limites = `## ${t("cli.dossier.limites")}\n\n${t("cli.dossier.limites_texte")}`;
  return [entete, section_empreinte(donnees), section_differentiel(donnees), section_resultats(donnees), section_convergence(donnees), section_modeles(donnees), limites].join("\n\n") + "\n";
}
