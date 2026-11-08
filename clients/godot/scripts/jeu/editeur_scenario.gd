extends Control
## Éditeur de scénario : le joueur pose, déplace, relie et efface sur le sol ; chaque geste part au serveur, qui le traduit en
## modifications par chemin (docs/FORMATS.md § 10.4). Rien n'est calculé ici.

const Selection := preload("res://scripts/jeu/selection.gd")
const Ihm := preload("res://scripts/jeu/ihm.gd")

const RAYON_CLIC_PX := 16.0
const GLISSEMENT_MAX_PX := 6.0
const SEGMENTS_APERCU := 64
const LARGEUR_PALETTE := 310.0
const COULEURS := {
	"cible": Color(0.45, 0.85, 0.45), "avion": Color(0.35, 0.65, 1.0), "radar": Color(0.55, 0.8, 1.0), "batterie": Color(1.0, 0.75, 0.25), "conduite": Color(0.75, 0.55, 1.0),
	"centre": Color(0.75, 0.55, 1.0), "liaison": Color(0.8, 0.8, 0.8), "passage": Color(1.0, 0.35, 0.3), "zone": Color(1.0, 0.85, 0.3),
}
const NON_RELIABLES := ["liaison", "passage", "zone"]
const COULEUR_CHOIX := Color(0.4, 1.0, 0.6)
const COULEUR_LIAISON := Color(0.75, 0.75, 0.8, 0.55)
const COULEUR_ZONE := Color(1.0, 0.85, 0.3, 0.8)
const COULEUR_APERCU := Color(1.0, 0.9, 0.4)
const OUTILS := [["selection", "1 Sélection"], ["liaison", "2 Liaison"], ["plan", "3 Plan de vol"], ["zone", "4 Zone"], ["gomme", "5 Gomme"]]

var _partie: Node = null
var _actif := false
var _elements: Array = []
var _liaisons: Array = []
var _zones: Array = []
var _familles: Array = []
var _scenarios: Array = []
var _outil := "selection"
var _depot: Variant = null
var _famille_depot: Dictionary = {}
var _choisis: Array[String] = []
var _source_liaison := ""
var _points_zone: Array[Vector2] = []
var _appui := Vector2.INF
var _appui_sol: Variant = null
var _deplacement := false
var _cadre := false
var _barre := PanelContainer.new()
var _palette := PanelContainer.new()
var _liste := VBoxContainer.new()
var _choix_famille := OptionButton.new()
var _choix_scenario := OptionButton.new()
var _nom := LineEdit.new()
var _boutons: Dictionary = {}


## Relier l'éditeur à la partie et construire ses panneaux.
func brancher(partie: Node) -> void:
	_partie = partie
	# Déjà dans l'arbre : set_anchors_preset garderait la position actuelle, et l'éditeur resterait de taille nulle.
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_construire_barre()
	_construire_palette()
	visible = false


static func _bouton(texte: String, action: Callable) -> Button:
	var bouton := Button.new()
	bouton.text = texte
	# Sans cela, le bouton garderait le focus et Espace ou Entrée le rappuieraient.
	bouton.focus_mode = Control.FOCUS_NONE
	bouton.pressed.connect(action)
	return bouton


func _construire_barre() -> void:
	_barre.add_theme_stylebox_override("panel", Ihm.style_panneau())
	_barre.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_barre.position = Vector2(10.0, 50.0)
	var rangee := HBoxContainer.new()
	for outil: Array in OUTILS:
		_boutons[outil[0]] = _bouton(outil[1], _choisir_outil.bind(outil[0]))
		_boutons[outil[0]].toggle_mode = true
		rangee.add_child(_boutons[outil[0]])
	rangee.add_child(_bouton("Annuler", func() -> void: _partie.envoyer({"type": "annuler"})))
	rangee.add_child(_bouton("Rétablir", func() -> void: _partie.envoyer({"type": "retablir"})))
	_choix_scenario.focus_mode = Control.FOCUS_NONE
	_choix_scenario.item_selected.connect(_charger_scenario)
	rangee.add_child(_choix_scenario)
	_nom.placeholder_text = "nom"
	_nom.custom_minimum_size = Vector2(120.0, 0.0)
	_nom.text_submitted.connect(func(_texte: String) -> void: _enregistrer())
	rangee.add_child(_nom)
	rangee.add_child(_bouton("Enregistrer", _enregistrer))
	_barre.add_child(rangee)
	add_child(_barre)
	_choisir_outil("selection")


