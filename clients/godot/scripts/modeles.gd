extends RefCounted
## Modèles génériques du client, choisis par clients/modeles.json (docs/FORMATS.md § 7.4). Formes simples, faites dans
## le code : aucun modèle d'un système réel.

# [longueur, envergure], rapportées à une unité : la forme suggère la classe, l'échelle est celle de l'affichage.
const VOLANTS := {
	"avion_helice": [1.0, 1.5], "avion_reaction": [1.3, 0.8], "drone_aile_delta": [0.8, 1.1], "drone_helices": [0.6, 0.6],
	"drone_reaction": [1.2, 0.5], "helicoptere": [1.1, 0.5], "missile": [1.5, 0.25],
}
const AU_SOL := {
	"abri_commandement": Vector3(1.2, 0.5, 1.2), "batiment_site": Vector3(1.0, 1.0, 1.0), "mat_liaison": Vector3(0.1, 1.5, 0.1), "mat_radar": Vector3(0.25, 1.8, 0.25),
	"vehicule_arme": Vector3(0.6, 0.4, 1.1), "vehicule_brouilleur": Vector3(0.6, 0.5, 1.0), "vehicule_lanceur": Vector3(0.7, 0.5, 1.3), "vehicule_radar": Vector3(0.6, 0.8, 1.1),
}
const MODELE_SECOURS := "batiment_site"
const PREFIXE_PRIVE := "prive/"
# Lumière figée dans les couleurs des sommets : les entités du client sont dessinées sans éclairage de scène.
const DIRECTION_LUMIERE := Vector3(-0.5, 0.71, 0.5)
const LUMIERE_AMBIANTE := 0.55

var _table: Dictionary = {}
var _catalogue: Dictionary = {}
var _maillages: Dictionary = {}
static var _detailles: Dictionary = {}


## Rendre vrai si `nom` désigne un modèle détaillé, à montrer dans ses propres couleurs (docs/FORMATS.md § 7.4).
static func est_detaille(nom: String) -> bool:
	# Interrogée par véhicule à chaque image : on ne touche au disque qu'une fois par nom.
	if not _detailles.has(nom):
		_detailles[nom] = FileAccess.file_exists(_chemin_detaille(nom))
	return _detailles[nom]


## Lire la table `chemin` et indexer le catalogue de l'en-tête du rejeu ; rendre "" ou le message d'erreur.
func charger(chemin: String, catalogue: Array) -> String:
	var lu: Variant = JSON.parse_string(FileAccess.get_file_as_string(chemin))
	if not lu is Dictionary:
		return "table de modèles illisible : %s" % chemin
	_table = lu
	for fiche: Dictionary in catalogue:
		_catalogue[fiche["id"]] = fiche
	return ""


## Rendre le nom du modèle d'une unité du catalogue : par son icône, sinon par sa famille.
func modele_unite(id: String) -> String:
	var fiche: Dictionary = _catalogue.get(id, {})
	var icone: Variant = fiche.get("icone")
	if icone != null and FileAccess.file_exists(_chemin_detaille(icone)):
		return icone
	if icone != null and _table["icones"].has(icone):
		return _table["icones"][icone]
	return _table["familles"].get(fiche.get("famille", ""), MODELE_SECOURS)


## Rendre le nom du modèle d'une icône (sites et centres n'ont pas d'unité).
func modele_icone(icone: String) -> String:
	if FileAccess.file_exists(_chemin_detaille(icone)):
		return icone
	return _table["icones"].get(icone, MODELE_SECOURS)


## Rendre le maillage du modèle `nom`, construit une fois.
func maillage(nom: String) -> Mesh:
	if not _maillages.has(nom):
		_maillages[nom] = _construire(nom)
	return _maillages[nom]


static func _construire(nom: String) -> Mesh:
	if est_detaille(nom):
		var detaille := _lire_detaille(_chemin_detaille(nom))
		if detaille != null:
			return detaille
		nom = MODELE_SECOURS
	if VOLANTS.has(nom):
		return _fleche(VOLANTS[nom][0], VOLANTS[nom][1])
	var boite := BoxMesh.new()
	boite.size = AU_SOL.get(nom, Vector3.ONE)
	return boite


