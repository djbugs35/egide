extends RefCounted
## Charge un export de outils/export_terrain.js (docs/FORMATS.md § 7) : maillage, imagerie et altitude du sol.

const RAYON_TERRE := 6_371_000.0

var description: Dictionary = {}
var _brut := PackedByteArray()
var _alt_min := 0.0
var _echelle := 0.0
var _lignes := 0
var _colonnes := 0
var _nord := 0.0
var _sud := 0.0
var _ouest := 0.0
var _est := 0.0
var _lat0 := 0.0
var _lon0 := 0.0


## Rendre vrai si le maillage suit (e, n, alt) plutôt que (e, n, u).
func est_plat() -> bool:
	return description["repere"] == "plat"


## Lire `terrain.json` et les hauteurs de `dossier` ; rendre "" ou le message d'erreur.
func charger(dossier: String) -> String:
	var lu: Variant = JSON.parse_string(FileAccess.get_file_as_string(dossier.path_join("terrain.json")))
	if not lu is Dictionary or lu.get("format") != "egide-terrain":
		return "pas un export de terrain : %s" % dossier
	description = lu
	_brut = FileAccess.get_file_as_bytes(dossier.path_join("hauteurs.raw"))
	var grille: Dictionary = description["grille"]
	_lignes = int(grille["lignes"])
	_colonnes = int(grille["colonnes"])
	if _brut.size() != 2 * _lignes * _colonnes:
		return "hauteurs.raw absent ou de mauvaise taille"
	_nord = grille["nord"]
	_sud = grille["sud"]
	_ouest = grille["ouest"]
	_est = grille["est"]
	_alt_min = description["hauteurs"]["alt_min_m"]
	_echelle = description["hauteurs"]["echelle_m"]
	_lat0 = description["origine"]["lat_deg"]
	_lon0 = description["origine"]["lon_deg"]
	return ""


## Rendre le maillage du terrain habillé de son imagerie (ou d'une teinte unie), ou null si le fichier est illisible.
func creer_scene(dossier: String) -> Node3D:
	var document := GLTFDocument.new()
	var etat := GLTFState.new()
	if document.append_from_file(dossier.path_join("terrain.glb"), etat) != OK:
		return null
	var scene: Node = document.generate_scene(etat)
	var matiere := StandardMaterial3D.new()
	matiere.roughness = 1.0
	matiere.cull_mode = BaseMaterial3D.CULL_DISABLED
	var imagerie: Variant = description["imagerie"]
	if imagerie is Dictionary:
		matiere.albedo_texture = ImageTexture.create_from_image(_mosaique(dossier, imagerie))
	else:
		matiere.albedo_color = Color(0.45, 0.5, 0.4)
	for maille in scene.find_children("*", "MeshInstance3D", true, false):
		maille.material_override = matiere
	return scene as Node3D


# Tuiles assemblées sans reprojection : les UV du maillage visent déjà cette mosaïque Web Mercator (FORMATS § 7.3).
func _mosaique(dossier: String, imagerie: Dictionary) -> Image:
	var taille := int(imagerie["taille_tuile"])
	var colonnes := int(imagerie["colonnes"])
	var lignes := int(imagerie["lignes"])
	var image := Image.create_empty(colonnes * taille, lignes * taille, false, Image.FORMAT_RGB8)
	for ligne in lignes:
		for colonne in colonnes:
			var chemin := "%s/imagerie/%d/%d/%d.tuile" % [dossier, int(imagerie["zoom"]), int(imagerie["x_min"]) + colonne, int(imagerie["y_min"]) + ligne]
			var tuile := _lire_tuile(chemin)
			if tuile != null:
				image.blit_rect(tuile, Rect2i(0, 0, taille, taille), Vector2i(colonne * taille, ligne * taille))
	image.generate_mipmaps()
	return image


static func _lire_tuile(chemin: String) -> Image:
	if not FileAccess.file_exists(chemin):
		return null
	var octets := FileAccess.get_file_as_bytes(chemin)
	var image := Image.new()
	var lu: Error = image.load_jpg_from_buffer(octets) if octets[0] == 0xFF else image.load_png_from_buffer(octets)
	if lu != OK:
		return null
	image.convert(Image.FORMAT_RGB8)
	return image


## Rendre l'altitude du sol (m) au point local (e, n), 0 hors de la grille. Passage en latitude et longitude sur la
## sphère : quelques centaines de mètres d'écart à 300 km de l'origine, invisibles sur une grille de 1 km.
func hauteur_sol(e: float, n: float) -> float:
	var lat := _lat0 + rad_to_deg(n / RAYON_TERRE)
	var lon := _lon0 + rad_to_deg(e / (RAYON_TERRE * cos(deg_to_rad(lat))))
	var y := (_nord - lat) / (_nord - _sud) * (_lignes - 1)
	var x := (lon - _ouest) / (_est - _ouest) * (_colonnes - 1)
	if y < 0.0 or x < 0.0 or y > _lignes - 1 or x > _colonnes - 1:
		return 0.0
	var i := mini(int(y), _lignes - 2)
	var j := mini(int(x), _colonnes - 2)
	var haut := lerpf(_noeud(i, j), _noeud(i, j + 1), x - j)
	var bas := lerpf(_noeud(i + 1, j), _noeud(i + 1, j + 1), x - j)
	return lerpf(haut, bas, y - i)


func _noeud(i: int, j: int) -> float:
	return _alt_min + _brut.decode_u16(2 * (i * _colonnes + j)) * _echelle
