"""Lecture d'un scenario v2 (scenarios/*.json) : resolution par le catalogue, puis vue plate pour les abaques.

Jumeau de src/moteur/scenario.js pour la resolution (sans la migration v1, faite cote JavaScript).
"""

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

from analyse.catalogue import RACINE, CatalogueInvalideError, charger_unites, unite_si
from analyse.unites import convertir_objet

FORMAT = 2
# Noms courts des comportements publics ; toute autre tactique est l'identifiant complet d'un algorithme.
TACTIQUES = {
    "direct": "global/comportement/essaim_direct",
    "disperse": "global/comportement/essaim_disperse",
    "fourmi": "global/comportement/essaim_fourmi",
    "plan_de_vol": "global/comportement/plan_de_vol",
}
# Noms courts des reactions publiques de l'essaim (MODELE § 22) ; None : l'essaim ne reagit pas.
REACTIONS = {"adaptatif": "global/reaction/essaim_adaptatif"}
# Reglages de reaction par defaut (cles de fichier) : un scenario ecrit avant le jalon 16 peut basculer en reactif.
DEFAUTS_REACTION = {
    "reaction": None,
    "reaction_delai_s": 2,
    "reaction_pas_s": 5,
    "reaction_rayon_danger_km": 10,
    "reaction_seuil_pertes": 3,
    "reaction_allongement_max": 0.3,
    "reaction_seuil_gain": 0.2,
    "reaction_reaffectations_max": 1,
    "reaction_detours_max": 2,
    "reaction_esquive_reduction": 0.3,
    "reaction_esquive_perte_vitesse": 0.3,
}


def _vers_geo(points, altitude: float) -> list[dict]:
    """Rendre les positions placees a la main ({lat_deg, lon_deg}) en radians, a l'altitude donnee."""
    return [
        {"lat": math.radians(p["lat_deg"]), "lon": math.radians(p["lon_deg"]), "alt": altitude} for p in points or []
    ]


class ScenarioInvalideError(ValueError):
    """Le scenario n'est pas au format 2, ou une cle manque, est inconnue ou n'a pas sa phrase dans `_aide`."""


def _valider_aide(objet: dict, chemin: str) -> None:
    aide = objet.get("_aide", {})
    for cle, valeur in objet.items():
        if cle.startswith("_") or cle in {"surcharges", "surcharges_emport"}:
            continue
        if cle not in aide:
            raise ScenarioInvalideError(f"{chemin}{cle} : aucune phrase dans _aide")
        if isinstance(valeur, list):
            for i, element in enumerate(valeur):
                sans_aide = [k for k in element if not k.startswith("_") and f"{cle}[].{k}" not in aide]
                if sans_aide:
                    raise ScenarioInvalideError(f"{chemin}{cle}.{i} : cles sans phrase dans _aide : {sans_aide}")
        elif isinstance(valeur, dict):
            _valider_aide(valeur, f"{chemin}{cle}.")


def ids_unites(brut: dict) -> list[str]:
    """Rendre les identifiants d'unites que cite le scenario."""
    bleu = brut["bleu"]
    moyens = [liaison["moyen"] for liaison in bleu.get("reseau", {}).get("liaisons", [])]
    ids = [
        brut["rouge"]["unite"],
        *(g["unite"] for g in bleu["avions"]),
        # Arme changee dans l'editeur (depot d'un armement sur un avion) : seule la surcharge du groupe la cite.
        *(g["surcharges"]["emport"] for g in bleu["avions"] if g.get("surcharges", {}).get("emport")),
        bleu["sol"]["unite"],
        bleu["radar"]["unite"],
        *moyens,
        *([brut["theatre"]["terrain"]] if brut["theatre"].get("terrain") else []),
        # Deploiement (MODELE § 21) : unites propres des sites et des batteries, moyens dont chaque noeud est equipe.
        *(s["unite"] for s in [*bleu["radar"].get("sites", []), *bleu["sol"].get("batteries", [])] if s.get("unite")),
        *(m for e in bleu.get("reseau", {}).get("equipements", []) for m in e["moyens"]),
    ]
    return list(dict.fromkeys(ids))


def _resoudre_avions(groupes: list, fichiers: dict) -> list[dict]:
    resolus = []
    for groupe in groupes:
        avion = unite_si(groupe["unite"], fichiers, groupe.get("surcharges"))
        arme = unite_si(avion["emport"], fichiers, groupe.get("surcharges_emport"))
        altitude = float(groupe["altitude_m"])
        orbites = _vers_geo(groupe.get("orbites_placees"), altitude)
        resolus.append(
            {**avion, "nombre": groupe["nombre"], "altitude": altitude, "orbites_placees": orbites, "arme": arme}
        )
    return resolus


