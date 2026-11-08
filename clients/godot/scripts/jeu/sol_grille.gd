extends "res://scripts/terrain.gd"
## Sol tiré de la grille du terrain d'un scénario (docs/FORMATS.md § 2.5 et § 10) : une carte de hauteur déforme un plan, si
## bien qu'un coup de pinceau se voit tout de suite, sans reconstruire de maillage. Sans imagerie : teintes d'altitude.

const SUBDIVISIONS_MAX := 1022
const CODE := """
shader_type spatial;
render_mode cull_disabled, unshaded;

uniform sampler2D hauteurs : filter_linear, repeat_disable;
uniform float lat0;
uniform float lon0;
uniform float nord;
uniform float sud;
uniform float ouest;
uniform float est;
uniform float lignes = 2.0;
uniform float colonnes = 2.0;
uniform float pas_e = 1000.0;
uniform float pas_n = 1000.0;
uniform vec3 zones[64];
uniform int nombre = 0;
uniform float sombre = 0.32;
uniform vec3 pinceau = vec3(0.0, 0.0, -1.0);
varying vec3 point_monde;

const float RAYON = 6371000.0;

vec2 uv_de(vec2 en) {
	float lat = lat0 + degrees(en.y / RAYON);
	float lon = lon0 + degrees(en.x / (RAYON * cos(radians(lat))));
	vec2 relatif = vec2((lon - ouest) / (est - ouest), (lat - sud) / (nord - sud));
	return (relatif * (vec2(colonnes, lignes) - 1.0) + 0.5) / vec2(colonnes, lignes);
}

void vertex() {
	vec3 monde = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec2 en = vec2(monde.x, -monde.z);
	float h = textureLod(hauteurs, uv_de(en), 0.0).r;
	VERTEX.y = h - dot(en, en) / (2.0 * RAYON);
	point_monde = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

vec3 teinte(float h) {
	vec3 c = mix(vec3(0.20, 0.30, 0.16), vec3(0.42, 0.45, 0.24), smoothstep(0.0, 500.0, h));
	c = mix(c, vec3(0.48, 0.38, 0.26), smoothstep(500.0, 1500.0, h));
	return mix(c, vec3(0.85, 0.85, 0.88), smoothstep(1800.0, 3000.0, h));
}

void fragment() {
	vec2 en = vec2(point_monde.x, -point_monde.z);
	vec2 uv = uv_de(en);
	if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
		discard;
	}
	vec2 texel = 1.0 / vec2(colonnes, lignes);
	float h = texture(hauteurs, uv).r;
	float dh_e = (texture(hauteurs, uv + vec2(texel.x, 0.0)).r - texture(hauteurs, uv - vec2(texel.x, 0.0)).r) / (2.0 * pas_e);
	float dh_n = (texture(hauteurs, uv + vec2(0.0, texel.y)).r - texture(hauteurs, uv - vec2(0.0, texel.y)).r) / (2.0 * pas_n);
	// Relief exagéré à l'ombrage seulement : à l'échelle d'un théâtre, une pente réelle ne se verrait pas.
	vec3 normale = normalize(vec3(-dh_e * 6.0, 1.0, dh_n * 6.0));
	float ombre = 0.45 + 0.75 * max(dot(normale, normalize(vec3(-0.5, 0.7, -0.5))), 0.0);
	float lumiere = sombre;
	float bord = 0.0;
	for (int i = 0; i < nombre; i++) {
		float d = distance(en, zones[i].xy);
		float r = zones[i].z;
		float marge = max(r * 0.015, 400.0);
		lumiere = max(lumiere, mix(1.0, sombre, smoothstep(r - marge, r, d)));
		bord = max(bord, smoothstep(r - marge * 2.0, r - marge, d) * (1.0 - smoothstep(r - marge, r, d)));
	}
	vec3 couleur = teinte(h) * ombre * lumiere + vec3(0.1, 0.32, 0.45) * bord;
	if (pinceau.z > 0.0) {
		float d = distance(en, pinceau.xy);
		float epaisseur = max(pinceau.z * 0.03, 150.0);
		couleur = mix(couleur, vec3(1.0, 0.9, 0.4), (1.0 - smoothstep(0.0, epaisseur, abs(d - pinceau.z))) * 0.9);
	}
	ALBEDO = couleur;
}
"""

var noeud := MeshInstance3D.new()
var matiere := ShaderMaterial.new()
var _image: Image = null
var _texture: ImageTexture = null
var _source := ""


