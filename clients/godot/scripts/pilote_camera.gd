extends RefCounted
## Trois caméras : libre (WASD selon les touches physiques, bouton droit, molette), suivi d'une entité, vue d'un radar.

enum Mode { LIBRE, SUIVI, RADAR }

const NOMS := ["libre", "suivi", "radar"]
const VITESSE_RELATIVE := 0.8
const VITESSE_MINIMALE := 500.0
const SENSIBILITE := 0.004
const FACTEUR_MOLETTE := 1.15
const RECUL_SUIVI := 4_000.0
const HAUTEUR_SUIVI := 1_500.0
const HAUTEUR_RADAR := 40.0
const PLANCHER_LIBRE := 50.0

var mode := Mode.LIBRE
var _lacet := 0.0
var _tangage := -0.6
var _vitesse := 1.0


## Traiter la souris : bouton droit pour regarder, molette pour la vitesse de la caméra libre.
func traiter_souris(evenement: InputEvent) -> void:
	if evenement is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		_lacet -= evenement.relative.x * SENSIBILITE
		_tangage = clampf(_tangage - evenement.relative.y * SENSIBILITE, -1.5, 1.5)
	elif evenement is InputEventMouseButton and evenement.pressed:
		if evenement.button_index == MOUSE_BUTTON_WHEEL_UP:
			_vitesse *= FACTEUR_MOLETTE
		elif evenement.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_vitesse /= FACTEUR_MOLETTE


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
