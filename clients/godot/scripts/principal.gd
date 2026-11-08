extends Node3D
## Client de référence : relit un rejeu Égide, ou joue une partie en direct avec `-- --direct <port>` (docs/FORMATS.md § 6, 7 et 10).
## Espace : lecture ; + et - : vitesse ; flèches gauche et droite : ±10 s ; 1, 2, 3 : caméra ; Tab : entité suivie ; R : radar ;
## C : couverture affichée ; X : C2 suivant. Commandes de la partie en direct : clients/README.md.

# Par preload et non class_name : les noms globaux n'existent qu'après un passage dans l'éditeur, et le client doit
# se lancer depuis un dossier fraîchement cloné.
const Rejeu := preload("res://scripts/rejeu.gd")
const TerrainExporte := preload("res://scripts/terrain.gd")
const BibliothequeModeles := preload("res://scripts/modeles.gd")
const PiloteCamera := preload("res://scripts/pilote_camera.gd")
const PartieDirecte := preload("res://scripts/jeu/partie_directe.gd")

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
const ECART_ORIGINE_MAX_DEG := 1e-3

var rejeu := Rejeu.new()
var terrain: TerrainExporte = null
var modeles := BibliothequeModeles.new()
var pilote := PiloteCamera.new()
var camera := Camera3D.new()
var texte := Label.new()
var _essaim: MultiMeshInstance3D = null
var _groupes_vecteurs: Dictionary = {}
var _modele_vecteur: Dictionary = {}
var _fixes: Array[Dictionary] = []
var _radars := PackedVector3Array()
var _tirs := MeshInstance3D.new()
var _lignes_tirs := ImmediateMesh.new()
var _anneaux := MeshInstance3D.new()
var _lignes_anneaux := ImmediateMesh.new()
var couverture := 0
var _c2 := 0
var instant := 0.0
var rang_vitesse := 2
var _en_lecture := true
var pret := false
var direct: PartieDirecte = null
var environnement := Environment.new()
var scene_terrain: Node3D = null
var partie: Node3D = null
# Faux en direct, brouillard levé : un drone qu'aucun radar n'a vu ne se dessine pas.
var montrer_inconnus := true
# Objets du dernier relevé de couvertures dont on trace toutes les enveloppes : la sélection du joueur.
var objets_selection: Array = []
var _suivi := 0
var _radar := 0
var _imagerie_attribution := ""


func _ready() -> void:
	_preparer_scene()
	texte.text = "Chargement du rejeu…"
	await get_tree().process_frame
	await get_tree().process_frame
	var options := _options()
	if options["direct"] != "":
		direct = PartieDirecte.new()
		add_child(direct)
		direct.brancher(self, options)
		return
	var erreur := _charger(options)
	if erreur != "":
		texte.text = erreur
		push_error(erreur)
		return
	remonter()
	instant = float(options["debut"])
	couverture = posmod(int(options["couverture"]), COUVERTURES.size())
	pilote.mode = clampi(int(options["camera"]) - 1, 0, PiloteCamera.NOMS.size() - 1) as PiloteCamera.Mode
	pret = true


func _preparer_scene() -> void:
	camera.near = 5.0
	camera.far = 1_200_000.0
	camera.position = Vector3(0.0, 120_000.0, 160_000.0)
	add_child(camera)
	var lumiere := DirectionalLight3D.new()
	lumiere.rotation = Vector3(-0.9, 0.5, 0.0)
	add_child(lumiere)
	_preparer_traces()
	environnement.background_mode = Environment.BG_COLOR
	environnement.background_color = Color(0.55, 0.68, 0.82)
	environnement.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environnement.ambient_light_color = Color(1.0, 1.0, 1.0)
	environnement.ambient_light_energy = 0.5
	var monde := WorldEnvironment.new()
	monde.environment = environnement
	add_child(monde)
	var calque := CanvasLayer.new()
	texte.position = Vector2(12.0, 8.0)
	texte.add_theme_color_override("font_outline_color", Color.BLACK)
	texte.add_theme_constant_override("outline_size", 4)
	calque.add_child(texte)
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
	var erreur := rejeu.charger(options["rejeu"])
	if erreur != "":
		return erreur
	erreur = modeles.charger(ProjectSettings.globalize_path("res://").path_join("../modeles.json").simplify_path(), rejeu.entete["catalogue"])
	if erreur != "":
		return erreur
	return charger_terrain(options["terrain"]) if options["terrain"] != "" else ""


