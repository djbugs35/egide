extends Node3D
## Client de référence : relit un rejeu Égide, ou joue une partie en direct avec `-- --direct <port>` (docs/FORMATS.md § 6, 7 et 10).
## Espace : lecture ; + et - : vitesse ; flèches gauche et droite : ±10 s ; 1, 2, 3 : caméra ; Tab : entité suivie ; R : radar ;
## C : couverture affichée ; X : C2 suivant. En direct : clic droit, ordre au groupe ; G : groupe suivant ; N : nouvelle partie.

# Par preload et non class_name : les noms globaux n'existent qu'après un passage dans l'éditeur, et le client doit
# se lancer depuis un dossier fraîchement cloné.
const Rejeu := preload("res://scripts/rejeu.gd")
const TerrainExporte := preload("res://scripts/terrain.gd")
const BibliothequeModeles := preload("res://scripts/modeles.gd")
const PiloteCamera := preload("res://scripts/pilote_camera.gd")
const Liaison := preload("res://scripts/liaison.gd")

const VITESSES := [1.0, 2.0, 5.0, 10.0, 30.0, 60.0]
const SAUT_S := 10.0
# Les entités réelles feraient moins d'un pixel à l'échelle du théâtre : leur taille suit la distance à la caméra.
const TAILLE_RELATIVE := 0.012
const TAILLE_MINIMALE := 15.0
const DUREE_TRACE_TIR := 0.5
const COUVERTURES := ["aucune", "détection", "conduite de tir", "interception", "résultante du C2"]
const CLES_COUVERTURE := ["", "detection", "conduite", "interception"]
const COULEURS_COUVERTURE := [Color.WHITE, Color(0.29, 0.6, 0.91), Color(0.91, 0.77, 0.28), Color(0.34, 0.78, 0.52)]
const COULEUR_RESULTANTE := Color(0.71, 0.56, 0.91)
const MODE_RESULTANTE := 4
const SEGMENTS_ANNEAU := 48
const ALTITUDE_ANNEAU_SANS_DRONE := 100.0
const RAYON_TERRE := 6_371_000.0
const AABB_THEATRE := AABB(Vector3(-2e6, -2e6, -2e6), Vector3(4e6, 4e6, 4e6))
const COULEUR_DRONE_INCONNU := Color(0.75, 0.75, 0.75)
const COULEUR_DRONE_DETECTE := Color(0.95, 0.25, 0.2)
const COULEUR_AMI := Color(0.35, 0.65, 1.0)
const COULEUR_PERDU := Color(0.3, 0.3, 0.3)
const COULEUR_SOL := Color(0.45, 0.85, 0.45)
const COULEUR_TIR_AIR := Color(0.35, 0.65, 1.0)
const COULEUR_TIR_SOL := Color(1.0, 0.75, 0.25)
# Au-delà, un clic droit est un mouvement de caméra et non un ordre.
const GLISSEMENT_MAX_ORDRE_PX := 6.0
const PASSES_VISEE := 3
const IMAGES_GARDEES := 64
const IMAGES_AVANT_OUBLI := 256
const ECART_ORIGINE_MAX_DEG := 1e-3

var _rejeu := Rejeu.new()
var _terrain: TerrainExporte = null
var _modeles := BibliothequeModeles.new()
var _pilote := PiloteCamera.new()
var _camera := Camera3D.new()
var _texte := Label.new()
var _essaim: MultiMeshInstance3D = null
var _groupes_vecteurs: Dictionary = {}
var _modele_vecteur: Dictionary = {}
var _fixes: Array[Dictionary] = []
var _radars := PackedVector3Array()
var _tirs := MeshInstance3D.new()
var _lignes_tirs := ImmediateMesh.new()
var _anneaux := MeshInstance3D.new()
var _lignes_anneaux := ImmediateMesh.new()
var _couverture := 0
var _c2 := 0
var _t := 0.0
var _rang_vitesse := 2
var _en_lecture := true
var _pret := false
var _liaison: Liaison = null
var _chemin_terrain := ""
var _etat_direct: Dictionary = {}
var _note := ""
var _groupes: Array[String] = []
var _groupe := -1
var _appui_droit := Vector2.INF
var _partie: Node3D = null
var _suivi := 0
var _radar := 0
var _imagerie_attribution := ""


