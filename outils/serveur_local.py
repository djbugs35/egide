"""Sert Égide en local, sans laisser le navigateur garder d'anciens fichiers.

Le serveur standard de Python n'envoie aucune consigne de cache : après une mise à jour, le navigateur mélangeait des
modules récents et des fichiers d'unités anciens, et une clé absente faisait échouer le dessin (position NaN).
Lancé par lancer.command et lancer.bat : python outils/serveur_local.py [port].
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
PORT_DEFAUT = 8766
ADRESSE = "127.0.0.1"


class Gestionnaire(SimpleHTTPRequestHandler):
    """Sert les fichiers en exigeant que le navigateur les revalide à chaque usage."""

    def end_headers(self) -> None:
        """Ajouter la consigne de cache ; un fichier inchangé reste servi par un simple 304."""
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def principal(arguments: list[str]) -> None:
    """Servir le dépôt sur le port donné en premier argument, ou sur le port par défaut."""
    port = int(arguments[0]) if arguments else PORT_DEFAUT
    gestionnaire = partial(Gestionnaire, directory=str(RACINE))
    with ThreadingHTTPServer((ADRESSE, port), gestionnaire) as serveur:
        print(f"Égide : http://{ADRESSE}:{port}")
        serveur.serve_forever()


if __name__ == "__main__":
    principal(sys.argv[1:])