func charger_terrain(dossier: String) -> String:
	var charge := TerrainExporte.new()
	var erreur := charge.charger(dossier)
	if erreur != "":
		return erreur
	if not _meme_origine(charge.description["origine"], rejeu.entete["origine"]):
		push_warning("Terrain ignoré : %s n'a pas l'origine du scénario." % dossier)
		return ""
	var scene := charge.creer_scene(dossier)
	if scene == null:
		return "maillage illisible : %s" % dossier
	add_child(scene)
	terrain = charge
	scene_terrain = scene
	var imagerie: Variant = terrain.description["imagerie"]
	if imagerie is Dictionary:
		_imagerie_attribution = imagerie["attribution"]
	return ""


static func _meme_origine(a: Dictionary, b: Dictionary) -> bool:
	return absf(float(a["lat_deg"]) - float(b["lat_deg"])) < ECART_ORIGINE_MAX_DEG and absf(float(a["lon_deg"]) - float(b["lon_deg"])) < ECART_ORIGINE_MAX_DEG


## Reconstruire ce qui dépend du scénario, sur une scène vidée : une nouvelle partie peut changer tous les objets.
func remonter() -> void:
	if partie != null:
		partie.queue_free()
	partie = Node3D.new()
	add_child(partie)
	_fixes.clear()
	_radars.clear()
	_groupes_vecteurs.clear()
	_modele_vecteur.clear()
	_construire()


func _construire() -> void:
	_essaim = _nouvelle_couche(modeles.maillage(modeles.modele_unite(rejeu.statique["drones"]["unite"])), int(rejeu.statique["drones"]["nombre"]))
	for vecteur: Dictionary in rejeu.statique["vecteurs"]:
		var nom := modeles.modele_unite(vecteur["unite"])
		_modele_vecteur[int(vecteur["id"])] = nom
		_groupes_vecteurs[nom] = int(_groupes_vecteurs.get(nom, 0)) + 1
	for nom: String in _groupes_vecteurs.keys():
		_groupes_vecteurs[nom] = _nouvelle_couche(modeles.maillage(nom), _groupes_vecteurs[nom])
	_construire_fixes()


func _preparer_traces() -> void:
	var matiere := StandardMaterial3D.new()
	matiere.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	matiere.vertex_color_use_as_albedo = true
	matiere.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	# Une enveloppe posée à l'altitude de l'essaim passerait sous le moindre relief, en pointillés.
	matiere.no_depth_test = true
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
	partie.add_child(couche)
	return couche


static func _matiere_entite() -> StandardMaterial3D:
	var matiere := StandardMaterial3D.new()
	matiere.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	matiere.vertex_color_use_as_albedo = true
	matiere.cull_mode = BaseMaterial3D.CULL_DISABLED
	return matiere


func _construire_fixes() -> void:
	for site: Dictionary in rejeu.statique["sites"]:
		_ajouter_fixe(site, modeles.modele_icone("site"), COULEUR_SOL)
	for centre: Dictionary in rejeu.statique["centres"]:
		_ajouter_fixe(centre, modeles.modele_icone("c2"), COULEUR_AMI)
	for radar: Dictionary in rejeu.statique["radars"]:
		_radars.append(_ajouter_fixe(radar, modeles.modele_unite(radar["unite"]), COULEUR_AMI))
	# Les postes communs sont sur leur site, déjà dessiné ; seules les batteries placées ont une position propre.
	for poste: Dictionary in rejeu.statique["postes"]:
		if poste["batterie"] != null:
			_ajouter_fixe(poste, modeles.modele_unite(poste["unite"]), COULEUR_SOL)


