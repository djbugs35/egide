extends SceneTree
## Vérifie sans écran les règles pures du jeu : sélection, groupes, cadrage de la mini-carte, zones du brouillard.
##
##   godot --headless --path clients/godot --script res://scripts/jeu/verifier_jeu.gd

const Selection := preload("res://scripts/jeu/selection.gd")
const MiniCarte := preload("res://scripts/jeu/mini_carte.gd")
const Brouillard := preload("res://scripts/jeu/brouillard.gd")
const EditeurScenario := preload("res://scripts/jeu/editeur_scenario.gd")

var _echecs := 0


func _verifier(condition: bool, nom: String) -> void:
	if not condition:
		_echecs += 1
		printerr("ÉCHEC : %s" % nom)


func _initialize() -> void:
	_selection()
	_groupes()
	_carte()
	_zones()
	await _palette_visible()
	print("Règles du jeu : %s" % ("toutes vérifiées" if _echecs == 0 else "%d échecs" % _echecs))
	quit(0 if _echecs == 0 else 1)


func _selection() -> void:
	var points := {0: Vector2(10, 10), 1: Vector2(50, 50), 2: Vector2(200, 10)}
	_verifier(Selection.dans_cadre(points, Rect2(0, 0, 60, 60)) == [0, 1], "cadre tracé vers le bas à droite")
	_verifier(Selection.dans_cadre(points, Rect2(60, 60, -60, -60)) == [0, 1], "cadre tracé vers le haut à gauche")
	_verifier(Selection.plus_proche(points, Vector2(48, 48), 18.0) == 1, "clic près d'un vecteur")
	_verifier(Selection.plus_proche(points, Vector2(120, 120), 18.0) == -1, "clic dans le vide")


func _groupes() -> void:
	var s := Selection.new()
	var a: Array[int] = [1, 2]
	s.choisir(a)
	s.memoriser(3)
	var b: Array[int] = [2, 5]
	s.choisir(b, true)
	_verifier(s.ids == [1, 2, 5], "l'ajout ne duplique pas")
	s.vider()
	_verifier(s.rappeler(3) and s.ids == [1, 2], "rappel d'un groupe mémorisé")
	_verifier(not s.rappeler(4) and s.ids == [1, 2], "groupe vide : sélection conservée")
	s.fixe = {"noeud": "radar:0"}
	s.choisir(a)
	_verifier(s.fixe == null, "choisir des vecteurs retire l'objet inspecté")
	s.oublier_groupes()
	_verifier(not s.rappeler(3) and s.ids.is_empty(), "une nouvelle partie oublie les groupes")


func _carte() -> void:
	var carte := MiniCarte.new()
	var points: Array[Vector2] = [Vector2(-100_000, -50_000), Vector2(100_000, 50_000)]
	var fixes: Array[Dictionary] = []
	carte.cadrer(points, fixes)
	var aller := carte.depuis_carte(carte.vers_carte(42_000.0, -13_000.0))
	_verifier(aller.distance_to(Vector2(42_000.0, -13_000.0)) < 1.0, "aller-retour carte")
	_verifier(carte.vers_carte(0.0, 100_000.0).y < carte.vers_carte(0.0, -100_000.0).y, "le nord est en haut")
	_verifier(carte.vers_carte(100_000.0, 0.0).x > carte.vers_carte(-100_000.0, 0.0).x, "l'est est à droite")
	carte.free()


func _zones() -> void:
	var objets := [
		{"detection": 0.0, "lieu": {"e": 1.0, "n": 1.0}}, {"detection": 5_000.0, "lieu": {"e": 2.0, "n": 3.0}}, {"detection": 9_000.0, "lieu": {"e": 4.0, "n": 5.0}},
	]
	var zones := Brouillard.disques(objets)
	_verifier(zones.size() == 2 and zones[0] == Vector3(4.0, 5.0, 9_000.0), "seuls les objets qui détectent, les plus grands d'abord")


## L'éditeur, ajouté à l'arbre avant d'être ancré, restait de taille nulle : sa palette, ancrée à droite, sortait de l'écran.
func _palette_visible() -> void:
	var fenetre := Control.new()
	fenetre.size = Vector2(1600.0, 900.0)
	root.add_child(fenetre)
	# Le défaut ne se montre qu'une fois les tailles propagées, comme dans le jeu.
	await process_frame
	var editeur := EditeurScenario.new()
	fenetre.add_child(editeur)
	editeur.brancher(null)
	await process_frame
	_verifier(editeur.size == fenetre.size, "l'éditeur couvre son parent")
	var palette: Rect2 = editeur._palette.get_global_rect()
	_verifier(palette.position.x > 1200.0 and palette.end.x == 1590.0, "la palette est dans l'écran, à droite")
	fenetre.free()
