"""Etape 1 : trace les abaques du scenario et ecrit leur recapitulatif chiffre.

Exemple :
    uv run --with matplotlib python -m analyse.abaques                 # scenario de reference
    uv run --with matplotlib python -m analyse.abaques --concentration 400 --sortie resultats/abaques
"""

import argparse
import math
import os
import tempfile
from pathlib import Path

import matplotlib as mpl

mpl.use("Agg")  # Sans ecran : les figures partent dans des fichiers, jamais dans une fenetre.
import matplotlib.pyplot as plt  # apres mpl.use : le moteur de rendu se choisit avant pyplot

from analyse import geometrie
from analyse.dimensionnement import delai_scenario, postes_sol_totaux
from analyse.langue import installer, t
from analyse.recapitulatif import ecrire_recapitulatif
from analyse.scenario import Scenario, charger_scenario
from analyse.unites import kmh_vers_ms

# Palette categorielle validee (daltonisme, contraste) : ordre fixe, jamais cycle.
COULEURS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
FOND, ENCRE, ENCRE_SECONDAIRE, GRILLE = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
PLAGE_TURBOPROPULSEUR_KMH = (450, 600)


def _styler(axe, titre: str, abscisse: str, ordonnee: str) -> None:
    axe.set_facecolor(FOND)
    axe.set_title(titre, loc="left", color=ENCRE, fontsize=13, pad=12)
    axe.set_xlabel(abscisse, color=ENCRE_SECONDAIRE)
    axe.set_ylabel(ordonnee, color=ENCRE_SECONDAIRE)
    axe.grid(color=GRILLE, linewidth=0.8)
    axe.tick_params(colors=ENCRE_SECONDAIRE)
    for bord in ("top", "right"):
        axe.spines[bord].set_visible(False)
    for bord in ("left", "bottom"):
        axe.spines[bord].set_color(GRILLE)


def _enregistrer(figure, chemin: Path) -> None:
    # Ecriture atomique : une figure a moitie ecrite ne remplace jamais la precedente.
    descripteur, temporaire = tempfile.mkstemp(suffix=".png", dir=chemin.parent)
    os.close(descripteur)
    figure.savefig(temporaire, dpi=160, facecolor=FOND, bbox_inches="tight")
    Path(temporaire).replace(chemin)
    plt.close(figure)


def _etiqueter_fin(axe, abscisses, ordonnees, texte: str, couleur: str) -> None:
    finis = [(x, y) for x, y in zip(abscisses, ordonnees, strict=True) if math.isfinite(y)]
    if finis:
        axe.plot(*finis[-1], "o", color=couleur, markersize=6, markeredgecolor=FOND, markeredgewidth=2)
        axe.annotate(texte, finis[-1], xytext=(6, 0), textcoords="offset points", va="center", color=ENCRE)


def tracer_vitesse_minimale(scenario: Scenario, delai: float, chemin: Path) -> None:
    """Tracer v_min (km/h) en fonction du nombre d'avions, une courbe par nombre d'avions voulus (MODELE § 3.5)."""
    flottes = list(range(5, 121))
    figure, axe = plt.subplots(figsize=(9, 5.5), facecolor=FOND)
    axe.axhspan(*PLAGE_TURBOPROPULSEUR_KMH, color=GRILLE, alpha=0.6, linewidth=0)
    axe.text(118, 525, t("cli.abaques.turbopropulseurs"), ha="right", va="center", color=ENCRE_SECONDAIRE, fontsize=9)
    for couleur, voulus in zip(COULEURS, (1, 5, 8, 10), strict=True):
        vitesses = [
            geometrie.vitesse_minimale(n, voulus, scenario.zone_rayon, scenario.roquette_air_portee, delai) * 3.6
            for n in flottes
        ]
        affichees = [v if v <= 1000 else float("nan") for v in vitesses]
        axe.plot(flottes, affichees, color=couleur, linewidth=2, label=f"k = {voulus}")
        _etiqueter_fin(axe, flottes, affichees, f"k = {voulus}", couleur)
    axe.set_ylim(0, 1000)
    axe.legend(frameon=False, loc="upper right", labelcolor=ENCRE, title=t("cli.abaques.avions_garantis"))
    _styler(axe, t("cli.abaques.vitesse_titre"), t("cli.abaques.avions_orbite"), t("cli.abaques.vitesse_minimale"))
    _enregistrer(figure, chemin)