func _ajouter_fixe(lieu: Dictionary, nom: String, couleur: Color) -> Vector3:
	var instance := MeshInstance3D.new()
	var matiere := StandardMaterial3D.new()
	matiere.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	matiere.albedo_color = couleur
	instance.mesh = modeles.maillage(nom)
	instance.material_override = matiere
	instance.position = point_lieu(lieu)
	partie.add_child(instance)
	_fixes.append({"noeud": instance})
	return instance.position


func point_lieu(lieu: Dictionary) -> Vector3:
	return _point(lieu["e"], lieu["n"], lieu["u"], lieu["alt_m"])


## Rendre le point de scène d'une position du rejeu : au-dessus du sol affiché, comme la vue 3D d'Égide (MODELE § 23).
func _point(e: float, n: float, u: float, alt: float) -> Vector3:
	if terrain == null:
		return Rejeu.point_scene(e, n, alt)
	var hauteur := alt if terrain.est_plat() else u
	return Rejeu.point_scene(e, n, hauteur + terrain.hauteur_sol(e, n))


func _unhandled_input(evenement: InputEvent) -> void:
	pilote.traiter_souris(evenement)
	# En direct, la partie reçoit elle-même ses gestes.
	if direct != null or not pret or not evenement is InputEventKey or not evenement.pressed:
		return
	match evenement.keycode:
		KEY_SPACE:
			_en_lecture = not _en_lecture
		KEY_KP_ADD, KEY_PLUS, KEY_EQUAL:
			rang_vitesse = mini(rang_vitesse + 1, VITESSES.size() - 1)
		KEY_KP_SUBTRACT, KEY_MINUS:
			rang_vitesse = maxi(rang_vitesse - 1, 0)
		KEY_LEFT:
			instant -= SAUT_S
		KEY_RIGHT:
			instant += SAUT_S
		KEY_1:
			pilote.mode = PiloteCamera.Mode.LIBRE
		KEY_2:
			pilote.mode = PiloteCamera.Mode.SUIVI
		KEY_3:
			pilote.mode = PiloteCamera.Mode.RADAR
		_:
			touche_commune(evenement.keycode)


## Exécuter une touche valable en rejeu comme en direct : entité suivie, radar, couverture affichée, C2.
func touche_commune(touche: int) -> void:
	match touche:
		KEY_TAB:
			_suivi += 1
		KEY_R:
			_radar += 1
		KEY_C:
			couverture = posmod(couverture + 1, COUVERTURES.size())
		KEY_X:
			_c2 += 1


func _process(delta: float) -> void:
	if direct != null:
		direct.recevoir(delta)
	if not pret:
		return
	_avancer_temps(delta)
	var rang := rejeu.rang_image(instant)
	var suivant := rejeu.rang_suivant(rang)
	var f := rejeu.fraction(rang, instant)
	var drones := Rejeu.interpoler(rejeu.drones[rang], rejeu.drones[suivant], rejeu.largeur_drones, f)
	var vecteurs := Rejeu.interpoler(rejeu.vecteurs[rang], rejeu.vecteurs[suivant], rejeu.largeur_vecteurs, f)
	_placer_camera(delta, drones)
	_dessiner_essaim(drones)
	_dessiner_vecteurs(vecteurs)
	_ajuster_fixes()
	_dessiner_tirs()
	_dessiner_couvertures(vecteurs)
	if direct != null:
		direct.mettre_a_jour(delta, drones, vecteurs)
	else:
		_afficher(drones.size() / rejeu.largeur_drones)


func _avancer_temps(delta: float) -> void:
	if direct != null:
		instant = direct.temps(instant, delta)
	elif _en_lecture:
		instant += delta * VITESSES[rang_vitesse]
	instant = clampf(instant, 0.0, rejeu.instants[-1])