func _init() -> void:
	var code := Shader.new()
	code.code = CODE
	matiere.shader = code
	noeud.material_override = matiere
	noeud.custom_aabb = AABB(Vector3(-2e6, -2e6, -2e6), Vector3(4e6, 4e6, 4e6))


## Afficher la grille `m` (enregistrement « terrain » ou « atelier_terrain »), en repère d'origine `origine` ; sans effet si elle n'a pas changé.
func poser(m: Dictionary, origine: Dictionary) -> void:
	if m["altitudes_b64"] == _source:
		return
	_source = m["altitudes_b64"]
	description = {"repere": "enu", "origine": origine, "imagerie": null, "terrain": {"id": m["id"]}}
	_lignes = int(m["lignes"])
	_colonnes = int(m["colonnes"])
	_sud = m["lat_sud_deg"]
	_ouest = m["lon_ouest_deg"]
	_nord = _sud + (_lignes - 1) * float(m["pas_lat_deg"])
	_est = _ouest + (_colonnes - 1) * float(m["pas_lon_deg"])
	_lat0 = origine["lat_deg"]
	_lon0 = origine["lon_deg"]
	_brut = Marshalls.base64_to_raw(_source)
	_construire_carte()
	_construire_maille(float(m["pas_lat_deg"]), float(m["pas_lon_deg"]))


func _construire_carte() -> void:
	var valeurs := PackedFloat32Array()
	valeurs.resize(_lignes * _colonnes)
	for k in valeurs.size():
		valeurs[k] = _brut.decode_s16(2 * k)
	_image = Image.create_from_data(_colonnes, _lignes, false, Image.FORMAT_RF, valeurs.to_byte_array())
	_texture = ImageTexture.create_from_image(_image)
	matiere.set_shader_parameter("hauteurs", _texture)


func _construire_maille(pas_lat: float, pas_lon: float) -> void:
	var cos_max := cos(deg_to_rad(minf(absf(_sud), absf(_nord))))
	var min_e := deg_to_rad(_ouest - _lon0) * RAYON_TERRE * cos_max
	var max_e := deg_to_rad(_est - _lon0) * RAYON_TERRE * cos_max
	var min_n := deg_to_rad(_sud - _lat0) * RAYON_TERRE
	var max_n := deg_to_rad(_nord - _lat0) * RAYON_TERRE
	var plan := PlaneMesh.new()
	plan.size = Vector2(max_e - min_e, max_n - min_n)
	plan.subdivide_width = mini(_colonnes - 2, SUBDIVISIONS_MAX)
	plan.subdivide_depth = mini(_lignes - 2, SUBDIVISIONS_MAX)
	noeud.mesh = plan
	noeud.position = Vector3((min_e + max_e) / 2.0, 0.0, -(min_n + max_n) / 2.0)
	var reglages := {
		"lat0": _lat0, "lon0": _lon0, "nord": _nord, "sud": _sud, "ouest": _ouest, "est": _est, "lignes": float(_lignes), "colonnes": float(_colonnes),
		"pas_e": deg_to_rad(pas_lon) * RAYON_TERRE * cos_max, "pas_n": deg_to_rad(pas_lat) * RAYON_TERRE,
	}
	for nom: String in reglages:
		matiere.set_shader_parameter(nom, reglages[nom])


## Reporter le rectangle retouché `r` {i0, j0, lignes, colonnes, altitudes_b64}, lignes du sud au nord.
func retoucher(r: Dictionary) -> void:
	var octets := Marshalls.base64_to_raw(r["altitudes_b64"])
	var i0 := int(r["i0"])
	var j0 := int(r["j0"])
	var nl := int(r["lignes"])
	var nc := int(r["colonnes"])
	for i in nl:
		for j in nc:
			var altitude := octets.decode_s16(2 * (i * nc + j))
			_brut.encode_s16(2 * ((i0 + i) * _colonnes + j0 + j), altitude)
			_image.set_pixel(j0 + j, i0 + i, Color(float(altitude), 0.0, 0.0))
	_texture.update(_image)
	_source = ""


## Montrer le pinceau en (`e`, `n`), de rayon `rayon` m ; un rayon négatif l'efface.
func poser_pinceau(e: float, n: float, rayon: float) -> void:
	matiere.set_shader_parameter("pinceau", Vector3(e, n, rayon))


# Les lignes de la grille vont ici du sud au nord, alors que le parent numérote depuis le nord.
func _noeud(i: int, j: int) -> float:
	return _brut.decode_s16(2 * ((_lignes - 1 - i) * _colonnes + j))
