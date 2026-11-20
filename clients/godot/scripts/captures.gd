extends SceneTree
## Films de la documentation (README) : rejoue des gestes de joueur sur une partie en direct, sous l'enregistreur
## d'images de Godot, puis outils/captures_godot.sh les assemble en GIF. Même jeu, mêmes règles : seuls les gestes
## viennent de ce script au lieu de la souris.
##
##   godot --path clients/godot --write-movie <dossier>/image.png --fixed-fps 10 --script res://scripts/captures.gd -- \
##         --direct 8767 --film partie|edition --langue en

const Principal := preload("res://principal.tscn")
const ORDRE_N_M := 45_000.0

var _p: Node


func _initialize() -> void:
	_p = Principal.instantiate()
	root.add_child(_p)
	_jouer.call_deferred()


func _option(nom: String, defaut: String) -> String:
	var arguments := OS.get_cmdline_user_args()
	var rang := arguments.find("--" + nom)
	return arguments[rang + 1] if rang >= 0 and rang + 1 < arguments.size() else defaut


func _attendre(images: int) -> void:
	for _k in images:
		await process_frame


func _jouer() -> void:
	while _p.direct == null or not _p.pret:
		await process_frame
	await _attendre(15)
	if _option("film", "partie") == "edition":
		await _edition(_p.direct)
	else:
		await _partie(_p.direct)
	quit()


## Une partie : cadre de sélection, ordre en avant de l'essaim, puis le combat vu de plus près.
func _partie(d: Node) -> void:
	d.envoyer({"type": "vitesse", "valeur": 16})
	d.envoyer({"type": "reprendre"})
	await _attendre(40)
	var taille: Vector2 = root.get_visible_rect().size
	for k in 10:
		d._ihm.poser_cadre(Rect2(taille * 0.15, taille * 0.7 * (k + 1) / 10.0))
		await _attendre(1)
	d._selectionner_tous()
	d._ihm.poser_cadre(Rect2())
	d._ecrire_selection()
	await _attendre(10)
	d._ordonner_au_point(0.0, ORDRE_N_M)
	await _attendre(80)
	d._centrer_sur(0.0, ORDRE_N_M)
	await _attendre(90)


## L'édition : quatre radars posés depuis la palette, puis un relief peint au pinceau.
func _edition(d: Node) -> void:
	d._changer_mode(1)
	await _attendre(20)
	var e: Node = d._editeur
	for famille: Dictionary in e._familles:
		if famille["id"] == "capteurs":
			e._armer(famille["elements"][0], famille)
	for point: Vector2 in [Vector2(-60_000, 70_000), Vector2(70_000, 60_000), Vector2(80_000, -60_000), Vector2(-70_000, -70_000)]:
		e._deposer(Vector2.ZERO, point)
		await _attendre(15)
	await _attendre(20)
	d._changer_mode(2)
	await _attendre(30)
	d.envoyer({"type": "terrain_debut", "e": -80_000.0, "n": 20_000.0})
	for k in 40:
		d.envoyer({"type": "terrain_pinceau", "outil": "elever", "rayon_m": 15_000.0, "force_m": 60.0, "e": -80_000.0 + 4_000.0 * k, "n": 20_000.0 + 1_000.0 * k})
		await _attendre(2)
	await _attendre(30)