func _placer_camera(delta: float, drones: PackedFloat32Array) -> void:
	var nombre := drones.size() / rejeu.largeur_drones
	if pilote.mode == PiloteCamera.Mode.STRATEGIE:
		pilote.avancer_strategie(camera, delta)
	elif pilote.mode == PiloteCamera.Mode.SUIVI and nombre > 0:
		var k := posmod(_suivi, nombre) * rejeu.largeur_drones
		pilote.suivre(camera, point_ligne(drones, k), drones[k + Rejeu.CAP])
	elif pilote.mode == PiloteCamera.Mode.RADAR and not _radars.is_empty():
		pilote.regarder_depuis_radar(camera, _radars[posmod(_radar, _radars.size())], _barycentre(drones, nombre))
	else:
		pilote.avancer_libre(camera, delta)


func point_ligne(plat: PackedFloat32Array, k: int) -> Vector3:
	return _point(plat[k + Rejeu.E], plat[k + Rejeu.N], plat[k + Rejeu.U], plat[k + Rejeu.ALT])


func _barycentre(drones: PackedFloat32Array, nombre: int) -> Vector3:
	if nombre == 0:
		return Vector3.ZERO
	var somme := Vector3.ZERO
	var k := 0
	while k < drones.size():
		somme += point_ligne(drones, k)
		k += rejeu.largeur_drones
	return somme / nombre


func _matrice(position_scene: Vector3, cap_deg: float) -> Transform3D:
	var taille := maxf(TAILLE_MINIMALE, camera.global_position.distance_to(position_scene) * TAILLE_RELATIVE)
	return Transform3D(Basis(Vector3.UP, deg_to_rad(-cap_deg)).scaled(Vector3.ONE * taille), position_scene)


func _dessiner_essaim(drones: PackedFloat32Array) -> void:
	var multi := _essaim.multimesh
	var n := 0
	var k := 0
	while k < drones.size():
		var detecte := int(drones[k + Rejeu.ETAT]) == 1
		if detecte or montrer_inconnus:
			multi.set_instance_transform(n, _matrice(point_ligne(drones, k), drones[k + Rejeu.CAP]))
			multi.set_instance_color(n, COULEUR_DRONE_DETECTE if detecte else COULEUR_DRONE_INCONNU)
			n += 1
		k += rejeu.largeur_drones
	multi.visible_instance_count = n


func _dessiner_vecteurs(vecteurs: PackedFloat32Array) -> void:
	var perdu: int = rejeu.entete["etats"]["vecteurs"].find("perdu")
	var remplis: Dictionary = {}
	var k := 0
	while k < vecteurs.size():
		var nom: String = _modele_vecteur[int(vecteurs[k + Rejeu.ID])]
		var multi: MultiMesh = _groupes_vecteurs[nom].multimesh
		var n: int = remplis.get(nom, 0)
		var est_perdu := int(vecteurs[k + Rejeu.ETAT]) == perdu
		multi.set_instance_transform(n, _matrice(point_ligne(vecteurs, k), vecteurs[k + Rejeu.CAP]))
		multi.set_instance_color(n, COULEUR_PERDU if est_perdu else COULEUR_AMI)
		remplis[nom] = n + 1
		k += rejeu.largeur_vecteurs
	for nom: String in remplis:
		_groupes_vecteurs[nom].multimesh.visible_instance_count = remplis[nom]


func _ajuster_fixes() -> void:
	for fixe in _fixes:
		var noeud: MeshInstance3D = fixe["noeud"]
		noeud.scale = Vector3.ONE * maxf(TAILLE_MINIMALE, camera.global_position.distance_to(noeud.position) * TAILLE_RELATIVE)