def tracer_postes_sol(scenario: Scenario, flottes: tuple[int, ...], chemin: Path) -> None:
    """Tracer les postes sol totaux selon la concentration adverse par cible, avec et sans avions (MODELE § 6.1)."""
    concentrations = list(range(20, scenario.drones_nombre // 2 + 1, 10))
    figure, axe = plt.subplots(figsize=(9, 5.5), facecolor=FOND)
    for couleur, nombre in zip(COULEURS, flottes, strict=False):
        postes = [postes_sol_totaux(scenario, c, nombre, scenario.avions_vitesse) for c in concentrations]
        libelle = t("cli.abaques.sans_avions") if nombre == 0 else t("cli.abaques.n_avions", n=nombre)
        axe.plot(concentrations, postes, color=couleur, linewidth=2, label=libelle, drawstyle="steps-post")
        _etiqueter_fin(axe, concentrations, postes, libelle, couleur)
    axe.legend(frameon=False, loc="upper left", labelcolor=ENCRE)
    vitesse = round(scenario.avions_vitesse * 3.6)
    _styler(
        axe,
        t("cli.abaques.postes_titre", vitesse=vitesse),
        t("cli.abaques.concentration"),
        t("cli.abaques.postes_total_cibles", n=scenario.cibles_nombre),
    )
    _enregistrer(figure, chemin)


def tracer_carte_postes(scenario: Scenario, concentration: int, chemin: Path) -> None:
    """Tracer la carte des postes sol nécessaires selon nombre et vitesse des avions (MODELE § 6.1)."""
    flottes = list(range(0, 121, 5))
    vitesses_kmh = list(range(300, 701, 20))
    grille = [[postes_sol_totaux(scenario, concentration, n, kmh_vers_ms(v)) for n in flottes] for v in vitesses_kmh]
    figure, axe = plt.subplots(figsize=(9, 5.5), facecolor=FOND)
    image = axe.pcolormesh(flottes, vitesses_kmh, grille, cmap="Blues", shading="nearest")
    barre = figure.colorbar(image, ax=axe)
    barre.set_label(t("cli.abaques.postes_total"), color=ENCRE_SECONDAIRE)
    barre.outline.set_visible(False)
    axe.plot(
        scenario.avions_nombre,
        scenario.avions_vitesse * 3.6,
        "o",
        color=COULEURS[1],
        markersize=9,
        markeredgecolor=FOND,
        markeredgewidth=2,
    )
    axe.annotate(
        t("cli.abaques.scenario"),
        (scenario.avions_nombre, scenario.avions_vitesse * 3.6),
        xytext=(8, 8),
        textcoords="offset points",
        color=ENCRE,
    )
    _styler(
        axe,
        t("cli.abaques.carte_titre", n=concentration),
        t("cli.abaques.avions_orbite"),
        t("cli.abaques.vitesse_mise_a_poste"),
    )
    axe.grid(False)
    _enregistrer(figure, chemin)


def main() -> None:
    """Lire les arguments, tracer les trois abaques et ecrire le recapitulatif."""
    lecteur = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    lecteur.add_argument("--scenario", type=Path, default=Path("scenarios/reference.json"))
    lecteur.add_argument("--sortie", type=Path, default=Path("resultats/abaques"))
    lecteur.add_argument("--concentration", type=int, default=300, help="drones par cible pour la carte")
    lecteur.add_argument("--langue", default=None, help="en ou fr (sinon EGIDE_LANGUE, sinon en)")
    arguments = lecteur.parse_args()
    installer(arguments.langue)
    scenario = charger_scenario(arguments.scenario)
    arguments.sortie.mkdir(parents=True, exist_ok=True)
    delai = delai_scenario(scenario)
    tracer_vitesse_minimale(scenario, delai, arguments.sortie / "vitesse_minimale.png")
    tracer_postes_sol(scenario, (0, 20, scenario.avions_nombre, 100), arguments.sortie / "postes_sol.png")
    tracer_carte_postes(scenario, arguments.concentration, arguments.sortie / "carte_postes_sol.png")
    ecrire_recapitulatif(scenario, arguments.concentration, arguments.sortie / "recapitulatif.md")
    print(t("cli.abaques.ecrits", dossier=arguments.sortie))


if __name__ == "__main__":
    main()