func _ready() -> void:
	_preparer_scene()
	_texte.text = "Chargement du rejeu…"
	await get_tree().process_frame
	await get_tree().process_frame
	var options := _options()
	if options["direct"] != "":
		_ouvrir_direct(options)
		return
	var erreur := _charger(options)
	if erreur != "":
		_texte.text = erreur
		push_error(erreur)
		return
	_remonter()
	_t = float(options["debut"])
	_couverture = posmod(int(options["couverture"]), COUVERTURES.size())
	_pilote.mode = clampi(int(options["camera"]) - 1, 0, PiloteCamera.NOMS.size() - 1) as PiloteCamera.Mode
	_pret = true


func _preparer_scene() -> void:
	_camera.near = 5.0
	_camera.far = 1_200_000.0
	_camera.position = Vector3(0.0, 120_000.0, 160_000.0)
	add_child(_camera)
	var lumiere := DirectionalLight3D.new()
	lumiere.rotation = Vector3(-0.9, 0.5, 0.0)
	add_child(lumiere)
	_preparer_traces()
	var environnement := Environment.new()
	environnement.background_mode = Environment.BG_COLOR
	environnement.background_color = Color(0.55, 0.68, 0.82)
	environnement.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environnement.ambient_light_color = Color(1.0, 1.0, 1.0)
	environnement.ambient_light_energy = 0.5
	var monde := WorldEnvironment.new()
	monde.environment = environnement
	add_child(monde)
	var calque := CanvasLayer.new()
	_texte.position = Vector2(12.0, 8.0)
	_texte.add_theme_color_override("font_outline_color", Color.BLACK)
	_texte.add_theme_constant_override("outline_size", 4)
	calque.add_child(_texte)
	add_child(calque)


## Rendre {rejeu, terrain, debut (s), camera (1 à 3), couverture (0 à 4), direct (port)} : valeurs données après « -- », sinon les plus récents de resultats/.
func _options() -> Dictionary:
	var resultats := ProjectSettings.globalize_path("res://").path_join("../../resultats").simplify_path()
	var options := {"rejeu": _plus_recent(resultats.path_join("rejeux")), "terrain": _terrain_recent(resultats.path_join("terrains")), "debut": "0", "camera": "1", "couverture": "0", "direct": ""}
	var arguments := OS.get_cmdline_user_args()
	for rang in range(0, arguments.size() - 1, 2):
		options[arguments[rang].trim_prefix("--")] = arguments[rang + 1]
	return options


static func _plus_recent(dossier: String) -> String:
	var retenu := ""
	var date := -1
	for nom in DirAccess.get_files_at(dossier):
		var chemin := dossier.path_join(nom)
		if nom.ends_with(".egide-rejeu") and FileAccess.get_modified_time(chemin) > date:
			retenu = chemin
			date = FileAccess.get_modified_time(chemin)
	return retenu


static func _terrain_recent(dossier: String) -> String:
	var retenu := ""
	var date := -1
	for nom in DirAccess.get_directories_at(dossier):
		var description := dossier.path_join(nom).path_join("terrain.json")
		if FileAccess.file_exists(description) and FileAccess.get_modified_time(description) > date:
			retenu = dossier.path_join(nom)
			date = FileAccess.get_modified_time(description)
	return retenu


func _charger(options: Dictionary) -> String:
	if options["rejeu"] == "":
		return "Aucun rejeu trouvé : lancer node src/rejeu.js, ou passer -- --rejeu <fichier>."
	var erreur := _rejeu.charger(options["rejeu"])
	if erreur != "":
		return erreur
	erreur = _modeles.charger(ProjectSettings.globalize_path("res://").path_join("../modeles.json").simplify_path(), _rejeu.entete["catalogue"])
	if erreur != "":
		return erreur
	return _charger_terrain(options["terrain"]) if options["terrain"] != "" else ""