func _dessiner_tirs() -> void:
	_lignes_tirs.clear_surfaces()
	var ouvert := false
	for evenement in rejeu.evenements:
		var t: float = evenement["t"]
		if t > instant:
			break
		if evenement["type"] != "tir" or instant - t > DUREE_TRACE_TIR:
			continue
		if not ouvert:
			_lignes_tirs.surface_begin(Mesh.PRIMITIVE_LINES)
			ouvert = true
		var couleur := COULEUR_TIR_AIR if evenement["couche"] == "air" else COULEUR_TIR_SOL
		couleur.a = 1.0 - (instant - t) / DUREE_TRACE_TIR
		_lignes_tirs.surface_set_color(couleur)
		_lignes_tirs.surface_add_vertex(point_lieu(evenement["de"]))
		_lignes_tirs.surface_set_color(couleur)
		_lignes_tirs.surface_add_vertex(point_lieu(evenement["vers"]))
	if ouvert:
		_lignes_tirs.surface_end()


func _dessiner_couvertures(vecteurs: PackedFloat32Array) -> void:
	_lignes_anneaux.clear_surfaces()
	if couverture == 0 and objets_selection.is_empty():
		return
	var etat := rejeu.couvertures_a(instant)
	var objets: Array = etat["objets"]
	_lignes_anneaux.surface_begin(Mesh.PRIMITIVE_LINES)
	if couverture == MODE_RESULTANTE:
		var centre: Dictionary = etat["c2"][posmod(_c2, etat["c2"].size())]
		for rang in centre["membres"]:
			for cle in ["detection", "conduite", "interception"]:
				_tracer_anneau(objets[int(rang)], cle, vecteurs, COULEUR_RESULTANTE)
	elif couverture > 0:
		for objet: Dictionary in objets:
			_tracer_anneau(objet, CLES_COUVERTURE[couverture], vecteurs, COULEURS_COUVERTURE[couverture])
	for objet: Dictionary in objets_selection:
		for rang in range(1, CLES_COUVERTURE.size()):
			_tracer_anneau(objet, CLES_COUVERTURE[rang], vecteurs, COULEURS_COUVERTURE[rang])
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
		var k: int = int(objet["id"]) * rejeu.largeur_vecteurs
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
	var drones: PackedFloat32Array = rejeu.drones[rejeu.rang_image(instant)]
	return drones[Rejeu.ALT] if drones.size() > 0 else ALTITUDE_ANNEAU_SANS_DRONE


func _point_anneau(e: float, n: float, rayon: float, i: int, profil: Variant, masque: bool, hauteur: float) -> Vector3:
	var azimut := TAU * i / SEGMENTS_ANNEAU
	var portee := minf(rayon, profil[int(360.0 * i / SEGMENTS_ANNEAU) % 360]) if masque else rayon
	var ex := e + portee * sin(azimut)
	var ny := n + portee * cos(azimut)
	# En repère ENU, le sol descend avec la rotondité : sans cette correction, l'anneau flotterait à 7 km à 300 km de l'origine.
	return _point(ex, ny, hauteur - (ex * ex + ny * ny) / (2.0 * RAYON_TERRE), hauteur)


func _afficher(en_vol: int) -> void:
	var r := rejeu
	var b := r.bilan
	var lignes := [
		"t = %.1f s / %.1f s   ×%d   %s   caméra %s" % [instant, r.instants[-1], int(VITESSES[rang_vitesse]), "lecture" if _en_lecture else "pause", PiloteCamera.NOMS[pilote.mode]],
		"En vol : %d drones   Frappes : %d   Détruits air : %d   Détruits sol : %d" % [en_vol, Rejeu.compter_jusqua(r.instants_impacts, instant), Rejeu.compter_jusqua(r.instants_detruits_air, instant), Rejeu.compter_jusqua(r.instants_detruits_sol, instant)],
		"Bilan de la simulation : %d frappes, %d détruits air, %d détruits sol, %d tirs air, %d tirs sol" % [int(b["fuites"]), int(b["detruits_air"]), int(b["detruits_sol"]), int(b["tirs_air"]), int(b["tirs_sol"])],
		"Graine %d   empreinte %s   couverture : %s" % [int(r.entete["graine"]), str(r.entete["empreinte"]).left(12), COUVERTURES[couverture]],
	]
	if _imagerie_attribution != "":
		lignes.append(_imagerie_attribution)
	texte.text = "\n".join(lignes)
