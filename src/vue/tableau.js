// Bilan vivant du raid : grands nombres, munitions, état de la flotte, frappes par cible.
import {format_entier} from "./format.js";
import {munitions_sol_initiales} from "../moteur/defense_sol.js";

const ETATS = [["orbite", "En orbite"], ["ralliement", "En route"], ["engagement", "Au contact"], ["poste", "À poste"]];

const somme = (elements, champ) => elements.reduce((total, element) => total + element[champ], 0);

function remplir(racine, champ, texte) {
  const element = racine.querySelector(`[data-champ="${champ}"]`);
  if (element && element.textContent !== texte) element.textContent = texte;
}

function jauge(racine, champ, restant, total) {
  const barre = racine.querySelector(`[data-jauge="${champ}"]`);
  if (barre) barre.style.inlineSize = `${total ? (100 * restant) / total : 0}%`;
  remplir(racine, champ, `${format_entier(restant)} sur ${format_entier(total)}`);
}

function frappes_par_cible(racine, monde) {
  const liste = racine.querySelector("[data-liste='cibles']");
  if (liste.children.length !== monde.cibles.length) {
    liste.innerHTML = monde.cibles.map((c, i) => `<li><span>${c.conduite ? "CDC" : `C${i + 1}`}</span><span class="barre"><i></i></span><b>0</b></li>`).join("");
  }
  const maximum = Math.max(1, monde.scenario.rouge.concentration_max);
  [...liste.children].forEach((ligne, i) => {
    ligne.querySelector("i").style.inlineSize = `${Math.min(100, (100 * monde.fuites[i]) / maximum)}%`;
    ligne.querySelector("b").textContent = format_entier(monde.fuites[i]);
  });
}

/** Mettre le tableau de bord `racine` à l'image du monde. */
export function mettre_a_jour_tableau(racine, monde) {
  const enVol = monde.drones.filter((d) => d.vivant && !d.arrive).length;
  remplir(racine, "en_vol", format_entier(enVol));
  remplir(racine, "detruits_air", format_entier(monde.compteurs.detruits_air));
  remplir(racine, "detruits_sol", format_entier(monde.compteurs.detruits_sol));
  remplir(racine, "frappes", format_entier(somme(monde.fuites.map((n) => ({n})), "n")));
  const {scenario} = monde;
  const emportTotal = scenario.avions.reduce((total, groupe) => total + groupe.nombre * groupe.emport_nombre, 0);
  jauge(racine, "munitions_air", somme(monde.avions, "munitions"), emportTotal);
  jauge(racine, "munitions_sol", somme(monde.postes, "munitions"), monde.postes.length ? munitions_sol_initiales(scenario.sol) : 0);
  for (const [etat] of ETATS) remplir(racine, `avions_${etat}`, format_entier(monde.avions.filter((a) => a.etat === etat && a.munitions > 0).length));
  remplir(racine, "avions_vides", format_entier(monde.avions.filter((a) => a.munitions === 0).length));
  frappes_par_cible(racine, monde);
  // Drones défensifs : leurs compteurs n'existent que s'il y en a (MODELE § 19).
  const {neutralises_brouillage: brouilles, intercepteurs_perdus: perdus} = monde.compteurs;
  const zone = racine.querySelector("[data-zone='defensifs']");
  const texte = [brouilles !== undefined ? `${format_entier(brouilles)} neutralisés par brouillage` : null,
    perdus !== undefined ? `${format_entier(perdus)} intercepteurs perdus` : null].filter(Boolean).join(" · ");
  if (zone && zone.textContent !== texte) [zone.textContent, zone.hidden] = [texte, !texte];
  // Essaim réactif : ses compteurs n'existent que s'il réagit (MODELE § 22.5).
  const {reaffectations, detours, esquives} = monde.compteurs;
  const zoneEssaim = racine.querySelector("[data-zone='essaim']");
  const texteEssaim = reaffectations === undefined ? ""
    : `Essaim réactif : ${format_entier(reaffectations)} réaffectations · ${format_entier(detours)} détours · ${format_entier(esquives)} tirs esquivés`;
  if (zoneEssaim && zoneEssaim.textContent !== texteEssaim) [zoneEssaim.textContent, zoneEssaim.hidden] = [texteEssaim, !texteEssaim];
}