func _construire_palette() -> void:
	_palette.add_theme_stylebox_override("panel", Ihm.style_panneau())
	_palette.set_anchors_preset(Control.PRESET_RIGHT_WIDE)
	_palette.offset_left = -LARGEUR_PALETTE
	_palette.offset_top = 50.0
	_palette.offset_bottom = -10.0
	_palette.offset_right = -10.0
	var colonne := VBoxContainer.new()
	_choix_famille.focus_mode = Control.FOCUS_NONE
	_choix_famille.item_selected.connect(_remplir_famille)
	colonne.add_child(_choix_famille)
	var defilement := ScrollContainer.new()
	defilement.size_flags_vertical = Control.SIZE_EXPAND_FILL
	defilement.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_liste.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	defilement.add_child(_liste)
	colonne.add_child(defilement)
	_palette.add_child(colonne)
	add_child(_palette)


## Montrer ou cacher l'éditeur.
func activer(actif: bool) -> void:
	_actif = actif
	visible = actif
	_annuler_geste()
	_choisis.clear()
	if actif:
		_choisir_outil("selection")


func poser_palette(familles: Array) -> void:
	_familles = familles
	_choix_famille.clear()
	for famille: Dictionary in familles:
		_choix_famille.add_item(famille["libelle"])
	if not familles.is_empty():
		_remplir_famille(0)


func poser_scenarios(liste: Array) -> void:
	_scenarios = liste
	_choix_scenario.clear()
	_choix_scenario.add_item("Charger un scénario…")
	for scenario: Dictionary in liste:
		_choix_scenario.add_item(scenario["nom"])


func poser_elements(message: Dictionary) -> void:
	_elements = message["liste"]
	_liaisons = message["liaisons"]
	_zones = message["zones"]
	var existantes: Array[String] = []
	for element: Dictionary in _elements:
		existantes.append(element["cle"])
	_choisis = _choisis.filter(func(cle: String) -> bool: return existantes.has(cle))


func _remplir_famille(rang: int) -> void:
	for ancien in _liste.get_children():
		ancien.queue_free()
	var famille: Dictionary = _familles[rang]
	var aide := Label.new()
	aide.text = famille["aide"]
	aide.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	aide.custom_minimum_size = Vector2(LARGEUR_PALETTE - 50.0, 0.0)
	aide.add_theme_font_size_override("font_size", 12)
	_liste.add_child(aide)
	for element: Dictionary in famille["elements"]:
		var bouton := _bouton(element["nom"], _armer.bind(element, famille))
		bouton.alignment = HORIZONTAL_ALIGNMENT_LEFT
		bouton.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		bouton.icon = _partie.ihm().texture_icone(element["icone"], 1.0)
		bouton.expand_icon = true
		bouton.custom_minimum_size = Vector2(0.0, 40.0)
		bouton.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		bouton.tooltip_text = element["nom"]
		_liste.add_child(bouton)


func _armer(element: Dictionary, famille: Dictionary) -> void:
	_choisir_outil("depot")
	_depot = element
	_famille_depot = famille


func _choisir_outil(outil: String) -> void:
	_annuler_geste()
	_outil = outil
	_depot = null
	for nom: String in _boutons:
		_boutons[nom].set_pressed_no_signal(nom == outil)


func _annuler_geste() -> void:
	_source_liaison = ""
	_points_zone.clear()
	_appui = Vector2.INF
	_deplacement = false
	_cadre = false
	if _partie != null:
		_partie.ihm().poser_cadre(Rect2())


func _charger_scenario(rang: int) -> void:
	if rang > 0:
		_partie.envoyer({"type": "charger_scenario", "id": _scenarios[rang - 1]["id"]})
	_choix_scenario.select(0)


func _enregistrer() -> void:
	_partie.envoyer({"type": "enregistrer_scenario", "nom": _nom.text.strip_edges()})
	_nom.release_focus()


func _editer(geste: Dictionary) -> void:
	geste["type"] = "editer"
	_partie.envoyer(geste)


## Rendre {rang: position à l'écran} des éléments devant la caméra ; `reliables` écarte ce qui n'est pas une unité.
func _a_l_ecran(reliables := false) -> Dictionary:
	var points: Dictionary = {}
	var camera: Camera3D = _partie.camera()
	for rang in _elements.size():
		var element: Dictionary = _elements[rang]
		if reliables and NON_RELIABLES.has(element["type"]):
			continue
		var point: Vector3 = _partie.point_sol(element["e"], element["n"])
		if not camera.is_position_behind(point):
			points[rang] = camera.unproject_position(point)
	return points


func _sous(position_ecran: Vector2, reliables := false) -> Variant:
	var rang := Selection.plus_proche(_a_l_ecran(reliables), position_ecran, RAYON_CLIC_PX)
	return null if rang < 0 else _elements[rang]


