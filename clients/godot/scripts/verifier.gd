extends SceneTree
## Vérification sans écran : recalcule le bilan avec le code du client et écrit ses positions, à comparer au moteur par
## outils/verifier_client.js (critère du jalon 15 : mêmes positions à 1 m près, mêmes instants).
##
##   godot --headless --path clients/godot --script res://scripts/verifier.gd -- --rejeu <fichier> --sortie <dump.json>

const Rejeu := preload("res://scripts/rejeu.gd")

const CLES_BILAN := ["fuites", "fuites_max_cible", "detruits_air", "detruits_sol", "munitions_air_restantes", "munitions_sol_restantes", "duree"]


func _initialize() -> void:
	var arguments := OS.get_cmdline_user_args()
	var options := {}
	for rang in range(0, arguments.size() - 1, 2):
		options[arguments[rang].trim_prefix("--")] = arguments[rang + 1]
	var rejeu := Rejeu.new()
	var erreur := rejeu.charger(options["rejeu"])
	if erreur != "":
		push_error(erreur)
		quit(1)
		return
	var recalcule := rejeu.bilan_recalcule()
	var accord := true
	for cle: String in CLES_BILAN:
		if absf(float(recalcule[cle]) - float(rejeu.bilan[cle])) > 1e-3:
			accord = false
			printerr("bilan différent sur %s : %s contre %s" % [cle, recalcule[cle], rejeu.bilan[cle]])
	var sortie := FileAccess.open(options["sortie"], FileAccess.WRITE)
	sortie.store_string(JSON.stringify({"empreinte": rejeu.entete["empreinte"], "bilan_recalcule": recalcule, "bilan_fichier": rejeu.bilan, "images": rejeu.images_de_controle()}))
	sortie.close()
	print("Bilan recalculé %s ; %s écrit." % ["identique" if accord else "DIFFÉRENT", options["sortie"]])
	quit(0 if accord else 1)