func _charger_terrain(dossier: String) -> String:
	var terrain := TerrainExporte.new()
	var erreur := terrain.charger(dossier)
	if erreur != "":
		return erreur
	if not _meme_origine(terrain.description["origine"], _rejeu.entete["origine"]):
		push_warning("Terrain ignoré : %s n'a pas l'origine du scénario." % dossier)
		return ""
	var scene := terrain.creer_scene(dossier)
	if scene == null:
		return "maillage illisible : %s" % dossier
	add_child(scene)
	_terrain = terrain
	var imagerie: Variant = terrain.description["imagerie"]
	if imagerie is Dictionary:
		_imagerie_attribution = imagerie["attribution"]
	return ""


static func _meme_origine(a: Dictionary, b: Dictionary) -> bool:
	return absf(float(a["lat_deg"]) - float(b["lat_deg"])) < ECART_ORIGINE_MAX_DEG and absf(float(a["lon_deg"]) - float(b["lon_deg"])) < ECART_ORIGINE_MAX_DEG


## Reconstruire ce qui dépend du scénario, sur une scène vidée : une nouvelle partie peut changer tous les objets.
func _remonter() -> void:
	if _partie != null:
		_partie.queue_free()
	_partie = Node3D.new()
	add_child(_partie)
	_fixes.clear()
	_radars.clear()
	_groupes_vecteurs.clear()
	_modele_vecteur.clear()
	_construire()


func _construire() -> void:
	_essaim = _nouvelle_couche(_modeles.maillage(_modeles.modele_unite(_rejeu.statique["drones"]["unite"])), int(_rejeu.statique["drones"]["nombre"]))
	for vecteur: Dictionary in _rejeu.statique["vecteurs"]:
		var nom := _modeles.modele_unite(vecteur["unite"])
		_modele_vecteur[int(vecteur["id"])] = nom
		_groupes_vecteurs[nom] = int(_groupes_vecteurs.get(nom, 0)) + 1
	for nom: String in _groupes_vecteurs.keys():
		_groupes_vecteurs[nom] = _nouvelle_couche(_modeles.maillage(nom), _groupes_vecteurs[nom])
	_construire_fixes()


func _preparer_traces() -> void:
	var matiere := StandardMaterial3D.new()
	matiere.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	matiere.vertex_color_use_as_albedo = true
	matiere.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_tirs.mesh = _lignes_tirs
	_tirs.material_override = matiere
	_tirs.custom_aabb = AABB_THEATRE
	add_child(_tirs)
	_anneaux.mesh = _lignes_anneaux
	_anneaux.material_override = matiere
	_anneaux.custom_aabb = AABB_THEATRE
	add_child(_anneaux)


func _nouvelle_couche(maille: Mesh, capacite: int) -> MultiMeshInstance3D:
	var multi := MultiMesh.new()
	multi.transform_format = MultiMesh.TRANSFORM_3D
	multi.use_colors = true
	multi.mesh = maille
	multi.instance_count = capacite
	multi.visible_instance_count = 0
	var couche := MultiMeshInstance3D.new()
	couche.multimesh = multi
	couche.custom_aabb = AABB_THEATRE
	couche.material_override = _matiere_entite()
	_partie.add_child(couche)
	return couche


static func _matiere_entite() -> StandardMaterial3D:
	var matiere := StandardMaterial3D.new()
	matiere.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	matiere.vertex_color_use_as_albedo = true
	matiere.cull_mode = BaseMaterial3D.CULL_DISABLED
	return matiere


func _construire_fixes() -> void:
	for site: Dictionary in _rejeu.statique["sites"]:
		_ajouter_fixe(site, _modeles.modele_icone("site"), COULEUR_SOL)
	for centre: Dictionary in _rejeu.statique["centres"]:
		_ajouter_fixe(centre, _modeles.modele_icone("c2"), COULEUR_AMI)
	for radar: Dictionary in _rejeu.statique["radars"]:
		_radars.append(_ajouter_fixe(radar, _modeles.modele_unite(radar["unite"]), COULEUR_AMI))
	# Les postes communs sont sur leur site, déjà dessiné ; seules les batteries placées ont une position propre.
	for poste: Dictionary in _rejeu.statique["postes"]:
		if poste["batterie"] != null:
			_ajouter_fixe(poste, _modeles.modele_unite(poste["unite"]), COULEUR_SOL)