## Traiter un geste du joueur sur la scène.
func traiter(evenement: InputEvent) -> void:
	if evenement is InputEventKey and evenement.pressed and not evenement.echo:
		_traiter_touche(evenement)
	elif evenement is InputEventMouseButton:
		if evenement.button_index == MOUSE_BUTTON_RIGHT and evenement.pressed:
			_choisir_outil("selection")
		elif evenement.button_index == MOUSE_BUTTON_LEFT:
			_traiter_gauche(evenement)
	elif evenement is InputEventMouseMotion and _appui != Vector2.INF:
		_suivre_glissement(evenement.position)


func _traiter_touche(evenement: InputEventKey) -> void:
	var commande: bool = evenement.ctrl_pressed or evenement.meta_pressed
	match evenement.keycode:
		KEY_1, KEY_2, KEY_3, KEY_4, KEY_5:
			_choisir_outil(OUTILS[evenement.keycode - KEY_1][0])
		KEY_ESCAPE:
			_choisir_outil("selection")
			_choisis.clear()
		KEY_DELETE, KEY_BACKSPACE:
			if not _choisis.is_empty():
				_editer({"geste": "supprimer", "cles": _choisis.duplicate()})
				_choisis.clear()
		KEY_ENTER, KEY_KP_ENTER:
			_fermer_zone()
		KEY_Z:
			if commande:
				_partie.envoyer({"type": "retablir" if evenement.shift_pressed else "annuler"})
		KEY_Y:
			if commande:
				_partie.envoyer({"type": "retablir"})


func _traiter_gauche(evenement: InputEventMouseButton) -> void:
	if evenement.pressed:
		_appui = evenement.position
		_appui_sol = _partie.vise(evenement.position)
		if _outil == "selection":
			_debuter_selection(evenement)
		if _outil == "zone" and evenement.double_click:
			_fermer_zone()
			_appui = Vector2.INF
	elif _appui != Vector2.INF:
		_conclure(evenement.position, evenement.shift_pressed)
		_appui = Vector2.INF
		_deplacement = false
		_cadre = false
		_partie.ihm().poser_cadre(Rect2())


func _debuter_selection(evenement: InputEventMouseButton) -> void:
	var element: Variant = _sous(evenement.position)
	if element == null:
		return
	if not _choisis.has(element["cle"]):
		if not evenement.shift_pressed:
			_choisis.clear()
		_choisis.append(element["cle"])


func _suivre_glissement(position_souris: Vector2) -> void:
	if _outil != "selection" or _appui.distance_to(position_souris) <= GLISSEMENT_MAX_PX:
		return
	if _deplacement or _sous(_appui) != null:
		_deplacement = true
	else:
		_cadre = true
		_partie.ihm().poser_cadre(Rect2(_appui, position_souris - _appui))


func _conclure(fin: Vector2, ajout: bool) -> void:
	var sol: Variant = _partie.vise(fin)
	match _outil:
		"selection":
			_conclure_selection(fin, sol, ajout)
		"liaison":
			_conclure_liaison(fin)
		"gomme":
			var element: Variant = _sous(fin)
			if element != null:
				_editer({"geste": "supprimer", "cles": [element["cle"]]})
		"depot":
			if sol != null:
				_deposer(fin, sol)
		"plan":
			if sol != null:
				_editer({"geste": "passage", "e": sol.x, "n": sol.y})
		"zone":
			if sol != null:
				_points_zone.append(sol)


func _conclure_selection(fin: Vector2, sol: Variant, ajout: bool) -> void:
	if _deplacement and sol != null and _appui_sol != null and not _choisis.is_empty():
		_editer({"geste": "deplacer", "cles": _choisis.duplicate(), "de": {"e": _appui_sol.x, "n": _appui_sol.y}, "vers": {"e": sol.x, "n": sol.y}})
	elif _cadre:
		_selectionner_cadre(Rect2(_appui, fin - _appui), ajout)
	elif _sous(fin) == null and not ajout:
		_choisis.clear()


func _selectionner_cadre(cadre: Rect2, ajout: bool) -> void:
	if not ajout:
		_choisis.clear()
	for rang in Selection.dans_cadre(_a_l_ecran(), cadre):
		var cle: String = _elements[rang]["cle"]
		if not _choisis.has(cle):
			_choisis.append(cle)


func _conclure_liaison(fin: Vector2) -> void:
	var element: Variant = _sous(fin, true)
	if element == null:
		return
	if _source_liaison == "":
		_source_liaison = element["cle"]
	elif _source_liaison != element["cle"]:
		_editer({"geste": "relier", "de": _source_liaison, "vers": element["cle"]})
		_source_liaison = ""


