extends Control
## Éditeur de relief : un pinceau retouche la grille d'altitudes, tenue et calculée par le serveur (docs/FORMATS.md § 10.5).

const Ihm := preload("res://scripts/jeu/ihm.gd")

const OUTILS := [["elever", "1 Élever"], ["abaisser", "2 Abaisser"], ["aplanir", "3 Aplanir"], ["lisser", "4 Lisser"]]
const PERIODE_PINCEAU_S := 0.05
const RAYON_DEFAUT_M := 8_000.0
const RAYON_MIN_M := 500.0
const RAYON_MAX_M := 60_000.0
const FORCE_DEFAUT_M := 12.0
const FORCE_MIN_M := 1.0
const FORCE_MAX_M := 80.0
const FACTEUR_RAYON := 1.25

var _partie: Node = null
var _actif := false
var _outil := "elever"
var _rayon := RAYON_DEFAUT_M
var _force := FORCE_DEFAUT_M
var _peint := false
var _attente := 0.0
var _terrains: Array = []
var _barre := PanelContainer.new()
var _choix := OptionButton.new()
var _nom := LineEdit.new()
var _curseur_rayon := HSlider.new()
var _curseur_force := HSlider.new()
var _texte_reglages := Label.new()
var _boutons: Dictionary = {}


## Relier l'éditeur à la partie et construire sa barre.
func brancher(partie: Node) -> void:
	_partie = partie
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_barre.add_theme_stylebox_override("panel", Ihm.style_panneau())
	_barre.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_barre.position = Vector2(10.0, 50.0)
	var rangee := HBoxContainer.new()
	for outil: Array in OUTILS:
		_boutons[outil[0]] = _bouton(outil[1], _choisir_outil.bind(outil[0]))
		_boutons[outil[0]].toggle_mode = true
		rangee.add_child(_boutons[outil[0]])
	_preparer_curseur(_curseur_rayon, RAYON_MIN_M, RAYON_MAX_M, _rayon, func(v: float) -> void: _rayon = v)
	_preparer_curseur(_curseur_force, FORCE_MIN_M, FORCE_MAX_M, _force, func(v: float) -> void: _force = v)
	rangee.add_child(_curseur_rayon)
	rangee.add_child(_curseur_force)
	rangee.add_child(_texte_reglages)
	rangee.add_child(_bouton("Annuler", func() -> void: _partie.envoyer({"type": "terrain_annuler"})))
	_choix.focus_mode = Control.FOCUS_NONE
	# Le nom complet d'un terrain tiendrait la moitié de la barre.
	_choix.fit_to_longest_item = false
	_choix.clip_text = true
	_choix.custom_minimum_size = Vector2(180.0, 0.0)
	_choix.item_selected.connect(_ouvrir_choix)
	rangee.add_child(_choix)
	_nom.placeholder_text = "nom du relief"
	_nom.custom_minimum_size = Vector2(130.0, 0.0)
	_nom.text_submitted.connect(func(_texte: String) -> void: _enregistrer())
	rangee.add_child(_nom)
	rangee.add_child(_bouton("Enregistrer", _enregistrer))
	_barre.add_child(rangee)
	add_child(_barre)
	_choisir_outil("elever")
	visible = false


static func _bouton(texte: String, action: Callable) -> Button:
	var bouton := Button.new()
	bouton.text = texte
	bouton.focus_mode = Control.FOCUS_NONE
	bouton.pressed.connect(action)
	return bouton


static func _preparer_curseur(curseur: HSlider, mini_v: float, maxi_v: float, valeur: float, action: Callable) -> void:
	curseur.min_value = mini_v
	curseur.max_value = maxi_v
	curseur.value = valeur
	curseur.custom_minimum_size = Vector2(110.0, 0.0)
	curseur.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	curseur.focus_mode = Control.FOCUS_NONE
	curseur.value_changed.connect(action)