func _ajouter_fixe(lieu: Dictionary, nom: String, couleur: Color) -> Vector3:
	var instance := MeshInstance3D.new()
	var matiere := StandardMaterial3D.new()
	matiere.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	matiere.albedo_color = couleur
	instance.mesh = _modeles.maillage(nom)
	instance.material_override = matiere
	instance.position = _point_lieu(lieu)
	_partie.add_child(instance)
	_fixes.append({"noeud": instance})
	return instance.position


func _point_lieu(lieu: Dictionary) -> Vector3:
	return _point(lieu["e"], lieu["n"], lieu["u"], lieu["alt_m"])


## Rendre le point de scène d'une position du rejeu : au-dessus du sol affiché, comme la vue 3D d'Égide (MODELE § 23).
func _point(e: float, n: float, u: float, alt: float) -> Vector3:
	if _terrain == null:
		return Rejeu.point_scene(e, n, alt)
	var hauteur := alt if _terrain.est_plat() else u
	return Rejeu.point_scene(e, n, hauteur + _terrain.hauteur_sol(e, n))


func _unhandled_input(evenement: InputEvent) -> void:
	_pilote.traiter_souris(evenement)
	if _liaison != null and _pret and evenement is InputEventMouseButton:
		_traiter_clic_droit(evenement)
	if not _pret or not evenement is InputEventKey or not evenement.pressed:
		return
	if _liaison != null and _commander(evenement.keycode):
		return
	match evenement.keycode:
		KEY_SPACE:
			_en_lecture = not _en_lecture
		KEY_KP_ADD, KEY_PLUS, KEY_EQUAL:
			_rang_vitesse = mini(_rang_vitesse + 1, VITESSES.size() - 1)
		KEY_KP_SUBTRACT, KEY_MINUS:
			_rang_vitesse = maxi(_rang_vitesse - 1, 0)
		KEY_LEFT:
			_t -= SAUT_S
		KEY_RIGHT:
			_t += SAUT_S
		KEY_1:
			_pilote.mode = PiloteCamera.Mode.LIBRE
		KEY_2:
			_pilote.mode = PiloteCamera.Mode.SUIVI
		KEY_3:
			_pilote.mode = PiloteCamera.Mode.RADAR
		KEY_TAB:
			_suivi += 1
		KEY_R:
			_radar += 1
		KEY_C:
			_couverture = posmod(_couverture + 1, COUVERTURES.size())
		KEY_X:
			_c2 += 1


func _process(delta: float) -> void:
	if _liaison != null:
		_recevoir(delta)
	if not _pret:
		return
	_avancer_temps(delta)
	var rang := _rejeu.rang_image(_t)
	var suivant := _rejeu.rang_suivant(rang)
	var f := _rejeu.fraction(rang, _t)
	var drones := Rejeu.interpoler(_rejeu.drones[rang], _rejeu.drones[suivant], _rejeu.largeur_drones, f)
	var vecteurs := Rejeu.interpoler(_rejeu.vecteurs[rang], _rejeu.vecteurs[suivant], _rejeu.largeur_vecteurs, f)
	_placer_camera(delta, drones)
	_dessiner_essaim(drones)
	_dessiner_vecteurs(vecteurs)
	_ajuster_fixes()
	_dessiner_tirs()
	_dessiner_couvertures(vecteurs)
	_afficher(drones.size() / _rejeu.largeur_drones)


func _avancer_temps(delta: float) -> void:
	if _liaison != null:
		_t = _temps_direct(delta)
	elif _en_lecture:
		_t += delta * VITESSES[_rang_vitesse]
	_t = clampf(_t, 0.0, _rejeu.instants[-1])


func _placer_camera(delta: float, drones: PackedFloat32Array) -> void:
	var nombre := drones.size() / _rejeu.largeur_drones
	if _pilote.mode == PiloteCamera.Mode.SUIVI and nombre > 0:
		var k := posmod(_suivi, nombre) * _rejeu.largeur_drones
		_pilote.suivre(_camera, _point_ligne(drones, k), drones[k + Rejeu.CAP])
	elif _pilote.mode == PiloteCamera.Mode.RADAR and not _radars.is_empty():
		_pilote.regarder_depuis_radar(_camera, _radars[posmod(_radar, _radars.size())], _barycentre(drones, nombre))
	else:
		_pilote.avancer_libre(_camera, delta)