func _deposer(fin: Vector2, sol: Vector2) -> void:
	var geste := {"geste": "deposer", "id": _depot["id"], "e": sol.x, "n": sol.y}
	if _famille_depot["cible"] == "unite":
		var element: Variant = _sous(fin, true)
		if element == null:
			_partie.ihm().annoncer("À déposer sur une unité")
			return
		geste["sous"] = element["cle"]
	_editer(geste)


func _fermer_zone() -> void:
	if _outil != "zone" or _points_zone.size() < 3:
		return
	var points := []
	for point in _points_zone:
		points.append({"e": point.x, "n": point.y})
	_editer({"geste": "zone", "points": points})
	_points_zone.clear()


## Avancer d'une image : redessiner les repères de l'édition.
func avancer(_delta: float) -> void:
	queue_redraw()


func _ecran(e: float, n: float) -> Variant:
	var camera: Camera3D = _partie.camera()
	var point: Vector3 = _partie.point_sol(e, n)
	return null if camera.is_position_behind(point) else camera.unproject_position(point)


func _trait(a: Variant, b: Variant, couleur: Color, largeur := 1.0) -> void:
	if a != null and b != null:
		draw_line(a, b, couleur, largeur, true)


func _draw() -> void:
	if not _actif:
		return
	for liaison: Dictionary in _liaisons:
		_trait(_ecran(liaison["de"]["e"], liaison["de"]["n"]), _ecran(liaison["vers"]["e"], liaison["vers"]["n"]), COULEUR_LIAISON)
	for zone: Array in _zones:
		_tracer_contour(zone)
	_tracer_plan()
	_tracer_elements()
	_tracer_geste_en_cours()


func _tracer_contour(zone: Array) -> void:
	for k in zone.size():
		var a: Dictionary = zone[k]
		var b: Dictionary = zone[(k + 1) % zone.size()]
		_trait(_ecran(a["e"], a["n"]), _ecran(b["e"], b["n"]), COULEUR_ZONE, 2.0)


func _tracer_plan() -> void:
	var precedent: Variant = null
	for element: Dictionary in _elements:
		if element["type"] != "passage":
			continue
		var point: Variant = _ecran(element["e"], element["n"])
		_trait(precedent, point, COULEURS["passage"])
		precedent = point


func _tracer_elements() -> void:
	for element: Dictionary in _elements:
		var point: Variant = _ecran(element["e"], element["n"])
		if point == null:
			continue
		var type: String = element["type"]
		draw_circle(point, 5.0, COULEURS.get(type, Color.WHITE))
		if _choisis.has(element["cle"]) or _source_liaison == element["cle"]:
			draw_arc(point, 11.0, 0.0, TAU, 24, COULEUR_CHOIX, 2.0, true)


func _tracer_geste_en_cours() -> void:
	var souris := get_viewport().get_mouse_position()
	var sol: Variant = _partie.vise(souris)
	if _outil == "liaison" and _source_liaison != "":
		for element: Dictionary in _elements:
			if element["cle"] == _source_liaison:
				_trait(_ecran(element["e"], element["n"]), souris, COULEUR_CHOIX, 2.0)
	for k in range(1, _points_zone.size()):
		_trait(_ecran(_points_zone[k - 1].x, _points_zone[k - 1].y), _ecran(_points_zone[k].x, _points_zone[k].y), COULEUR_ZONE, 2.0)
	if not _points_zone.is_empty():
		_trait(_ecran(_points_zone[-1].x, _points_zone[-1].y), souris, COULEUR_ZONE)
	if _deplacement:
		_trait(_appui, souris, COULEUR_CHOIX, 2.0)
	if _outil == "depot" and _depot != null and sol != null:
		_tracer_apercu(sol)


## Tracer, sous le curseur, la portée de l'unité à déposer.
func _tracer_apercu(sol: Vector2) -> void:
	draw_circle(_ecran(sol.x, sol.y), 4.0, COULEUR_APERCU)
	var rayon: Variant = _depot["rayon_m"]
	if rayon == null:
		return
	var precedent: Variant = _ecran(sol.x + rayon, sol.y)
	for i in range(1, SEGMENTS_APERCU + 1):
		var angle := TAU * i / SEGMENTS_APERCU
		var point: Variant = _ecran(sol.x + cos(angle) * rayon, sol.y + sin(angle) * rayon)
		_trait(precedent, point, COULEUR_APERCU)
		precedent = point
