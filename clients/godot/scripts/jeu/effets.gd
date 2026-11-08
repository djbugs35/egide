extends Node3D
## Effets au sol et en vol de la partie en direct : explosions, ordres qui s'éloignent, cercles de sélection.

const CAPACITE := 256
const DUREE_EXPLOSION_S := 0.7
const DUREE_REPERE_S := 1.4
const SEGMENTS := 32
# Comme les entités : à leur taille réelle, ces marques seraient invisibles de 200 km.
const TAILLE_ECRAN := 0.022
const COULEUR_REPERE := Color(0.4, 1.0, 0.6)
const COULEUR_SELECTION := Color(0.4, 1.0, 0.6)
const AABB_THEATRE := AABB(Vector3(-2e6, -2e6, -2e6), Vector3(4e6, 4e6, 4e6))

var _explosions: Array[Dictionary] = []
var _reperes: Array[Dictionary] = []
var _multi := MultiMesh.new()
var _lignes := ImmediateMesh.new()


func _ready() -> void:
	var quad := QuadMesh.new()
	var matiere := StandardMaterial3D.new()
	matiere.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	matiere.vertex_color_use_as_albedo = true
	matiere.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	matiere.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	matiere.no_depth_test = true
	matiere.cull_mode = BaseMaterial3D.CULL_DISABLED
	matiere.albedo_texture = _disque()
	_multi.transform_format = MultiMesh.TRANSFORM_3D
	_multi.use_colors = true
	_multi.mesh = quad
	_multi.instance_count = CAPACITE
	_multi.visible_instance_count = 0
	var couche := MultiMeshInstance3D.new()
	couche.multimesh = _multi
	couche.custom_aabb = AABB_THEATRE
	couche.material_override = matiere
	add_child(couche)
	var traits := MeshInstance3D.new()
	var matiere_traits := StandardMaterial3D.new()
	matiere_traits.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	matiere_traits.vertex_color_use_as_albedo = true
	matiere_traits.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	matiere_traits.no_depth_test = true
	traits.mesh = _lignes
	traits.material_override = matiere_traits
	traits.custom_aabb = AABB_THEATRE
	add_child(traits)


static func _disque() -> GradientTexture2D:
	var degrade := Gradient.new()
	degrade.colors = PackedColorArray([Color.WHITE, Color(1.0, 1.0, 1.0, 0.55), Color(1.0, 1.0, 1.0, 0.0)])
	degrade.offsets = PackedFloat32Array([0.0, 0.35, 1.0])
	var texture := GradientTexture2D.new()
	texture.gradient = degrade
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1.0, 0.5)
	return texture


## Faire naître une explosion au point de scène `point` ; `grande` pour une frappe au sol.
func exploser(point: Vector3, couleur: Color, grande: bool) -> void:
	if _explosions.size() >= CAPACITE:
		_explosions.pop_front()
	_explosions.append({"point": point, "couleur": couleur, "age": 0.0, "echelle": 3.0 if grande else 1.0})


## Marquer au sol le point `point` d'un ordre, relié aux positions `departs`.
func marquer_ordre(point: Vector3, departs: PackedVector3Array) -> void:
	_reperes.append({"point": point, "departs": departs, "age": 0.0})


## Avancer de `delta` s et redessiner ; `cercles` : points de scène des entités sélectionnées.
func dessiner(delta: float, camera: Camera3D, cercles: PackedVector3Array) -> void:
	_dessiner_explosions(delta, camera)
	_lignes.clear_surfaces()
	for repere in _reperes:
		repere["age"] += delta
	_reperes = _reperes.filter(func(r: Dictionary) -> bool: return r["age"] < DUREE_REPERE_S)
	if _reperes.is_empty() and cercles.is_empty():
		return
	_lignes.surface_begin(Mesh.PRIMITIVE_LINES)
	for point in cercles:
		_cercle(point, _rayon(camera, point) * 1.1, COULEUR_SELECTION)
	for repere in _reperes:
		_dessiner_repere(repere, camera)
	_lignes.surface_end()


func _dessiner_explosions(delta: float, camera: Camera3D) -> void:
	var n := 0
	var vivantes: Array[Dictionary] = []
	for explosion in _explosions:
		explosion["age"] += delta
		var part: float = explosion["age"] / DUREE_EXPLOSION_S
		if part >= 1.0:
			continue
		vivantes.append(explosion)
		var point: Vector3 = explosion["point"]
		var taille: float = _rayon(camera, point) * explosion["echelle"] * (0.6 + 1.6 * part)
		_multi.set_instance_transform(n, Transform3D(camera.global_basis.scaled(Vector3.ONE * taille), point))
		var couleur: Color = explosion["couleur"]
		couleur.a = 1.0 - part
		_multi.set_instance_color(n, couleur)
		n += 1
	_explosions = vivantes
	_multi.visible_instance_count = n


func _dessiner_repere(repere: Dictionary, camera: Camera3D) -> void:
	var point: Vector3 = repere["point"]
	var part: float = repere["age"] / DUREE_REPERE_S
	var couleur := COULEUR_REPERE
	couleur.a = 1.0 - part
	_cercle(point, _rayon(camera, point) * (1.5 - part), couleur)
	for depart: Vector3 in repere["departs"]:
		_lignes.surface_set_color(couleur)
		_lignes.surface_add_vertex(depart)
		_lignes.surface_set_color(couleur)
		_lignes.surface_add_vertex(point)


static func _rayon(camera: Camera3D, point: Vector3) -> float:
	return camera.global_position.distance_to(point) * TAILLE_ECRAN


func _cercle(centre: Vector3, rayon: float, couleur: Color) -> void:
	var precedent := centre + Vector3(rayon, 0.0, 0.0)
	for i in range(1, SEGMENTS + 1):
		var angle := TAU * i / SEGMENTS
		var suivant := centre + Vector3(cos(angle), 0.0, sin(angle)) * rayon
		_lignes.surface_set_color(couleur)
		_lignes.surface_add_vertex(precedent)
		_lignes.surface_set_color(couleur)
		_lignes.surface_add_vertex(suivant)
		precedent = suivant