func _point_ligne(plat: PackedFloat32Array, k: int) -> Vector3:
	return _point(plat[k + Rejeu.E], plat[k + Rejeu.N], plat[k + Rejeu.U], plat[k + Rejeu.ALT])


func _barycentre(drones: PackedFloat32Array, nombre: int) -> Vector3:
	if nombre == 0:
		return Vector3.ZERO
	var somme := Vector3.ZERO
	var k := 0
	while k < drones.size():
		somme += _point_ligne(drones, k)
		k += _rejeu.largeur_drones
	return somme / nombre


func _matrice(position_scene: Vector3, cap_deg: float) -> Transform3D:
	var taille := maxf(TAILLE_MINIMALE, _camera.global_position.distance_to(position_scene) * TAILLE_RELATIVE)
	return Transform3D(Basis(Vector3.UP, deg_to_rad(-cap_deg)).scaled(Vector3.ONE * taille), position_scene)


func _dessiner_essaim(drones: PackedFloat32Array) -> void:
	var multi := _essaim.multimesh
	var n := 0
	var k := 0
	while k < drones.size():
		multi.set_instance_transform(n, _matrice(_point_ligne(drones, k), drones[k + Rejeu.CAP]))
		multi.set_instance_color(n, COULEUR_DRONE_DETECTE if int(drones[k + Rejeu.ETAT]) == 1 else COULEUR_DRONE_INCONNU)
		n += 1
		k += _rejeu.largeur_drones
	multi.visible_instance_count = n


func _dessiner_vecteurs(vecteurs: PackedFloat32Array) -> void:
	var perdu: int = _rejeu.entete["etats"]["vecteurs"].find("perdu")
	var remplis: Dictionary = {}
	var k := 0
	while k < vecteurs.size():
		var nom: String = _modele_vecteur[int(vecteurs[k + Rejeu.ID])]
		var multi: MultiMesh = _groupes_vecteurs[nom].multimesh
		var n: int = remplis.get(nom, 0)
		var est_perdu := int(vecteurs[k + Rejeu.ETAT]) == perdu
		multi.set_instance_transform(n, _matrice(_point_ligne(vecteurs, k), vecteurs[k + Rejeu.CAP]))
		multi.set_instance_color(n, COULEUR_PERDU if est_perdu else COULEUR_AMI)
		remplis[nom] = n + 1
		k += _rejeu.largeur_vecteurs
	for nom: String in remplis:
		_groupes_vecteurs[nom].multimesh.visible_instance_count = remplis[nom]


func _ajuster_fixes() -> void:
	for fixe in _fixes:
		var noeud: MeshInstance3D = fixe["noeud"]
		noeud.scale = Vector3.ONE * maxf(TAILLE_MINIMALE, _camera.global_position.distance_to(noeud.position) * TAILLE_RELATIVE)


func _dessiner_tirs() -> void:
	_lignes_tirs.clear_surfaces()
	var ouvert := false
	for evenement in _rejeu.evenements:
		var t: float = evenement["t"]
		if t > _t:
			break
		if evenement["type"] != "tir" or _t - t > DUREE_TRACE_TIR:
			continue
		if not ouvert:
			_lignes_tirs.surface_begin(Mesh.PRIMITIVE_LINES)
			ouvert = true
		var couleur := COULEUR_TIR_AIR if evenement["couche"] == "air" else COULEUR_TIR_SOL
		couleur.a = 1.0 - (_t - t) / DUREE_TRACE_TIR
		_lignes_tirs.surface_set_color(couleur)
		_lignes_tirs.surface_add_vertex(_point_lieu(evenement["de"]))
		_lignes_tirs.surface_set_color(couleur)
		_lignes_tirs.surface_add_vertex(_point_lieu(evenement["vers"]))
	if ouvert:
		_lignes_tirs.surface_end()


