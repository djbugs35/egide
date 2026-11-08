extends Control
## Mini-carte de la partie en direct : le théâtre vu de dessus. Clic gauche : y centrer la caméra ; clic droit : y envoyer la sélection.

signal centrage_demande(e: float, n: float)
signal ordre_demande(e: float, n: float)

const COTE_PX := 250.0
const MARGE_THEATRE := 1.1
const COULEUR_FOND := Color(0.03, 0.05, 0.08)
const COULEUR_VUE := Color(0.16, 0.26, 0.3)
const COULEUR_SITE := Color(0.45, 0.85, 0.45)
const COULEUR_RADAR := Color(0.55, 0.8, 1.0)
const COULEUR_AMI := Color(0.35, 0.65, 1.0)
const COULEUR_ENNEMI := Color(1.0, 0.25, 0.2)
const COULEUR_SELECTION := Color(0.4, 1.0, 0.6)
const COULEUR_CHAMP := Color(1.0, 1.0, 1.0, 0.7)
const DUREE_ALERTE_S := 2.5

var _demi := 1.0
var _centre := Vector2.ZERO
var _fixes: Array[Dictionary] = []
var _zones := PackedVector3Array()
var _drones := PackedVector2Array()
var _amis := PackedVector2Array()
var _choisis := PackedVector2Array()
var _champ := PackedVector2Array()
var _alertes: Array[Dictionary] = []


func _ready() -> void:
	custom_minimum_size = Vector2.ONE * COTE_PX
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_STOP


## Cadrer la carte sur les points (e, n) de `points`, en carré, et retenir les objets fixes `fixes` [{e, n, couleur}].
func cadrer(points: Array[Vector2], fixes: Array[Dictionary]) -> void:
	var boite := Rect2(points[0], Vector2.ZERO)
	for point in points:
		boite = boite.expand(point)
	_centre = boite.get_center()
	_demi = maxf(maxf(boite.size.x, boite.size.y) / 2.0 * MARGE_THEATRE, 1.0)
	_fixes = fixes


## Rendre la position sur la carte (px) du point (e, n).
func vers_carte(e: float, n: float) -> Vector2:
	return Vector2((e - _centre.x) / _demi + 1.0, 1.0 - (n - _centre.y) / _demi) * COTE_PX / 2.0


## Rendre le point (e, n) de la position `carte` (px).
func depuis_carte(carte: Vector2) -> Vector2:
	var relatif := carte / (COTE_PX / 2.0)
	return Vector2((relatif.x - 1.0) * _demi + _centre.x, (1.0 - relatif.y) * _demi + _centre.y)


## Poser ce qu'il faut dessiner à la prochaine image : points (e, n) ; `champ` : le contour au sol de la vue.
func poser(zones: PackedVector3Array, drones: PackedVector2Array, amis: PackedVector2Array, choisis: PackedVector2Array, champ: PackedVector2Array) -> void:
	_zones = zones
	_drones = drones
	_amis = amis
	_choisis = choisis
	_champ = champ
	queue_redraw()


## Signaler une alerte au point (e, n).
func alerter(e: float, n: float) -> void:
	_alertes.append({"point": Vector2(e, n), "age": 0.0})


## Faire vieillir les alertes de `delta` s.
func vieillir(delta: float) -> void:
	for alerte in _alertes:
		alerte["age"] += delta
	_alertes = _alertes.filter(func(a: Dictionary) -> bool: return a["age"] < DUREE_ALERTE_S)


func _ici(point: Vector2) -> Vector2:
	return vers_carte(point.x, point.y)


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), COULEUR_FOND)
	var echelle := COTE_PX / 2.0 / _demi
	for zone in _zones:
		draw_circle(vers_carte(zone.x, zone.y), zone.z * echelle, COULEUR_VUE)
	for fixe in _fixes:
		draw_rect(Rect2(vers_carte(fixe["e"], fixe["n"]) - Vector2(2.5, 2.5), Vector2(5.0, 5.0)), fixe["couleur"])
	for point in _drones:
		draw_rect(Rect2(_ici(point) - Vector2.ONE, Vector2(2.0, 2.0)), COULEUR_ENNEMI)
	for point in _amis:
		draw_rect(Rect2(_ici(point) - Vector2(1.5, 1.5), Vector2(3.0, 3.0)), COULEUR_AMI)
	for point in _choisis:
		draw_rect(Rect2(_ici(point) - Vector2(2.5, 2.5), Vector2(5.0, 5.0)), COULEUR_SELECTION, false, 1.0)
	for alerte in _alertes:
		var part: float = alerte["age"] / DUREE_ALERTE_S
		draw_arc(_ici(alerte["point"]), 4.0 + 22.0 * part, 0.0, TAU, 24, Color(1.0, 0.3, 0.2, 1.0 - part), 2.0)
	if _champ.size() == 4:
		for i in 4:
			draw_line(_ici(_champ[i]), _ici(_champ[(i + 1) % 4]), COULEUR_CHAMP, 1.0)
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.35, 0.6, 0.7), false, 2.0)


func _gui_input(evenement: InputEvent) -> void:
	if evenement is InputEventMouseButton and evenement.pressed:
		var point := depuis_carte(evenement.position)
		if evenement.button_index == MOUSE_BUTTON_LEFT:
			centrage_demande.emit(point.x, point.y)
		elif evenement.button_index == MOUSE_BUTTON_RIGHT:
			ordre_demande.emit(point.x, point.y)
	elif evenement is InputEventMouseMotion and evenement.button_mask & MOUSE_BUTTON_MASK_LEFT:
		var point := depuis_carte(evenement.position)
		centrage_demande.emit(point.x, point.y)
