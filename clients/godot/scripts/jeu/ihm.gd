extends CanvasLayer
## Interface à l'écran de la partie en direct : barre d'état, mini-carte, panneau de sélection, cadre de sélection, fin de raid.

const MiniCarte := preload("res://scripts/jeu/mini_carte.gd")

const COULEUR_PANNEAU := Color(0.05, 0.09, 0.12, 0.88)
const COULEUR_BORD := Color(0.3, 0.55, 0.65)
const COULEUR_CADRE := Color(0.4, 1.0, 0.6)
const COTE_ICONE := 96
const ECHELLE_PANNEAU := 4.0
const AIDE := "Clic gauche ou cadre : sélectionner   Maj : ajouter\nDouble-clic : tout le type à l'écran   Échap : désélectionner   Ctrl+A : tous\nClic droit : ordre   Ctrl+1 à 9 : mémoriser   1 à 9 : rappeler (deux fois : centrer)\nWASD, flèches, bord d'écran : défiler   molette : zoom   bouton du milieu : pivoter\nF1 à F4 : caméras   F5 : éditer le scénario   F6 : éditer le relief\nEspace : lancer, pause   + et - : vitesse   N : nouvelle partie\nC : couvertures   B : brouillard   M : son   H : cette aide"


class Cadre extends Control:
	var zone := Rect2()

	func _draw() -> void:
		if zone.size != Vector2.ZERO:
			draw_rect(zone.abs(), Color(0.4, 1.0, 0.6, 0.12))
			draw_rect(zone.abs(), Color(0.4, 1.0, 0.6), false, 1.0)


var mini_carte := MiniCarte.new()
var _haut := Label.new()
var _alerte := Label.new()
var _panneau := PanelContainer.new()
var _icone := TextureRect.new()
var _nom := Label.new()
var _detail := Label.new()
var _aide := Label.new()
var _fin := PanelContainer.new()
var _fin_texte := Label.new()
var _cadre := Cadre.new()
var racine := Control.new()
var _icones: Dictionary = {}
var _racine_depot := ""
var _attente_alerte := 0.0


func _ready() -> void:
	_racine_depot = ProjectSettings.globalize_path("res://").path_join("../..").simplify_path()
	racine.set_anchors_preset(Control.PRESET_FULL_RECT)
	racine.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(racine)
	_cadre.set_anchors_preset(Control.PRESET_FULL_RECT)
	_cadre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	racine.add_child(_cadre)
	racine.add_child(_barre_haute())
	racine.add_child(_cartouche_carte())
	racine.add_child(_panneau_selection())
	racine.add_child(_bloc_aide())
	racine.add_child(_bloc_fin())
	_alerte.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_alerte.position = Vector2(-300.0, 108.0)
	_alerte.custom_minimum_size = Vector2(600.0, 0.0)
	_alerte.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_alerte.add_theme_font_size_override("font_size", 20)
	_alerte.add_theme_color_override("font_color", Color(1.0, 0.75, 0.3))
	_alerte.add_theme_color_override("font_outline_color", Color.BLACK)
	_alerte.add_theme_constant_override("outline_size", 5)
	_alerte.mouse_filter = Control.MOUSE_FILTER_IGNORE
	racine.add_child(_alerte)


## Rendre le fond commun des panneaux.
static func style_panneau() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = COULEUR_PANNEAU
	style.border_color = COULEUR_BORD
	style.set_border_width_all(1)
	style.set_content_margin_all(10.0)
	return style


func _barre_haute() -> Control:
	var barre := PanelContainer.new()
	barre.add_theme_stylebox_override("panel", style_panneau())
	barre.set_anchors_preset(Control.PRESET_TOP_WIDE)
	barre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_haut.mouse_filter = Control.MOUSE_FILTER_IGNORE
	barre.add_child(_haut)
	return barre


func _cartouche_carte() -> Control:
	mini_carte.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	mini_carte.position = Vector2(10.0, -260.0)
	mini_carte.size = Vector2.ONE * MiniCarte.COTE_PX
	return mini_carte