func _dessiner_couvertures(vecteurs: PackedFloat32Array) -> void:
	_lignes_anneaux.clear_surfaces()
	if _couverture == 0:
		return
	var etat := _rejeu.couvertures_a(_t)
	var objets: Array = etat["objets"]
	_lignes_anneaux.surface_begin(Mesh.PRIMITIVE_LINES)
	if _couverture == MODE_RESULTANTE:
		var centre: Dictionary = etat["c2"][posmod(_c2, etat["c2"].size())]
		for rang in centre["membres"]:
			for cle in ["detection", "conduite", "interception"]:
				_tracer_anneau(objets[int(rang)], cle, vecteurs, COULEUR_RESULTANTE)
	else:
		for objet: Dictionary in objets:
			_tracer_anneau(objet, CLES_COUVERTURE[_couverture], vecteurs, COULEURS_COUVERTURE[_couverture])
	# Une surface sans sommet est une erreur pour ImmediateMesh : on en pose un, invisible, au cas où rien ne soit tracé.
	_lignes_anneaux.surface_set_color(Color.TRANSPARENT)
	_lignes_anneaux.surface_add_vertex(Vector3.ZERO)
	_lignes_anneaux.surface_add_vertex(Vector3.ZERO)
	_lignes_anneaux.surface_end()


## Tracer une enveloppe, à l'altitude de l'essaim ; un vecteur la porte à sa position courante (FORMATS § 6.5).
func _tracer_anneau(objet: Dictionary, cle: String, vecteurs: PackedFloat32Array, couleur: Color) -> void:
	var rayon: float = objet[cle]
	if rayon <= 0.0:
		return
	var lieu: Dictionary = objet["lieu"]
	var e: float = lieu["e"]
	var n: float = lieu["n"]
	if objet["genre"] == "vecteur":
		var k: int = int(objet["id"]) * _rejeu.largeur_vecteurs
		e = vecteurs[k + Rejeu.E]
		n = vecteurs[k + Rejeu.N]
	var profil: Variant = objet["profil"]
	var masque := profil is Array and cle != "conduite"
	var hauteur := _hauteur_essaim()
	_lignes_anneaux.surface_set_color(couleur)
	var precedent := _point_anneau(e, n, rayon, 0, profil, masque, hauteur)
	for i in range(1, SEGMENTS_ANNEAU + 1):
		var suivant := _point_anneau(e, n, rayon, i, profil, masque, hauteur)
		_lignes_anneaux.surface_add_vertex(precedent)
		_lignes_anneaux.surface_add_vertex(suivant)
		precedent = suivant


## Rendre l'altitude des enveloppes : celle de l'essaim, à laquelle le moteur les calcule (MODELE § 25).
func _hauteur_essaim() -> float:
	var drones: PackedFloat32Array = _rejeu.drones[_rejeu.rang_image(_t)]
	return drones[Rejeu.ALT] if drones.size() > 0 else ALTITUDE_ANNEAU_SANS_DRONE


func _point_anneau(e: float, n: float, rayon: float, i: int, profil: Variant, masque: bool, hauteur: float) -> Vector3:
	var azimut := TAU * i / SEGMENTS_ANNEAU
	var portee := minf(rayon, profil[int(360.0 * i / SEGMENTS_ANNEAU) % 360]) if masque else rayon
	var ex := e + portee * sin(azimut)
	var ny := n + portee * cos(azimut)
	# En repère ENU, le sol descend avec la rotondité : sans cette correction, l'anneau flotterait à 7 km à 300 km de l'origine.
	return _point(ex, ny, hauteur - (ex * ex + ny * ny) / (2.0 * RAYON_TERRE), hauteur)


func _afficher(en_vol: int) -> void:
	if _liaison != null:
		_afficher_direct(en_vol)
		return
	var r := _rejeu
	var b := r.bilan
	var lignes := [
		"t = %.1f s / %.1f s   ×%d   %s   caméra %s" % [_t, r.instants[-1], int(VITESSES[_rang_vitesse]), "lecture" if _en_lecture else "pause", PiloteCamera.NOMS[_pilote.mode]],
		"En vol : %d drones   Frappes : %d   Détruits air : %d   Détruits sol : %d" % [en_vol, Rejeu.compter_jusqua(r.instants_impacts, _t), Rejeu.compter_jusqua(r.instants_detruits_air, _t), Rejeu.compter_jusqua(r.instants_detruits_sol, _t)],
		"Bilan de la simulation : %d frappes, %d détruits air, %d détruits sol, %d tirs air, %d tirs sol" % [int(b["fuites"]), int(b["detruits_air"]), int(b["detruits_sol"]), int(b["tirs_air"]), int(b["tirs_sol"])],
		"Graine %d   empreinte %s   couverture : %s" % [int(r.entete["graine"]), str(r.entete["empreinte"]).left(12), COUVERTURES[_couverture]],
	]
	if _imagerie_attribution != "":
		lignes.append(_imagerie_attribution)
	_texte.text = "\n".join(lignes)


