import json
import math
from pathlib import Path

import pytest

from analyse.catalogue import CatalogueInvalideError, charger_unites, unite_brute, unite_si
from analyse.scenario import ScenarioInvalideError, aplatir, charger_scenario, ids_unites, resoudre_scenario

ICI = Path(__file__).parent
REFERENCE = ICI.parent / "scenarios" / "reference.json"
BRUT = json.loads(REFERENCE.read_text(encoding="utf-8"))
FICHIERS = charger_unites(ids_unites(BRUT))


def _egaux(a, b) -> bool:
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(_egaux(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return len(a) == len(b) and all(_egaux(x, y) for x, y in zip(a, b, strict=True))
    if isinstance(a, float | int) and not isinstance(a, bool):
        return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)
    return a == b


def test_resolution_identique_au_jumeau_javascript():
    attendu = json.loads((ICI / "resolution_reference.json").read_text(encoding="utf-8"))["resolu"]
    assert _egaux(resoudre_scenario(BRUT, FICHIERS), attendu)


def test_vue_plate_du_scenario_de_reference():
    scenario = charger_scenario(REFERENCE)
    assert scenario.zone_rayon == 150_000
    assert scenario.drones_vitesse == pytest.approx(222.222, rel=1e-4)
    assert (scenario.avions_nombre, scenario.avions_ir_nombre) == (50, 20)
    assert scenario.sol_munitions == 1020


def test_unite_herite_des_cles_et_de_l_aide_de_ses_ancetres():
    avion = unite_brute("vecteurs/avions/turbopropulseur_laser_notionnel", FICHIERS)
    assert avion["vitesse_engagement_kmh"] == 350
    assert "emport_nombre" in avion["_aide"]


def test_surcharge_d_une_cle_inconnue_refusee():
    with pytest.raises(CatalogueInvalideError, match="portee_mile"):
        unite_si("sites/postes/poste_sol_air_notionnel", FICHIERS, {"portee_mile": 3})


def test_cle_sans_phrase_aide_refusee():
    brut = json.loads(json.dumps(BRUT))
    brut["simulation"]["_aide"].pop("graine")
    with pytest.raises(ScenarioInvalideError, match="graine"):
        resoudre_scenario(brut, FICHIERS)


def test_scenario_v1_refuse_cote_python():
    with pytest.raises(ScenarioInvalideError, match="format 2"):
        resoudre_scenario(json.loads((ICI / "scenario_v1.json").read_text(encoding="utf-8")), FICHIERS)


def test_flotte_heterogene_en_portee_refusee_par_la_vue_plate():
    brut = json.loads(json.dumps(BRUT))
    brut["bleu"]["avions"][0]["surcharges_emport"] = {"portee_km": 12}
    with pytest.raises(ScenarioInvalideError, match="heterogene"):
        aplatir(resoudre_scenario(brut, FICHIERS))


def _variante(nom: str) -> tuple[dict, dict]:
    """Rendre (scenario de reference modifie par chemin, resolution attendue) de la variante `nom` partagee avec JS."""
    variante = json.loads((ICI / "resolution_reference.json").read_text(encoding="utf-8"))[nom]
    brut = json.loads(json.dumps(BRUT))
    for chemin, valeur in variante["modifications"].items():
        *parents, dernier = chemin.split(".")
        noeud = brut
        for cle in parents:
            noeud = noeud[int(cle) if cle.isdigit() else cle]
        noeud[int(dernier) if dernier.isdigit() else dernier] = valeur
    return brut, variante["resolu"]


def test_resolution_du_reseau_identique_au_jumeau_javascript():
    brut, attendu = _variante("variante_reseau")
    assert _egaux(resoudre_scenario(brut, charger_unites(ids_unites(brut))), attendu)


def test_resolution_du_deploiement_identique_au_jumeau_javascript():
    brut, attendu = _variante("variante_deploiement")
    assert _egaux(resoudre_scenario(brut, charger_unites(ids_unites(brut))), attendu)


def test_resolution_de_l_essaim_reactif_identique_au_jumeau_javascript():
    brut, attendu = _variante("variante_reaction")
    assert _egaux(resoudre_scenario(brut, charger_unites(ids_unites(brut))), attendu)


def test_scenario_sans_cles_de_reaction_resolu_avec_les_reglages_par_defaut():
    brut = json.loads(json.dumps(BRUT))
    brut["rouge"] = {cle: valeur for cle, valeur in brut["rouge"].items() if not cle.startswith("reaction")}
    rouge = resoudre_scenario(brut, FICHIERS)["rouge"]
    assert rouge["reaction"] is None
    assert rouge["reaction_rayon_danger"] == 10_000


def test_reaction_inconnue_refusee():
    brut = json.loads(json.dumps(BRUT))
    brut["rouge"]["reaction"] = "panique"
    with pytest.raises(ScenarioInvalideError, match="reaction inconnue"):
        resoudre_scenario(brut, FICHIERS)


def test_arme_citee_par_la_seule_surcharge_d_un_groupe_chargee():
    """ids_unites ignorait surcharges.emport : une arme deposee sur un avion dans l'editeur n'etait pas chargee."""
    arme = "effecteurs/drones/charge_impact_notionnelle"
    brut = json.loads(json.dumps(BRUT))
    brut["bleu"]["avions"][0]["surcharges"] = {"emport": arme}
    assert arme in ids_unites(brut)


def test_reseau_refuse_un_noeud_inconnu():
    brut = json.loads(json.dumps(BRUT))
    brut["bleu"]["reseau"]["liaisons"] = [
        {"de": "avions:9", "vers": "conduite", "moyen": "liaisons/filaire_notionnelle"}
    ]
    with pytest.raises(ScenarioInvalideError, match="noeud inconnu"):
        resoudre_scenario(brut, charger_unites(ids_unites(brut)))