func poser_palette(familles: Array) -> void:
	_choix.clear()
	_choix.add_item("Ouvrir un relief…")
	_choix.add_item("Nouveau relief plat")
	for famille: Dictionary in familles:
		if famille["id"] == "terrains":
			_terrains = famille["elements"]
			for terrain: Dictionary in _terrains:
				_choix.add_item(terrain["nom"])


func _ouvrir_choix(rang: int) -> void:
	if rang == 1:
		_partie.envoyer({"type": "terrain_nouveau"})
	elif rang > 1:
		_partie.envoyer({"type": "terrain_ouvrir", "id": _terrains[rang - 2]["id"]})
	_choix.select(0)


## Montrer ou cacher l'éditeur ; à l'entrée, ouvrir le relief du scénario (`terrain` : son enregistrement), ou un relief plat.
func activer(actif: bool, terrain: Variant) -> void:
	if actif == _actif:
		return
	_actif = actif
	visible = actif
	_peint = false
	_partie.sol().poser_pinceau(0.0, 0.0, -1.0)
	if not actif:
		return
	var id: Variant = null if terrain == null else terrain["id"]
	if id == null:
		_partie.envoyer({"type": "terrain_nouveau"})
	else:
		_partie.envoyer({"type": "terrain_ouvrir", "id": id})


func _choisir_outil(outil: String) -> void:
	_outil = outil
	for nom: String in _boutons:
		_boutons[nom].set_pressed_no_signal(nom == outil)


func _enregistrer() -> void:
	_partie.envoyer({"type": "terrain_enregistrer", "nom": _nom.text.strip_edges()})
	_nom.release_focus()


## Traiter un geste du joueur sur la scène.
func traiter(evenement: InputEvent) -> void:
	if evenement is InputEventMouseButton and evenement.button_index == MOUSE_BUTTON_LEFT:
		if evenement.pressed:
			_commencer_trait(evenement.position)
		else:
			_peint = false
	elif evenement is InputEventKey and evenement.pressed and not evenement.echo:
		_traiter_touche(evenement)


func _traiter_touche(evenement: InputEventKey) -> void:
	var commande: bool = evenement.ctrl_pressed or evenement.meta_pressed
	match evenement.keycode:
		KEY_1, KEY_2, KEY_3, KEY_4:
			_choisir_outil(OUTILS[evenement.keycode - KEY_1][0])
		KEY_BRACKETLEFT:
			_curseur_rayon.value = _rayon / FACTEUR_RAYON
		KEY_BRACKETRIGHT:
			_curseur_rayon.value = _rayon * FACTEUR_RAYON
		KEY_Z:
			if commande:
				_partie.envoyer({"type": "terrain_retablir" if evenement.shift_pressed else "terrain_annuler"})
		KEY_Y:
			if commande:
				_partie.envoyer({"type": "terrain_retablir"})


func _commencer_trait(ecran: Vector2) -> void:
	var sol: Variant = _partie.vise(ecran)
	if sol == null:
		return
	_partie.envoyer({"type": "terrain_debut", "e": sol.x, "n": sol.y})
	_peint = true
	_attente = 0.0


## Avancer d'une image : suivre la souris, et peindre tant que le bouton est tenu.
func avancer(delta: float) -> void:
	_texte_reglages.text = "rayon %.1f km · force %.0f m" % [_rayon / 1000.0, _force]
	var sol: Variant = _partie.vise(get_viewport().get_mouse_position())
	if sol == null:
		_partie.sol().poser_pinceau(0.0, 0.0, -1.0)
		return
	_partie.sol().poser_pinceau(sol.x, sol.y, _rayon)
	_attente -= delta
	if _peint and _attente <= 0.0:
		_attente = PERIODE_PINCEAU_S
		_partie.envoyer({"type": "terrain_pinceau", "outil": _outil, "rayon_m": _rayon, "force_m": _force, "e": sol.x, "n": sol.y})