func _ouvrir_direct(options: Dictionary) -> void:
	_chemin_terrain = options["terrain"]
	_liaison = Liaison.new()
	_liaison.ouvrir("ws://127.0.0.1:%s" % options["direct"])
	_texte.text = "Connexion au serveur de partie (node src/direct.js)…"


func _recevoir(delta: float) -> void:
	for message in _liaison.recevoir(delta):
		match message["genre"]:
			"entete":
				_ouvrir_partie(message)
			"etat":
				_etat_direct = message
				# Le serveur garde sa vitesse d'une partie à l'autre : les touches + et - repartent de la sienne.
				_rang_vitesse = maxi(VITESSES.find(float(message["vitesse"])), 0)
			"erreur":
				_note = "Refusé : %s" % message["message"]
				push_warning(_note)
			"archive":
				_note = "Partie enregistrée : %s" % str(message["chemin"]).get_file()
			_:
				_ranger_direct(message)
	if _rejeu.instants.size() > IMAGES_AVANT_OUBLI:
		_rejeu.oublier_anciennes(IMAGES_GARDEES)


## Recommencer l'affichage sur une nouvelle partie : un serveur relancé ou une modification de scénario en envoient une.
func _ouvrir_partie(tete: Dictionary) -> void:
	_pret = false
	_rejeu = Rejeu.new()
	_note = ""
	_t = 0.0
	var erreur := _rejeu.lire_entete(tete)
	if erreur == "":
		erreur = _modeles.charger(ProjectSettings.globalize_path("res://").path_join("../modeles.json").simplify_path(), tete["catalogue"])
	if erreur == "" and _terrain == null and _chemin_terrain != "":
		erreur = _charger_terrain(_chemin_terrain)
	if erreur != "":
		_texte.text = erreur
		push_error(erreur)


func _ranger_direct(message: Dictionary) -> void:
	_rejeu.ajouter(message)
	if message["genre"] == "statique":
		_remonter()
		_groupes = _noeuds_des_groupes()
		_groupe = -1
	elif message["genre"] == "image" and not _pret:
		_t = _rejeu.instants[-1]
		_pret = not _rejeu.statique.is_empty()


func _noeuds_des_groupes() -> Array[String]:
	var noeuds: Array[String] = []
	for vecteur: Dictionary in _rejeu.statique["vecteurs"]:
		if not noeuds.has(vecteur["noeud"]):
			noeuds.append(vecteur["noeud"])
	return noeuds


## Rendre l'instant à montrer : une image en arrière du serveur, pour toujours avoir deux images entre lesquelles interpoler.
func _temps_direct(delta: float) -> float:
	var instants := _rejeu.instants
	var dernier := instants[-1]
	var ecart := dernier - instants[-2] if instants.size() > 1 else 0.0
	var vitesse := float(_etat_direct.get("vitesse", 1.0))
	var t := _t + delta * vitesse
	var cible := dernier - ecart
	# Trop loin de la cible (image sautée, changement de vitesse) : glisser se verrait moins qu'un retard qui dure.
	return cible if absf(t - cible) > 2.0 * ecart + vitesse * delta else t


## Exécuter la touche `touche` en direct ; rendre vrai si elle remplace son effet de lecture de rejeu.
func _commander(touche: int) -> bool:
	match touche:
		KEY_SPACE:
			_liaison.envoyer({"type": "reprendre" if _etat_direct.get("pause", true) else "pause"})
		KEY_KP_ADD, KEY_PLUS, KEY_EQUAL:
			_rang_vitesse = mini(_rang_vitesse + 1, VITESSES.size() - 1)
			_liaison.envoyer({"type": "vitesse", "valeur": VITESSES[_rang_vitesse]})
		KEY_KP_SUBTRACT, KEY_MINUS:
			_rang_vitesse = maxi(_rang_vitesse - 1, 0)
			_liaison.envoyer({"type": "vitesse", "valeur": VITESSES[_rang_vitesse]})
		KEY_N:
			_liaison.envoyer({"type": "recommencer"})
		KEY_G:
			_groupe = _groupe + 1 if _groupe + 1 < _groupes.size() else -1
		KEY_LEFT, KEY_RIGHT:
			_note = "Une partie en direct ne se rembobine pas."
		_:
			return false
	return true