func _panneau_selection() -> Control:
	_panneau.add_theme_stylebox_override("panel", style_panneau())
	_panneau.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_panneau.offset_left = -260.0
	_panneau.offset_right = 260.0
	_panneau.offset_top = -128.0
	_panneau.offset_bottom = -10.0
	# Plusieurs types sélectionnés allongent le nom : le panneau grandit vers le haut, pas hors de la fenêtre.
	_panneau.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_panneau.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var rangee := HBoxContainer.new()
	rangee.add_theme_constant_override("separation", 12)
	rangee.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_icone.custom_minimum_size = Vector2.ONE * COTE_ICONE
	_icone.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_icone.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_icone.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rangee.add_child(_icone)
	var colonne := VBoxContainer.new()
	colonne.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_nom.add_theme_color_override("font_color", Color(0.7, 0.95, 1.0))
	_nom.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_nom.custom_minimum_size = Vector2(390.0, 0.0)
	colonne.add_child(_nom)
	colonne.add_child(_detail)
	rangee.add_child(colonne)
	_panneau.add_child(rangee)
	_panneau.visible = false
	return _panneau


func _bloc_aide() -> Control:
	_aide.text = AIDE
	_aide.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_aide.position = Vector2(-640.0, 52.0)
	_aide.add_theme_color_override("font_outline_color", Color.BLACK)
	_aide.add_theme_constant_override("outline_size", 4)
	_aide.add_theme_font_size_override("font_size", 13)
	_aide.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_aide.visible = false
	return _aide


func _bloc_fin() -> Control:
	_fin.add_theme_stylebox_override("panel", style_panneau())
	_fin.set_anchors_preset(Control.PRESET_CENTER)
	_fin.position = Vector2(-220.0, -130.0)
	_fin.custom_minimum_size = Vector2(440.0, 0.0)
	_fin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fin_texte.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_fin_texte.add_theme_font_size_override("font_size", 18)
	_fin_texte.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fin.add_child(_fin_texte)
	_fin.visible = false
	return _fin


## Écrire la barre d'état.
func ecrire_haut(texte: String) -> void:
	_haut.text = texte


## Afficher `texte` quelques secondes au-dessus de la scène.
func annoncer(texte: String) -> void:
	_alerte.text = texte
	_attente_alerte = 4.0


## Faire vieillir l'annonce de `delta` s.
func vieillir(delta: float) -> void:
	_attente_alerte -= delta
	_alerte.visible = _attente_alerte > 0.0
	mini_carte.vieillir(delta)


## Afficher le cadre de sélection `zone` (taille nulle : aucun).
func poser_cadre(zone: Rect2) -> void:
	_cadre.zone = zone
	_cadre.queue_redraw()


## Montrer le panneau de sélection ; `icone` : champ `icone` du catalogue, ou null. Sans `nom`, le panneau disparaît.
func montrer_selection(nom: String, detail: String, icone: Variant) -> void:
	_panneau.visible = nom != ""
	_nom.text = nom
	_detail.text = detail
	_icone.texture = texture_icone(icone, ECHELLE_PANNEAU)


## Rendre la texture de l'icône `icone` à l'`echelle` donnée (1 : 64 px), lue une fois ; null si elle manque ou est illisible.
func texture_icone(icone: Variant, echelle: float) -> Texture2D:
	if icone == null:
		return null
	var cle := "%s@%.1f" % [icone, echelle]
	if not _icones.has(cle):
		_icones[cle] = _lire_icone(icone, echelle)
	return _icones[cle]


# Même règle que chemin_icone de src/moteur/catalogue.js.
func _lire_icone(icone: String, echelle: float) -> Texture2D:
	var relatif := "prive/icones/%s.svg" % icone.trim_prefix("prive/") if icone.begins_with("prive/") else "icones/%s.svg" % icone
	var chemin := _racine_depot.path_join(relatif)
	if not FileAccess.file_exists(chemin):
		return null
	var svg := FileAccess.get_file_as_string(chemin)
	var image := Image.new()
	if image.load_svg_from_string(svg, echelle) != OK:
		return null
	return ImageTexture.create_from_image(image)


## Basculer l'aide.
func basculer_aide() -> void:
	_aide.visible = not _aide.visible


## Montrer le texte de fin de raid ; une chaîne vide le retire.
func montrer_fin(texte: String) -> void:
	_fin.visible = texte != ""
	_fin_texte.text = texte