static func _chemin_detaille(icone: String) -> String:
	var relatif := "../../prive/modeles/%s.glb" % icone.trim_prefix(PREFIXE_PRIVE) if icone.begins_with(PREFIXE_PRIVE) else "../../modeles/%s.glb" % icone
	return ProjectSettings.globalize_path("res://").path_join(relatif).simplify_path()


# Ramené à une unité de long et retourné : le fichier met l'avant sur +Z, le client sur -Z.
static func _lire_detaille(chemin: String) -> Mesh:
	var document := GLTFDocument.new()
	var etat := GLTFState.new()
	if document.append_from_file(chemin, etat) != OK:
		return null
	var scene: Node = document.generate_scene(etat)
	var mailles := scene.find_children("*", "MeshInstance3D", true, false)
	var lue: Mesh = null if mailles.is_empty() else mailles[0].mesh
	var sortie: Mesh = null if lue == null else _preparer_detaille(lue)
	scene.free()
	return sortie


static func _preparer_detaille(lue: Mesh) -> ArrayMesh:
	var tableaux := lue.surface_get_arrays(0)
	var taille := lue.get_aabb().size
	var echelle := 1.0 / maxf(taille.x, taille.z)
	var sommets: PackedVector3Array = tableaux[Mesh.ARRAY_VERTEX]
	var normales: PackedVector3Array = tableaux[Mesh.ARRAY_NORMAL]
	var couleurs: PackedColorArray = tableaux[Mesh.ARRAY_COLOR]
	var lumiere := DIRECTION_LUMIERE.normalized()
	for i in sommets.size():
		sommets[i] = Vector3(-sommets[i].x, sommets[i].y, -sommets[i].z) * echelle
		var eclairement := LUMIERE_AMBIANTE + (1.0 - LUMIERE_AMBIANTE) * maxf(normales[i].dot(lumiere), 0.0)
		normales[i] = Vector3(-normales[i].x, normales[i].y, -normales[i].z)
		couleurs[i] = Color(couleurs[i].r * eclairement, couleurs[i].g * eclairement, couleurs[i].b * eclairement)
	var resultat: Array = []
	resultat.resize(Mesh.ARRAY_MAX)
	resultat[Mesh.ARRAY_VERTEX] = sommets
	resultat[Mesh.ARRAY_NORMAL] = normales
	resultat[Mesh.ARRAY_COLOR] = couleurs
	resultat[Mesh.ARRAY_TEX_UV] = tableaux[Mesh.ARRAY_TEX_UV]
	resultat[Mesh.ARRAY_INDEX] = tableaux[Mesh.ARRAY_INDEX]
	var maillage_final := ArrayMesh.new()
	maillage_final.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, resultat)
	maillage_final.surface_set_material(0, lue.surface_get_material(0))
	return maillage_final


# Texture d'un modèle détaillé ; null pour une forme simple, qui n'a que des couleurs.
static func texture_maillage(maille: Mesh) -> Texture2D:
	var matiere := maille.surface_get_material(0) as BaseMaterial3D
	return null if matiere == null else matiere.albedo_texture


# Pointe vers -Z : au cap 0, une entité regarde le nord (FORMATS § 6.3).
static func _fleche(longueur: float, envergure: float) -> ArrayMesh:
	var nez := Vector3(0.0, 0.0, -longueur / 2.0)
	var gauche := Vector3(-envergure / 2.0, 0.0, longueur / 2.0)
	var droite := Vector3(envergure / 2.0, 0.0, longueur / 2.0)
	var dos := Vector3(0.0, envergure / 4.0, longueur / 4.0)
	var outil := SurfaceTool.new()
	outil.begin(Mesh.PRIMITIVE_TRIANGLES)
	for sommet in [nez, gauche, dos, nez, dos, droite, gauche, droite, dos, nez, droite, gauche]:
		outil.add_vertex(sommet)
	return outil.commit()