# Algorithme de detection impose par chaque disposition des radars (None : celui de l'unite). MODELE § 15.1.
DISPOSITIONS_RADAR = {"frontiere": None, "sites": "global/detection/sites_radar"}


def _resoudre_radar(radar: dict, fichiers: dict) -> dict:
    """Rendre le radar resolu : unite, disposition, sites et algorithme de detection."""
    unite = unite_si(radar["unite"], fichiers, radar.get("surcharges"))
    disposition = radar.get("disposition", "frontiere")
    if disposition not in DISPOSITIONS_RADAR:
        raise ScenarioInvalideError(f"disposition des radars inconnue « {disposition} »")
    # Un site peut citer sa propre unite ou ses surcharges (deploiement, MODELE § 21.1).
    brutes = radar.get("sites") or []
    propres = [
        unite_si(s.get("unite") or radar["unite"], fichiers, s.get("surcharges"))
        if s.get("unite") or s.get("surcharges")
        else None
        for s in brutes
    ]
    sites = [_vers_geo([s], (p or unite)["hauteur_antenne"])[0] for s, p in zip(brutes, propres, strict=True)]
    # Zero site est permis (carte videe dans l'editeur) : personne ne detecte rien.
    detection = DISPOSITIONS_RADAR[disposition] or unite["algos"]["detection"]
    resolu = {**unite, "algos": {**unite["algos"], "detection": detection}, "disposition": disposition, "sites": sites}
    if any(propres):
        resolu["sites_unites"] = [
            p
            and {
                "id": p["id"],
                "nom": p["nom"],
                "hauteur_antenne": p["hauteur_antenne"],
                "portee_max": p["portee_max"],
                "pays": p["pays"],
                "icone": p["icone"],
            }
            for p in propres
        ]
    return resolu


def _resoudre_sol(sol: dict, fichiers: dict) -> dict:
    """Rendre les postes sol resolus : dispositif commun et batteries placees, chacune avec son unite (MODELE § 21.2)."""
    resolu = {
        **unite_si(sol["unite"], fichiers, sol.get("surcharges")),
        "nombre": sol["nombre"],
        "munitions": sol["munitions"],
    }
    if sol.get("batteries"):
        resolu["batteries"] = [
            {
                "geo": _vers_geo([b], 0)[0],
                "munitions": b["munitions"],
                "unite": unite_si(b.get("unite") or sol["unite"], fichiers, b.get("surcharges")),
            }
            for b in sol["batteries"]
        ]
    return resolu


MODES_RESEAU = ("complet", "liaisons")


def _noeud_valide(noeud: str, groupes: int, centres: int) -> bool:
    """Rendre vrai si `noeud` nomme un noeud du reseau : conduite, centre:<k>, radar:<i>, avions:<g> ou sol:<i>."""
    if noeud == "conduite" or re.fullmatch(r"(radar|sol):\d+", noeud):
        return True
    if re.fullmatch(r"avions:\d+", noeud):
        return int(noeud[7:]) < groupes
    return bool(re.fullmatch(r"centre:\d+", noeud)) and int(noeud[7:]) < centres


def _resoudre_reseau(reseau: dict | None, theatre: dict, groupes: int, fichiers: dict) -> dict:
    """Rendre le reseau resolu : mode, centre de conduite (radians) et liaisons avec leur moyen en SI."""
    reseau = reseau or {}
    mode = reseau.get("mode", "complet")
    if mode not in MODES_RESEAU:
        raise ScenarioInvalideError(f"mode de reseau inconnu « {mode} »")
    liaisons = reseau.get("liaisons", [])
    for liaison in liaisons:
        for noeud in (liaison["de"], liaison["vers"]):
            if not _noeud_valide(noeud, groupes, len(reseau.get("centres", []))):
                raise ScenarioInvalideError(f"liaison : noeud inconnu « {noeud} »")
        if liaison["de"] == liaison["vers"]:
            raise ScenarioInvalideError(f"liaison de « {liaison['de']} » vers lui-meme")
    pannes = reseau.get("pannes", [])
    for panne in pannes:
        if not (panne["element"] == "conduite" or re.fullmatch(r"(radar|liaison|centre):\d+", panne["element"])):
            raise ScenarioInvalideError(f"panne : element inconnu « {panne['element']} »")
    lat, lon = reseau.get("centre_lat_deg"), reseau.get("centre_lon_deg")
    if lat is None or lon is None:
        lat, lon = theatre["origine_lat_deg"], theatre["origine_lon_deg"]
    return {
        "mode": mode,
        "conduite_ciblee": reseau.get("conduite_ciblee", False),
        "centres": [
            {
                "nom": c["nom"],
                "geo": _vers_geo([c], 0)[0],
                **({"allocation": c["allocation"]} if c.get("allocation") else {}),
            }
            for c in reseau.get("centres", [])
        ],
        "pannes": sorted(
            (
                {
                    "t": p["t_s"],
                    "element": p["element"],
                    "fin": None if p.get("duree_s") is None else p["t_s"] + p["duree_s"],
                }
                for p in pannes
            ),
            key=lambda p: p["t"],
        ),
        "centre": _vers_geo([{"lat_deg": lat, "lon_deg": lon}], 0)[0],
        "liaisons": [
            {"de": li["de"], "vers": li["vers"], "moyen": unite_si(li["moyen"], fichiers, None)} for li in liaisons
        ],
    }


