extends SceneTree
## Vérification sans écran de la liaison en direct : joue une partie contre src/direct.js, donne un ordre, écrit ce que le
## client a reçu. outils/verifier_client.js le compare ensuite à la simulation du scénario joué.
##
##   godot --headless --path clients/godot --script res://scripts/verifier_direct.gd -- --port 8767 --sortie <dump.json>

const Rejeu := preload("res://scripts/rejeu.gd")
const Liaison := preload("res://scripts/liaison.gd")

const VITESSE := 60.0
const INSTANT_ORDRE_S := 30.0
const DUREE_MAX_S := 120.0

var _liaison := Liaison.new()
var _rejeu := Rejeu.new()
var _sortie := ""
var _lance := false
var _ordre_donne := false
var _ecoule := 0.0
var _max_lecture_ms := 0.0


func _initialize() -> void:
	var arguments := OS.get_cmdline_user_args()
	var options := {"port": "8767"}
	for rang in range(0, arguments.size() - 1, 2):
		options[arguments[rang].trim_prefix("--")] = arguments[rang + 1]
	_sortie = options["sortie"]
	_liaison.ouvrir("ws://127.0.0.1:%s" % options["port"])


func _process(delta: float) -> bool:
	_ecoule += delta
	if _ecoule > DUREE_MAX_S:
		printerr("partie non terminée après %d s" % int(DUREE_MAX_S))
		quit(1)
		return true
	var debut := Time.get_ticks_usec()
	for message in _liaison.recevoir(delta):
		_traiter(message)
	_max_lecture_ms = maxf(_max_lecture_ms, (Time.get_ticks_usec() - debut) / 1000.0)
	if _lance and not _ordre_donne and not _rejeu.instants.is_empty() and _rejeu.instants[-1] >= INSTANT_ORDRE_S:
		_ordre_donne = _liaison.envoyer({"type": "ordre", "avions": [0, 1, 2, 3], "e": 25_000.0, "n": -40_000.0})
	return false


func _traiter(message: Dictionary) -> void:
	match message["genre"]:
		"entete":
			_rejeu.lire_entete(message)
		"etat":
			if not _lance:
				_lance = true
				_liaison.envoyer({"type": "vitesse", "valeur": VITESSE})
				_liaison.envoyer({"type": "reprendre"})
		"erreur":
			printerr("refus du serveur : %s" % message["message"])
			quit(1)
		"archive":
			_conclure(message)
		_:
			_rejeu.ajouter(message)


func _conclure(archive: Dictionary) -> void:
	var recalcule := _rejeu.bilan_recalcule()
	var sortie := FileAccess.open(_sortie, FileAccess.WRITE)
	sortie.store_string(JSON.stringify({"empreinte": archive["empreinte"], "bilan_recalcule": recalcule, "bilan_fichier": _rejeu.bilan, "images": _rejeu.images_de_controle()}))
	sortie.close()
	print("%d images reçues, lecture maximale %.1f ms par image de jeu ; scénario joué : %s" % [_rejeu.instants.size(), _max_lecture_ms, archive["chemin"]])
	quit(0)
