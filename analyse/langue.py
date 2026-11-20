"""Langue des sorties de l'analyse (jalon 27) : les dictionnaires du site, langues/<code>.json, anglais par defaut.

Memes regles que src/i18n.js : parametres {nom}, pluriels {"one", "other"} choisis par le parametre n, repli sur
l'anglais, cle absente montree entre crochets. Choix : installer(code), sinon la variable EGIDE_LANGUE.
"""

import json
import os
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
LANGUES = ("en", "fr")
DEFAUT = "en"


def _lire(code: str) -> dict:
    return json.loads((RACINE / "langues" / f"{code}.json").read_text(encoding="utf-8"))


_etat: dict = {}


def installer(code: str | None = None) -> str:
    """Installer la langue `code` (sinon EGIDE_LANGUE, sinon l'anglais) ; rendre celle retenue."""
    voulu = code or os.environ.get("EGIDE_LANGUE") or DEFAUT
    choisi = voulu if voulu in LANGUES else DEFAUT
    secours = _lire(DEFAUT)
    _etat.update(code=choisi, dico=secours if choisi == DEFAUT else _lire(choisi), secours=secours)
    return choisi


def _forme(n: float) -> str:
    if _etat["code"] == "fr":
        return "one" if abs(n) < 2 else "other"
    return "one" if n == 1 else "other"


def t(cle: str, **parametres) -> str:
    """Rendre le texte de `cle` dans la langue installee, `parametres` remplaces."""
    if not _etat:
        installer()
    valeur = _etat["dico"].get(cle, _etat["secours"].get(cle))
    if valeur is None:
        return f"⟦{cle}⟧"
    if isinstance(valeur, dict):
        valeur = valeur.get(_forme(float(parametres.get("n", 0))), valeur.get("other", ""))
    for nom, remplacant in parametres.items():
        valeur = valeur.replace("{" + nom + "}", str(remplacant))
    return valeur