def resoudre_scenario(brut: dict, fichiers: dict) -> dict:
    """Rendre le scenario resolu en unites SI, meme structure que resoudre_scenario() en JavaScript.

    Raises:
        ScenarioInvalideError: format, cle ou unite invalide.
    """
    if brut.get("format") != FORMAT:
        raise ScenarioInvalideError("seul le format 2 est lu ici ; un scenario v1 se migre cote JavaScript")
    _valider_aide(brut, "")
    theatre, rouge, bleu = brut["theatre"], brut["rouge"], brut["bleu"]
    if rouge["tactique"] not in TACTIQUES and "/" not in rouge["tactique"]:
        raise ScenarioInvalideError(f"tactique inconnue « {rouge['tactique']} »")
    reaction = rouge.get("reaction")
    if reaction and reaction not in REACTIONS and "/" not in reaction:
        raise ScenarioInvalideError(f"reaction inconnue « {reaction} »")
    try:
        drone = unite_si(rouge["unite"], fichiers, rouge.get("surcharges"))
        reglages_rouge = {
            **DEFAUTS_REACTION,
            **{cle: valeur for cle, valeur in rouge.items() if cle not in {"unite", "surcharges", "plan_de_vol"}},
        }
        cibles_placees = _vers_geo(theatre.get("cibles_placees"), 0)
        return {
            "nom": brut["nom"],
            "theatre": {
                "origine": {
                    "lat": math.radians(theatre["origine_lat_deg"]),
                    "lon": math.radians(theatre["origine_lon_deg"]),
                    "alt": 0,
                },
                "zone_rayon": convertir_objet({"zone_rayon_km": theatre["zone_rayon_km"]})["zone_rayon"],
                # Les cibles placees comptent toujours : le nombre de cibles ne descend pas sous leur nombre.
                "cibles_nombre": max(theatre["cibles_nombre"], len(cibles_placees)),
                "cibles_placees": cibles_placees,
                "terrain": unite_si(theatre["terrain"], fichiers, None) if theatre.get("terrain") else None,
                "zones": [
                    {"nom": z["nom"], "type": z["type"], "points": _vers_geo(z["points"], 0)}
                    for z in theatre.get("zones", [])
                ],
            },
            "rouge": {
                **drone,
                "altitude": drone["altitude_croisiere"],
                **convertir_objet(reglages_rouge),
                "plan_de_vol": _vers_geo(rouge.get("plan_de_vol"), drone["altitude_croisiere"]),
                "comportement": TACTIQUES.get(rouge["tactique"], rouge["tactique"]),
                "reaction": REACTIONS.get(reaction, reaction) if reaction else None,
            },
            "avions": _resoudre_avions(bleu["avions"], fichiers),
            "sol": _resoudre_sol(bleu["sol"], fichiers),
            "radar": _resoudre_radar(bleu["radar"], fichiers),
            "conduite": convertir_objet(bleu["conduite"]),
            "reseau": _resoudre_reseau(bleu.get("reseau"), theatre, len(bleu["avions"]), fichiers),
            # Ordres tries par instant : le moteur les applique dans l'ordre, sans revenir en arriere.
            "ordres": sorted(
                ({"t": o["t_s"], "avions": o["avions"], "point": _vers_geo([o], 0)[0]} for o in bleu.get("ordres", [])),
                key=lambda o: o["t"],
            ),
            "simulation": convertir_objet(brut["simulation"]),
        }
    except CatalogueInvalideError as erreur:
        raise ScenarioInvalideError(str(erreur)) from erreur