func _traiter_clic_droit(evenement: InputEventMouseButton) -> void:
	if evenement.button_index != MOUSE_BUTTON_RIGHT:
		return
	if evenement.pressed:
		_appui_droit = evenement.position
	elif _appui_droit.distance_to(evenement.position) <= GLISSEMENT_MAX_ORDRE_PX:
		_ordonner_vers(evenement.position)


func _ordonner_vers(ecran: Vector2) -> void:
	var vise: Variant = _point_vise(ecran)
	if vise == null:
		_note = "Viser le sol pour donner un ordre."
		return
	var ids := _ids_du_groupe()
	if _liaison.envoyer({"type": "ordre", "avions": ids, "e": vise.x, "n": -vise.z}):
		_note = "Ordre : %d vecteurs vers (%.1f km, %.1f km)" % [ids.size(), vise.x / 1000.0, -vise.z / 1000.0]


## Rendre le point du sol sous le pixel `ecran`, ou null si le rayon ne descend pas vers le sol.
func _point_vise(ecran: Vector2) -> Variant:
	var origine := _camera.project_ray_origin(ecran)
	var direction := _camera.project_ray_normal(ecran)
	if direction.y >= -1e-3:
		return null
	var hauteur := 0.0
	var point := origine
	for passe in PASSES_VISEE:
		point = origine + direction * (hauteur - origine.y) / direction.y
		hauteur = _hauteur_scene_sol(point.x, -point.z)
	return point


## Rendre la hauteur de scène du sol en (e, n) : celle de _point pour une altitude nulle.
func _hauteur_scene_sol(e: float, n: float) -> float:
	if _terrain == null:
		return 0.0
	var courbure := 0.0 if _terrain.est_plat() else (e * e + n * n) / (2.0 * RAYON_TERRE)
	return _terrain.hauteur_sol(e, n) - courbure


func _ids_du_groupe() -> Array[int]:
	var ids: Array[int] = []
	for vecteur: Dictionary in _rejeu.statique["vecteurs"]:
		if _groupe < 0 or vecteur["noeud"] == _groupes[_groupe]:
			ids.append(int(vecteur["id"]))
	return ids


func _afficher_direct(en_vol: int) -> void:
	var b: Dictionary = _etat_direct.get("bilan", {})
	var vitesse := float(_etat_direct.get("vitesse", 1.0))
	var obtenue := float(_etat_direct.get("vitesse_obtenue", 0.0))
	var groupe := "tous" if _groupe < 0 else _groupes[_groupe]
	var lignes := [
		"EN DIRECT   t = %.1f s   ×%d   %s   %s" % [_t, int(vitesse), "PAUSE (Espace pour lancer)" if _etat_direct.get("pause", true) else "en cours", "terminé" if _etat_direct.get("termine", false) else ("serveur en retard : ×%.1f" % obtenue if obtenue > 0.0 and obtenue < 0.9 * vitesse else "")],
		"En vol : %d drones   Frappes : %d   Détruits air : %d   Détruits sol : %d" % [en_vol, int(b.get("fuites", 0)), int(b.get("detruits_air", 0)), int(b.get("detruits_sol", 0))],
		"Munitions air : %d   sol : %d" % [int(b.get("munitions_air_restantes", 0)), int(b.get("munitions_sol_restantes", 0))],
		"Groupe : %s (G)   clic droit : ordre   N : nouvelle partie   couverture : %s" % [groupe, COUVERTURES[_couverture]],
	]
	if not _liaison.est_connectee():
		lignes.append("LIAISON COUPÉE : relancer node src/direct.js")
	if _note != "":
		lignes.append(_note)
	_texte.text = "\n".join(lignes)
