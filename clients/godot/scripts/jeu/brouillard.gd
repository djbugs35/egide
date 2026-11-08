extends RefCounted
## Brouillard de la partie en direct : le sol hors de portée des radars s'assombrit. Lecture : disque de la portée de
## détection à l'altitude de l'essaim (MODELE § 25), sans le masque du relief ; c'est un repère visuel, pas un calcul.

const ZONES_MAX := 64
const LUMINOSITE_HORS_COUVERTURE := 0.32
const TEINTE_SANS_IMAGERIE := Color(0.27, 0.33, 0.27)
const CODE := """
shader_type spatial;
render_mode cull_disabled;

uniform sampler2D imagerie : source_color, filter_linear_mipmap;
uniform bool a_imagerie = false;
uniform vec3 teinte : source_color = vec3(0.3);
uniform vec3 zones[64];
uniform int nombre = 0;
uniform float sombre = 0.32;
varying vec3 point_monde;

void vertex() {
	point_monde = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float lumiere = sombre;
	float bord = 0.0;
	for (int i = 0; i < nombre; i++) {
		float d = distance(point_monde.xz, vec2(zones[i].x, -zones[i].y));
		float r = zones[i].z;
		float marge = max(r * 0.015, 400.0);
		lumiere = max(lumiere, mix(1.0, sombre, smoothstep(r - marge, r, d)));
		bord = max(bord, smoothstep(r - marge * 2.0, r - marge, d) * (1.0 - smoothstep(r - marge, r, d)));
	}
	vec3 fond = a_imagerie ? texture(imagerie, UV).rgb : teinte;
	ALBEDO = fond * lumiere;
	EMISSION = vec3(0.1, 0.32, 0.45) * bord;
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
"""

var matiere := ShaderMaterial.new()
var actif := true
var _matieres: Array[ShaderMaterial] = [matiere]
var _zones := PackedVector3Array()


func _init() -> void:
	var code := Shader.new()
	code.code = CODE
	matiere.shader = code
	matiere.set_shader_parameter("sombre", LUMINOSITE_HORS_COUVERTURE)
	matiere.set_shader_parameter("teinte", TEINTE_SANS_IMAGERIE)


## Faire suivre aussi le brouillard à la matière `autre`, celle d'un autre sol.
func suivre(autre: ShaderMaterial) -> void:
	_matieres.append(autre)
	autre.set_shader_parameter("sombre", LUMINOSITE_HORS_COUVERTURE if actif else 1.0)
	_transmettre()


## Habiller le sol de l'imagerie `texture`, ou d'une teinte unie si elle est nulle.
func habiller(texture: Texture2D) -> void:
	matiere.set_shader_parameter("a_imagerie", texture != null)
	if texture != null:
		matiere.set_shader_parameter("imagerie", texture)


## Rendre les disques [e, n, rayon] des objets du relevé de couvertures qui détectent, les plus grands d'abord.
static func disques(objets: Array) -> PackedVector3Array:
	var liste: Array[Vector3] = []
	for objet: Dictionary in objets:
		if float(objet["detection"]) > 0.0:
			liste.append(Vector3(objet["lieu"]["e"], objet["lieu"]["n"], objet["detection"]))
	liste.sort_custom(func(a: Vector3, b: Vector3) -> bool: return a.z > b.z)
	return PackedVector3Array(liste.slice(0, ZONES_MAX))


## Poser les zones vues à partir des objets du relevé de couvertures.
func poser(objets: Array) -> void:
	_zones = disques(objets)
	_transmettre()


## Lever ou rétablir le brouillard.
func basculer() -> void:
	actif = not actif
	for une in _matieres:
		une.set_shader_parameter("sombre", LUMINOSITE_HORS_COUVERTURE if actif else 1.0)


## Rendre les zones vues : la mini-carte les dessine aussi.
func zones() -> PackedVector3Array:
	return _zones


func _transmettre() -> void:
	var complet := _zones.duplicate()
	complet.resize(ZONES_MAX)
	for une in _matieres:
		une.set_shader_parameter("zones", complet)
		une.set_shader_parameter("nombre", _zones.size())
