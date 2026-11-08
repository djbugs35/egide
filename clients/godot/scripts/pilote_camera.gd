extends RefCounted
## Quatre caméras : libre (WASD selon les touches physiques, bouton droit, molette), suivi d'une entité, vue d'un radar,
## et stratégie (vue plongeante sur un point du sol : défilement au clavier et au bord de l'écran, molette, bouton du milieu).

enum Mode { LIBRE, SUIVI, RADAR, STRATEGIE }

const NOMS := ["libre", "suivi", "radar", "stratégie"]
const VITESSE_RELATIVE := 0.8
const VITESSE_MINIMALE := 500.0
const SENSIBILITE := 0.004
const FACTEUR_MOLETTE := 1.15
const RECUL_SUIVI := 4_000.0
const HAUTEUR_SUIVI := 1_500.0
const HAUTEUR_RADAR := 40.0
const PLANCHER_LIBRE := 50.0
const HAUTEUR_STRATEGIE_MIN := 3_000.0
const HAUTEUR_STRATEGIE_MAX := 700_000.0
const DEFILEMENT_RELATIF := 0.9
const LISSAGE_ZOOM := 10.0
const BORD_DEFILEMENT_PX := 8.0
const INCLINAISON_PROCHE_DEG := 40.0
const INCLINAISON_LOINTAINE_DEG := 15.0

var mode := Mode.LIBRE
var _lacet := 0.0
var _tangage := -0.6
var _vitesse := 1.0
var _pivot := Vector3.ZERO
var _azimut := 0.0
var _hauteur := 260_000.0
var _hauteur_voulue := 260_000.0


## Traiter la souris : bouton droit pour regarder, molette pour la vitesse de la caméra libre.
func traiter_souris(evenement: InputEvent) -> void:
	if mode == Mode.STRATEGIE:
		_traiter_souris_strategie(evenement)
		return
	if evenement is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		_lacet -= evenement.relative.x * SENSIBILITE
		_tangage = clampf(_tangage - evenement.relative.y * SENSIBILITE, -1.5, 1.5)
	elif evenement is InputEventMouseButton and evenement.pressed:
		if evenement.button_index == MOUSE_BUTTON_WHEEL_UP:
			_vitesse *= FACTEUR_MOLETTE
		elif evenement.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_vitesse /= FACTEUR_MOLETTE


func _traiter_souris_strategie(evenement: InputEvent) -> void:
	if evenement is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE):
		_azimut -= evenement.relative.x * SENSIBILITE
	elif evenement is InputEventMouseButton and evenement.pressed:
		if evenement.button_index == MOUSE_BUTTON_WHEEL_UP:
			_hauteur_voulue = maxf(_hauteur_voulue / FACTEUR_MOLETTE, HAUTEUR_STRATEGIE_MIN)
		elif evenement.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_hauteur_voulue = minf(_hauteur_voulue * FACTEUR_MOLETTE, HAUTEUR_STRATEGIE_MAX)


## Centrer la caméra de stratégie sur le point de scène `point`.
func centrer(point: Vector3) -> void:
	_pivot = Vector3(point.x, 0.0, point.z)


## Rendre le déplacement demandé : x vers la droite, y vers l'avant, par le clavier ou la souris au bord de la fenêtre.
func _direction_defilement(viewport: Viewport) -> Vector2:
	var direction := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		direction.y += 1.0
	if Input.is_physical_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		direction.y -= 1.0
	if Input.is_physical_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		direction.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		direction.x += 1.0
	# Une souris hors de la fenêtre ou une fenêtre inactive ne doit pas faire filer la carte.
	var fenetre := viewport.get_visible_rect()
	var souris := viewport.get_mouse_position()
	if viewport.get_window().has_focus() and fenetre.has_point(souris):
		direction.x += float(souris.x >= fenetre.size.x - BORD_DEFILEMENT_PX) - float(souris.x <= BORD_DEFILEMENT_PX)
		direction.y += float(souris.y <= BORD_DEFILEMENT_PX) - float(souris.y >= fenetre.size.y - BORD_DEFILEMENT_PX)
	return direction.limit_length(1.0)


## Placer la caméra de stratégie, plus plongeante de loin que de près pour garder le théâtre entier sous les yeux.
func avancer_strategie(camera: Camera3D, delta: float) -> void:
	_hauteur = lerpf(_hauteur, _hauteur_voulue, minf(1.0, LISSAGE_ZOOM * delta))
	var avant := Vector3.FORWARD.rotated(Vector3.UP, _azimut)
	var droite := Vector3.RIGHT.rotated(Vector3.UP, _azimut)
	var direction := _direction_defilement(camera.get_viewport())
	_pivot += (droite * direction.x + avant * direction.y) * _hauteur * DEFILEMENT_RELATIF * delta
	var part := inverse_lerp(log(HAUTEUR_STRATEGIE_MIN), log(HAUTEUR_STRATEGIE_MAX), log(_hauteur))
	var inclinaison := deg_to_rad(lerpf(INCLINAISON_PROCHE_DEG, INCLINAISON_LOINTAINE_DEG, part))
	camera.position = _pivot + Vector3.UP * _hauteur - avant * _hauteur * tan(inclinaison)
	camera.look_at(_pivot, Vector3.UP)


## Déplacer la caméra libre de `delta` secondes ; sa vitesse suit sa hauteur, pour rester utilisable de près comme de loin.
func avancer_libre(camera: Camera3D, delta: float) -> void:
	camera.basis = Basis.from_euler(Vector3(_tangage, _lacet, 0.0))
	var direction := Vector3.ZERO
	if Input.is_physical_key_pressed(KEY_W):
		direction += Vector3.FORWARD
	if Input.is_physical_key_pressed(KEY_S):
		direction += Vector3.BACK
	if Input.is_physical_key_pressed(KEY_A):
		direction += Vector3.LEFT
	if Input.is_physical_key_pressed(KEY_D):
		direction += Vector3.RIGHT
	var vitesse := maxf(VITESSE_MINIMALE, camera.position.y * VITESSE_RELATIVE) * _vitesse
	camera.position += camera.basis * direction * vitesse * delta
	camera.position.y = maxf(camera.position.y, PLANCHER_LIBRE)


## Placer la caméra derrière et au-dessus de `cible`, de cap `cap_deg`.
func suivre(camera: Camera3D, cible: Vector3, cap_deg: float) -> void:
	var avant := Vector3.FORWARD.rotated(Vector3.UP, deg_to_rad(-cap_deg))
	camera.position = cible - avant * RECUL_SUIVI + Vector3.UP * HAUTEUR_SUIVI
	camera.look_at(cible, Vector3.UP)


## Placer la caméra sur le radar `site`, tournée vers `visee`.
func regarder_depuis_radar(camera: Camera3D, site: Vector3, visee: Vector3) -> void:
	camera.position = site + Vector3.UP * HAUTEUR_RADAR
	if camera.position.distance_to(visee) > 1.0:
		camera.look_at(visee, Vector3.UP)
