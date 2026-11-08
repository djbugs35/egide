"""Le serveur local exige la revalidation des fichiers par le navigateur."""

import importlib.util
from io import BytesIO
from pathlib import Path

CHEMIN = Path(__file__).resolve().parent.parent / "outils" / "serveur_local.py"
SPEC = importlib.util.spec_from_file_location("serveur_local", CHEMIN)
serveur_local = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(serveur_local)


def test_chaque_reponse_exige_la_revalidation():
    """Un module ou une unité gardés en cache après une mise à jour avaient fait échouer le dessin (position NaN)."""
    gestionnaire = object.__new__(serveur_local.Gestionnaire)
    gestionnaire.request_version = "HTTP/1.1"
    gestionnaire.wfile = BytesIO()
    gestionnaire.end_headers()
    assert b"Cache-Control: no-cache" in gestionnaire.wfile.getvalue()