@dataclass(frozen=True)
class Scenario:
    """Vue plate d'un scenario resolu, en SI, pour les formules fermees (flotte homogene en portee et vitesses)."""

    zone_rayon: float
    cibles_nombre: int
    drones_nombre: int
    drones_vitesse: float
    drones_tactique: str
    drones_concentration_max: int
    drones_altitude: float
    radar_hauteur_antenne: float
    radar_portee_max: float
    delai_reaction: float
    interception_profondeur: float
    avions_nombre: int
    avions_ir_nombre: int
    avions_vitesse: float
    avions_vitesse_engagement: float
    avions_facteur_charge_max: float
    avions_roquettes_par_avion: int
    roquette_air_portee: float
    roquette_air_pk: float
    laser_duree_designation: float
    ir_cadence: float
    sol_munitions: int
    sol_postes_nombre: int
    sol_portee: float
    sol_pk: float
    sol_engagements_par_passage: int


def _commune(groupes: list[dict], lire, libelle: str):
    valeurs = {lire(groupe) for groupe in groupes if groupe["nombre"] > 0} or {lire(groupes[0])}
    if len(valeurs) > 1:
        raise ScenarioInvalideError(f"flotte heterogene en {libelle} : les abaques supposent une valeur commune")
    return valeurs.pop()


def _arme_de_guidage(groupes: list[dict], guidage: str, cle: str) -> float:
    armes = [g["arme"] for g in groupes if g["arme"]["guidage"] == guidage] or [g["arme"] for g in groupes]
    return armes[0][cle]


def aplatir(resolu: dict) -> Scenario:
    """Rendre la vue plate d'un scenario resolu.

    Raises:
        ScenarioInvalideError: les groupes d'avions different en vitesse, emport, portee ou Pk.
    """
    avions, rouge, sol, radar, conduite = (resolu[c] for c in ("avions", "rouge", "sol", "radar", "conduite"))
    # Les formules fermees ne portent que sur les avions : les drones defensifs (MODELE § 19) sont ecartes.
    avions = [g for g in avions if g.get("type_vecteur", "avion") == "avion"]
    return Scenario(
        zone_rayon=resolu["theatre"]["zone_rayon"],
        cibles_nombre=resolu["theatre"]["cibles_nombre"],
        drones_nombre=rouge["nombre"],
        drones_vitesse=rouge["vitesse"],
        drones_tactique=rouge["tactique"],
        drones_concentration_max=rouge["concentration_max"],
        drones_altitude=rouge["altitude"],
        radar_hauteur_antenne=radar["hauteur_antenne"],
        radar_portee_max=radar["portee_max"],
        delai_reaction=conduite["delai_reaction"],
        interception_profondeur=conduite["interception_profondeur"],
        avions_nombre=sum(g["nombre"] for g in avions),
        avions_ir_nombre=sum(g["nombre"] for g in avions if g["arme"]["guidage"] == "ir"),
        avions_vitesse=_commune(avions, lambda g: g["vitesse_mise_a_poste"], "vitesse de mise a poste"),
        avions_vitesse_engagement=_commune(avions, lambda g: g["vitesse_engagement"], "vitesse d'engagement"),
        avions_facteur_charge_max=_commune(avions, lambda g: g["facteur_charge_max"], "facteur de charge"),
        avions_roquettes_par_avion=_commune(avions, lambda g: g["emport_nombre"], "emport"),
        roquette_air_portee=_commune(avions, lambda g: g["arme"]["portee"], "portee d'arme"),
        roquette_air_pk=_commune(avions, lambda g: g["arme"]["pk"], "Pk"),
        laser_duree_designation=_arme_de_guidage(avions, "laser", "duree_designation"),
        ir_cadence=_arme_de_guidage(avions, "ir", "cadence"),
        sol_munitions=sol["munitions"],
        sol_postes_nombre=sol["nombre"],
        sol_portee=sol["portee"],
        sol_pk=sol["pk"],
        sol_engagements_par_passage=sol["engagements_par_passage"],
    )


def charger_scenario(chemin: Path, racine: Path = RACINE) -> Scenario:
    """Rendre la vue plate du scenario v2 lu dans `chemin`, resolu avec le catalogue de `racine`.

    Raises:
        ScenarioInvalideError: scenario ou catalogue invalide.
    """
    brut = json.loads(Path(chemin).read_text(encoding="utf-8"))
    return aplatir(resoudre_scenario(brut, charger_unites(ids_unites(brut), racine)))
