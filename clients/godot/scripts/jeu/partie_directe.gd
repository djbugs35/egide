extends Node
## La partie en direct : reçoit le serveur (src/direct.js, docs/FORMATS.md § 10), traduit les gestes du joueur en commandes
## et tient l'interface. Égide reste l'autorité : ce nœud n'avance ni ne décide rien de la simulation.

const Liaison := preload("res://scripts/liaison.gd")
const Selection := preload("res://scripts/jeu/selection.gd")
const Brouillard := preload("res://scripts/jeu/brouillard.gd")
const Sons := preload("res://scripts/jeu/sons.gd")
const Effets := preload("res://scripts/jeu/effets.gd")
const Ihm := preload("res://scripts/jeu/ihm.gd")
const Rejeu := preload("res://scripts/rejeu.gd")
const PiloteCamera := preload("res://scripts/pilote_camera.gd")
const SolGrille := preload("res://scripts/jeu/sol_grille.gd")
const EditeurScenario := preload("res://scripts/jeu/editeur_scenario.gd")
const EditeurTerrain := preload("res://scripts/jeu/editeur_terrain.gd")

enum Mode { JEU, SCENARIO, TERRAIN }

const GLISSEMENT_MAX_PX := 6.0
const RAYON_CLIC_PX := 18.0
const PASSES_VISEE := 3
const IMAGES_GARDEES := 64
const IMAGES_AVANT_OUBLI := 256
const RAPPEL_DOUBLE_S := 0.35
# Au-delà, les enveloppes des vecteurs sélectionnés se recouvrent en un fouillis illisible.
const ANNEAUX_SELECTION_MAX := 8
const COULEUR_EXPLOSION_AIR := Color(1.0, 0.65, 0.25)
const COULEUR_FRAPPE := Color(1.0, 0.2, 0.15)
const COTE_PLAN_SANS_TERRAIN := 4e6
const RAYON_TERRE := 6_371_000.0
const COULEUR_SITE_CARTE := Color(0.45, 0.85, 0.45)
const COULEUR_RADAR_CARTE := Color(0.55, 0.8, 1.0)
const COULEUR_HORS_THEATRE := Color(0.03, 0.05, 0.08)

var hote: Node3D = null
var _liaison := Liaison.new()
var _selection := Selection.new()
var _brouillard := Brouillard.new()
var _sons := Sons.new()
var _effets := Effets.new()
var _ihm := Ihm.new()
var _chemin_terrain := ""
var _etat: Dictionary = {}
var _a_jouer: Array[Dictionary] = []
var _vecteurs := PackedFloat32Array()
var _noms: Dictionary = {}
var _icones: Dictionary = {}
var _appui := Vector2.INF
var _appui_droit := Vector2.INF
var _cadre_ouvert := false
var _dernier_rappel := {"numero": 0, "instant": -100.0}
var _export: Variant = null
var _export_lu := false
var _sol := SolGrille.new()
var _plan: MeshInstance3D = null
var _terrain_scenario: Variant = null
var _camera_placee := false
var _mode := Mode.JEU
var _editeur := EditeurScenario.new()
var _atelier := EditeurTerrain.new()
var _couvertures_vues: Dictionary = {}
var _premiere_detection := true
var _bilan_fini: Dictionary = {}


## Relier ce nœud à la scène `h` et viser le serveur de `options`.
func brancher(h: Node3D, options: Dictionary) -> void:
	hote = h
	_chemin_terrain = options["terrain"]
	add_child(_sons)
	add_child(_effets)
	add_child(_ihm)
	_ihm.racine.add_child(_editeur)
	_ihm.racine.add_child(_atelier)
	_editeur.brancher(self)
	_atelier.brancher(self)
	_brouillard.suivre(_sol.matiere)
	hote.add_child(_sol.noeud)
	_sol.noeud.visible = false
	_ihm.mini_carte.centrage_demande.connect(_centrer_sur)
	_ihm.mini_carte.ordre_demande.connect(_ordonner_au_point)
	hote.pilote.mode = PiloteCamera.Mode.STRATEGIE
	hote.montrer_inconnus = false
	# Le fond clair du rejeu trancherait avec le brouillard au bord du terrain.
	hote.environnement.background_color = COULEUR_HORS_THEATRE
	_liaison.ouvrir("ws://127.0.0.1:%s" % options["direct"])
	hote.texte.text = "Connexion au serveur de partie (node src/direct.js)…"


func recevoir(delta: float) -> void:
	for message in _liaison.recevoir(delta):
		match message["genre"]:
			"entete":
				_ouvrir_partie(message)
			"etat":
				_etat = message
				hote.rang_vitesse = maxi(hote.VITESSES.find(float(message["vitesse"])), 0)
			"erreur":
				_ihm.annoncer("Refusé : %s" % message["message"])
				push_warning(message["message"])
			"archive":
				_ihm.annoncer("Partie enregistrée : %s" % str(message["chemin"]).get_file())
			"enregistre":
				_ihm.annoncer("Enregistré : %s" % str(message["chemin"]))
			"elements":
				_editeur.poser_elements(message)
			"palette":
				_editeur.poser_palette(message["familles"])
				_atelier.poser_palette(message["familles"])
			"scenarios":
				_editeur.poser_scenarios(message["liste"])
			"terrain":
				_terrain_scenario = message
				_choisir_sol(message)
			"atelier_terrain":
				_montrer_grille(message)
			"terrain_retouche":
				_sol.retoucher(message)
			_:
				_ranger(message)
	if hote.rejeu.instants.size() > IMAGES_AVANT_OUBLI:
		hote.rejeu.oublier_anciennes(IMAGES_GARDEES)


func _ouvrir_partie(tete: Dictionary) -> void:
	hote.pret = false
	hote.rejeu = Rejeu.new()
	hote.instant = 0.0
	_a_jouer.clear()
	_selection.oublier_groupes()
	_premiere_detection = true
	_bilan_fini = {}
	_ihm.montrer_fin("")
	var erreur: String = hote.rejeu.lire_entete(tete)
	if erreur == "":
		erreur = hote.modeles.charger(ProjectSettings.globalize_path("res://").path_join("../modeles.json").simplify_path(), tete["catalogue"])
	if erreur != "":
		hote.texte.text = erreur
		push_error(erreur)
		return
	hote.texte.text = ""
	for fiche: Dictionary in tete["catalogue"]:
		_noms[fiche["id"]] = fiche["nom"]
		_icones[fiche["id"]] = fiche["icone"]


func _charger_export() -> void:
	if _export_lu or _chemin_terrain == "":
		return
	_export_lu = true
	if hote.charger_terrain(_chemin_terrain) != "" or hote.terrain == null:
		return
	_export = hote.terrain
	_brouillard.habiller(_export.imagerie_texture)
	for maille in hote.scene_terrain.find_children("*", "MeshInstance3D", true, false):
		maille.material_override = _brouillard.matiere


## Choisir le sol du scénario : l'export de ce terrain s'il existe (il porte l'imagerie), sinon la grille reçue, sinon un plan.
func _choisir_sol(message: Dictionary) -> void:
	_charger_export()
	var id: Variant = message["id"]
	if _export != null and (id == null or _export.description["terrain"]["id"] == id) and hote._meme_origine(_export.description["origine"], hote.rejeu.entete["origine"]):
		hote.terrain = _export
		_montrer_sol(hote.scene_terrain)
	elif id != null:
		_montrer_grille(message)
	else:
		hote.terrain = null
		_montrer_sol(_plan_sans_terrain())


func _montrer_grille(message: Dictionary) -> void:
	_sol.poser(message, hote.rejeu.entete["origine"])
	hote.terrain = _sol
	_montrer_sol(_sol.noeud)


func _montrer_sol(voulu: Node3D) -> void:
	for sol: Node3D in [hote.scene_terrain, _plan, _sol.noeud]:
		if sol != null:
			sol.visible = sol == voulu


func _plan_sans_terrain() -> MeshInstance3D:
	if _plan == null:
		var maille := PlaneMesh.new()
		maille.size = Vector2.ONE * COTE_PLAN_SANS_TERRAIN
		_plan = MeshInstance3D.new()
		_plan.mesh = maille
		_plan.material_override = _brouillard.matiere
		_brouillard.habiller(null if _export == null else _export.imagerie_texture)
		hote.add_child(_plan)
	return _plan


func _ranger(message: Dictionary) -> void:
	hote.rejeu.ajouter(message)
	match message["genre"]:
		"statique":
			hote.remonter()
		"couvertures":
			_couvertures_vues = message
			_brouillard.poser(message["objets"])
		"evenement":
			_a_jouer.append(message)
		"bilan":
			_bilan_fini = message
		"image":
			if not hote.pret and not hote.rejeu.statique.is_empty():
				_commencer()


func _commencer() -> void:
	hote.instant = hote.rejeu.instants[-1]
	hote.pret = true
	_cadrer_carte()
	# Une édition relance la partie : la caméra doit rester où le joueur l'a mise.
	if _camera_placee:
		return
	_camera_placee = true
	var sites: Array = hote.rejeu.statique["sites"]
	var somme := Vector3.ZERO
	for site: Dictionary in sites:
		somme += Vector3(site["e"], 0.0, -float(site["n"]))
	hote.pilote.centrer(somme / maxi(sites.size(), 1))


func _cadrer_carte() -> void:
	var statique: Dictionary = hote.rejeu.statique
	var points: Array[Vector2] = []
	var fixes: Array[Dictionary] = []
	for liste_nom in ["sites", "radars", "centres"]:
		for lieu: Dictionary in statique[liste_nom]:
			points.append(Vector2(lieu["e"], lieu["n"]))
			fixes.append({"e": lieu["e"], "n": lieu["n"], "couleur": COULEUR_RADAR_CARTE if liste_nom == "radars" else COULEUR_SITE_CARTE})
	for vecteur: Dictionary in statique["vecteurs"]:
		points.append(Vector2(vecteur["orbite"]["e"], vecteur["orbite"]["n"]))
	var drones: PackedFloat32Array = hote.rejeu.drones[-1]
	var k := 0
	while k < drones.size():
		points.append(Vector2(drones[k + Rejeu.E], drones[k + Rejeu.N]))
		k += hote.rejeu.largeur_drones
	_ihm.mini_carte.cadrer(points, fixes)


## Rendre l'instant à montrer : une image en arrière du serveur, pour toujours avoir deux images entre lesquelles interpoler.
func temps(instant: float, delta: float) -> float:
	var instants: PackedFloat64Array = hote.rejeu.instants
	var dernier := instants[-1]
	var ecart := dernier - instants[-2] if instants.size() > 1 else 0.0
	var vitesse := float(_etat.get("vitesse", 1.0))
	var t := instant + delta * vitesse
	var cible := dernier - ecart
	# Trop loin de la cible (image sautée, changement de vitesse) : glisser se verrait moins qu'un retard qui dure.
	return cible if absf(t - cible) > 2.0 * ecart + vitesse * delta else t


## Mettre à jour tout ce qui suit la scène de cette image : effets, sons, mini-carte, panneaux.
func mettre_a_jour(delta: float, drones: PackedFloat32Array, vecteurs: PackedFloat32Array) -> void:
	_vecteurs = vecteurs
	_jouer_evenements()
	hote.objets_selection = _objets_selectionnes()
	_effets.dessiner(delta, hote.camera, _cercles_selection())
	_ihm.vieillir(delta)
	_nourrir_carte(drones)
	_ihm.ecrire_haut(_texte_haut(drones))
	if _mode == Mode.JEU:
		_ecrire_selection()
	elif _mode == Mode.SCENARIO:
		_editeur.avancer(delta)
		_ihm.montrer_selection("", "", null)
	else:
		_atelier.avancer(delta)
		_ihm.montrer_selection("", "", null)
	if not _bilan_fini.is_empty():
		_ihm.montrer_fin(_texte_fin())


func _jouer_evenements() -> void:
	var rang := 0
	while rang < _a_jouer.size() and float(_a_jouer[rang]["t"]) <= hote.instant:
		_jouer(_a_jouer[rang])
		rang += 1
	if rang > 0:
		_a_jouer = _a_jouer.slice(rang)


func _jouer(evenement: Dictionary) -> void:
	match evenement["type"]:
		"tir":
			_sons.jouer("tir")
			if evenement["detruit"]:
				_effets.exploser(hote.point_lieu(evenement["vers"]), COULEUR_EXPLOSION_AIR, false)
				_sons.jouer("explosion")
		"impact":
			var site: Dictionary = hote.rejeu.statique["sites"][int(evenement["cible"])]
			_effets.exploser(hote.point_lieu(site), COULEUR_FRAPPE, true)
			_sons.jouer("impact")
			_sons.jouer("alerte")
			_ihm.mini_carte.alerter(site["e"], site["n"])
			_ihm.annoncer("Frappe sur le site %d" % int(evenement["cible"]))
		"detection":
			if _premiere_detection:
				_premiere_detection = false
				_sons.jouer("alerte")
				_ihm.annoncer("Essaim détecté")
		"ordre":
			_ihm.annoncer("%d vecteurs ont reçu l'ordre" % evenement["avions"].size())
		"panne":
			_sons.jouer("alerte")
			_ihm.annoncer("Panne : %s" % str(evenement["element"]))


func _objets_selectionnes() -> Array:
	if _couvertures_vues.is_empty():
		return []
	var objets: Array = hote.rejeu.couvertures_a(hote.instant)["objets"]
	if _selection.fixe != null:
		return objets.filter(func(o: Dictionary) -> bool: return o["noeud"] == _selection.fixe["noeud"] and o["genre"] == _selection.fixe["genre"])
	if _selection.ids.size() > ANNEAUX_SELECTION_MAX:
		return []
	return objets.filter(func(o: Dictionary) -> bool: return o["genre"] == "vecteur" and _selection.ids.has(int(o["id"])))


func _point_vecteur(id: int) -> Vector3:
	return hote.point_ligne(_vecteurs, id * hote.rejeu.largeur_vecteurs)


func _est_perdu(id: int) -> bool:
	return int(_vecteurs[id * hote.rejeu.largeur_vecteurs + Rejeu.ETAT]) == hote.rejeu.entete["etats"]["vecteurs"].find("perdu")


func _cercles_selection() -> PackedVector3Array:
	var cercles := PackedVector3Array()
	if _selection.fixe != null:
		cercles.append(hote.point_lieu(_selection.fixe["lieu"]))
	for id in _selection.ids:
		if not _est_perdu(id):
			cercles.append(_point_vecteur(id))
	return cercles


func _nourrir_carte(drones: PackedFloat32Array) -> void:
	var rejeu: Rejeu = hote.rejeu
	var vus := PackedVector2Array()
	var k := 0
	while k < drones.size():
		if hote.montrer_inconnus or int(drones[k + Rejeu.ETAT]) == 1:
			vus.append(Vector2(drones[k + Rejeu.E], drones[k + Rejeu.N]))
		k += rejeu.largeur_drones
	var amis := PackedVector2Array()
	var choisis := PackedVector2Array()
	k = 0
	while k < _vecteurs.size():
		var id := int(_vecteurs[k + Rejeu.ID])
		if not _est_perdu(id):
			var point := Vector2(_vecteurs[k + Rejeu.E], _vecteurs[k + Rejeu.N])
			amis.append(point)
			if _selection.ids.has(id):
				choisis.append(point)
		k += rejeu.largeur_vecteurs
	_ihm.mini_carte.poser(_brouillard.zones(), vus, amis, choisis, _champ_de_vue())


## Rendre les quatre coins de la vue projetés au sol, en (e, n) ; vide si un coin regarde le ciel.
func _champ_de_vue() -> PackedVector2Array:
	var taille: Vector2 = hote.get_viewport().get_visible_rect().size
	var champ := PackedVector2Array()
	for coin in [Vector2.ZERO, Vector2(taille.x, 0.0), taille, Vector2(0.0, taille.y)]:
		var point: Variant = _point_vise(coin)
		if point == null:
			return PackedVector2Array()
		champ.append(Vector2(point.x, -point.z))
	return champ


func _texte_haut(drones: PackedFloat32Array) -> String:
	var b: Dictionary = _etat.get("bilan", {})
	var vitesse := float(_etat.get("vitesse", 1.0))
	var obtenue := float(_etat.get("vitesse_obtenue", 0.0))
	var detectes := 0
	var k := Rejeu.ETAT
	while k < drones.size():
		detectes += int(drones[k])
		k += hote.rejeu.largeur_drones
	var allure := "PAUSE (Espace)" if _etat.get("pause", true) else "×%d" % int(vitesse)
	if obtenue > 0.0 and obtenue < 0.9 * vitesse and not _etat.get("pause", true):
		allure += " (obtenu ×%.1f)" % obtenue
	var liaison := "" if _liaison.est_connectee() else "   LIAISON COUPÉE : relancer node src/direct.js"
	return "T+%s   %s   Détectés : %d   Frappes : %d   Détruits : %d air, %d sol   Munitions : %d air, %d sol   H : aide%s" % [_duree(hote.instant), allure, detectes, int(b.get("fuites", 0)), int(b.get("detruits_air", 0)), int(b.get("detruits_sol", 0)), int(b.get("munitions_air_restantes", 0)), int(b.get("munitions_sol_restantes", 0)), liaison]


static func _duree(secondes: float) -> String:
	return "%02d:%02d" % [int(secondes) / 60, int(secondes) % 60]


func _ecrire_selection() -> void:
	if _selection.fixe != null:
		_ecrire_fixe(_selection.fixe)
	elif _selection.ids.is_empty():
		_ihm.montrer_selection("", "", null)
	else:
		_ecrire_vecteurs()


func _ecrire_fixe(objet: Dictionary) -> void:
	var portees: Array[String] = []
	for paire in [["détection", "detection"], ["conduite de tir", "conduite"], ["interception", "interception"]]:
		if float(objet[paire[1]]) > 0.0:
			portees.append("%s %.0f km" % [paire[0], float(objet[paire[1]]) / 1000.0])
	_ihm.montrer_selection(str(_noms.get(objet["unite"], objet["unite"])), "  ·  ".join(portees), _icones.get(objet["unite"]))


func _ecrire_vecteurs() -> void:
	var rejeu: Rejeu = hote.rejeu
	var parties: Dictionary = {}
	var etats: Dictionary = {}
	var munitions := 0
	for id in _selection.ids:
		var unite: String = rejeu.statique["vecteurs"][id]["unite"]
		parties[unite] = int(parties.get(unite, 0)) + 1
		var k := id * rejeu.largeur_vecteurs
		munitions += int(_vecteurs[k + Rejeu.MUNITIONS])
		var etat: String = rejeu.entete["etats"]["vecteurs"][int(_vecteurs[k + Rejeu.ETAT])]
		etats[etat] = int(etats.get(etat, 0)) + 1
	var premiere: String = parties.keys()[0]
	var types: Array[String] = []
	for unite: String in parties:
		types.append("%d × %s" % [parties[unite], _noms.get(unite, unite)])
	var nom := " ; ".join(types)
	var repartition: Array[String] = []
	for etat: String in etats:
		repartition.append("%d %s" % [etats[etat], etat])
	_ihm.montrer_selection(nom, "Munitions : %d\n%s" % [munitions, ", ".join(repartition)], _icones.get(premiere))


func _texte_fin() -> String:
	var b := _bilan_fini
	var total := int(hote.rejeu.statique["drones"]["nombre"])
	var arretes := int(b["detruits_air"]) + int(b["detruits_sol"])
	return "RAID TERMINÉ\n\nDrones arrêtés : %d sur %d (%.0f %%)\nFrappes sur les sites : %d\nDétruits : %d air, %d sol\nDurée : %s\n\nN : nouvelle partie" % [arretes, total, 100.0 * arretes / maxi(total, 1), int(b["fuites"]), int(b["detruits_air"]), int(b["detruits_sol"]), _duree(float(b["duree"]))]


func _unhandled_input(evenement: InputEvent) -> void:
	if not hote.pret:
		return
	if evenement is InputEventKey and evenement.pressed and not evenement.echo and evenement.keycode in [KEY_F5, KEY_F6]:
		_changer_mode(Mode.SCENARIO if evenement.keycode == KEY_F5 else Mode.TERRAIN)
		return
	if _mode != Mode.JEU:
		(_editeur if _mode == Mode.SCENARIO else _atelier).traiter(evenement)
		return
	if evenement is InputEventMouseButton:
		_traiter_bouton(evenement)
	elif evenement is InputEventMouseMotion and _appui != Vector2.INF:
		_cadre_ouvert = _cadre_ouvert or _appui.distance_to(evenement.position) > GLISSEMENT_MAX_PX
		_ihm.poser_cadre(Rect2(_appui, evenement.position - _appui) if _cadre_ouvert else Rect2())
	elif evenement is InputEventKey and evenement.pressed and not evenement.echo:
		_traiter_touche(evenement)


func _traiter_bouton(evenement: InputEventMouseButton) -> void:
	if evenement.button_index == MOUSE_BUTTON_RIGHT:
		if evenement.pressed:
			_appui_droit = evenement.position
		elif _appui_droit.distance_to(evenement.position) <= GLISSEMENT_MAX_PX:
			_ordonner_vers(evenement.position)
	elif evenement.button_index == MOUSE_BUTTON_LEFT:
		if evenement.pressed:
			_appui = evenement.position
			_cadre_ouvert = false
			if evenement.double_click:
				_selectionner_meme_type(evenement.position)
		elif _appui != Vector2.INF:
			_conclure_selection(evenement.position, evenement.shift_pressed)
			_appui = Vector2.INF
			_cadre_ouvert = false
			_ihm.poser_cadre(Rect2())


## Rendre {id: position à l'écran} des vecteurs en état de recevoir un ordre et visibles.
func _vecteurs_a_l_ecran() -> Dictionary:
	var points: Dictionary = {}
	var nombre: int = _vecteurs.size() / hote.rejeu.largeur_vecteurs
	for id in nombre:
		if _est_perdu(id):
			continue
		var point := _point_vecteur(id)
		if not hote.camera.is_position_behind(point):
			points[id] = hote.camera.unproject_position(point)
	return points


func _conclure_selection(position_fin: Vector2, ajout: bool) -> void:
	if _cadre_ouvert:
		_selection.choisir(Selection.dans_cadre(_vecteurs_a_l_ecran(), Rect2(_appui, position_fin - _appui)), ajout)
	else:
		_cliquer(position_fin, ajout)
	if not _selection.ids.is_empty() or _selection.fixe != null:
		_sons.jouer("selection")


func _cliquer(position_clic: Vector2, ajout: bool) -> void:
	var id := Selection.plus_proche(_vecteurs_a_l_ecran(), position_clic, RAYON_CLIC_PX)
	if id >= 0:
		var seul: Array[int] = [id]
		_selection.choisir(seul, ajout)
		return
	var objet: Variant = _fixe_sous(position_clic)
	_selection.vider()
	_selection.fixe = objet


func _fixe_sous(position_clic: Vector2) -> Variant:
	var objets: Array = hote.rejeu.couvertures_a(hote.instant)["objets"]
	var points: Dictionary = {}
	for rang in objets.size():
		var objet: Dictionary = objets[rang]
		if objet["genre"] == "vecteur":
			continue
		var point: Vector3 = hote.point_lieu(objet["lieu"])
		if not hote.camera.is_position_behind(point):
			points[rang] = hote.camera.unproject_position(point)
	var rang := Selection.plus_proche(points, position_clic, RAYON_CLIC_PX)
	return null if rang < 0 else objets[rang]


func _selectionner_meme_type(position_clic: Vector2) -> void:
	var a_l_ecran := _vecteurs_a_l_ecran()
	var id := Selection.plus_proche(a_l_ecran, position_clic, RAYON_CLIC_PX)
	if id < 0:
		return
	var vecteurs: Array = hote.rejeu.statique["vecteurs"]
	var fenetre: Rect2 = hote.get_viewport().get_visible_rect()
	var meme: Array[int] = []
	for autre: int in a_l_ecran:
		if vecteurs[autre]["unite"] == vecteurs[id]["unite"] and fenetre.has_point(a_l_ecran[autre]):
			meme.append(autre)
	meme.sort()
	_selection.choisir(meme)


func _traiter_touche(evenement: InputEventKey) -> void:
	var touche: int = evenement.keycode
	if touche >= KEY_1 and touche <= KEY_9:
		_traiter_groupe(touche - KEY_0, evenement.ctrl_pressed or evenement.meta_pressed)
		return
	match touche:
		KEY_SPACE:
			_liaison.envoyer({"type": "reprendre" if _etat.get("pause", true) else "pause"})
		KEY_KP_ADD, KEY_PLUS, KEY_EQUAL:
			_envoyer_vitesse(1)
		KEY_KP_SUBTRACT, KEY_MINUS:
			_envoyer_vitesse(-1)
		KEY_N:
			_liaison.envoyer({"type": "recommencer"})
		KEY_ESCAPE:
			_selection.vider()
		KEY_B:
			_basculer_brouillard()
		KEY_M:
			_sons.muet = not _sons.muet
		KEY_H:
			_ihm.basculer_aide()
		KEY_F1:
			hote.pilote.mode = PiloteCamera.Mode.STRATEGIE
		KEY_F2:
			hote.pilote.mode = PiloteCamera.Mode.LIBRE
		KEY_F3:
			hote.pilote.mode = PiloteCamera.Mode.SUIVI
		KEY_F4:
			hote.pilote.mode = PiloteCamera.Mode.RADAR
		KEY_A:
			if evenement.ctrl_pressed or evenement.meta_pressed:
				_selectionner_tous()
		_:
			hote.touche_commune(touche)


func _envoyer_vitesse(sens: int) -> void:
	var rang := clampi(hote.rang_vitesse + sens, 0, hote.VITESSES.size() - 1)
	_liaison.envoyer({"type": "vitesse", "valeur": hote.VITESSES[rang]})


func _basculer_brouillard() -> void:
	_brouillard.basculer()
	hote.montrer_inconnus = not _brouillard.actif
	_ihm.annoncer("Brouillard levé : tous les drones sont montrés" if hote.montrer_inconnus else "Brouillard rétabli")


func _selectionner_tous() -> void:
	var tous: Array[int] = []
	for id: int in _vecteurs_a_l_ecran():
		tous.append(id)
	tous.sort()
	_selection.choisir(tous)


func _traiter_groupe(numero: int, memoriser: bool) -> void:
	if memoriser:
		_selection.memoriser(numero)
		_ihm.annoncer("Groupe %d mémorisé" % numero)
		return
	if not _selection.rappeler(numero):
		return
	_sons.jouer("selection")
	var maintenant := Time.get_ticks_msec() / 1000.0
	if _dernier_rappel["numero"] == numero and maintenant - float(_dernier_rappel["instant"]) < RAPPEL_DOUBLE_S and not _selection.ids.is_empty():
		hote.pilote.centrer(_point_vecteur(_selection.ids[0]))
	_dernier_rappel = {"numero": numero, "instant": maintenant}


func _centrer_sur(e: float, n: float) -> void:
	hote.pilote.mode = PiloteCamera.Mode.STRATEGIE
	hote.pilote.centrer(Vector3(e, 0.0, -n))


func _ordonner_vers(ecran: Vector2) -> void:
	var vise: Variant = _point_vise(ecran)
	if vise == null:
		_ihm.annoncer("Viser le sol pour donner un ordre")
		return
	_ordonner_au_point(vise.x, -vise.z)


func _ordonner_au_point(e: float, n: float) -> void:
	if _mode != Mode.JEU:
		return
	var ids: Array[int] = []
	for id in _selection.ids:
		if not _est_perdu(id):
			ids.append(id)
	if ids.is_empty():
		_ihm.annoncer("Aucun vecteur sélectionné")
		return
	if not _liaison.envoyer({"type": "ordre", "avions": ids, "e": e, "n": n}):
		return
	_sons.jouer("ordre")
	var departs := PackedVector3Array()
	for id in ids:
		departs.append(_point_vecteur(id))
	_effets.marquer_ordre(Vector3(e, _hauteur_scene_sol(e, n), -n), departs)


## Passer au mode `voulu`, ou revenir au jeu si l'on y est déjà. Éditer se fait à l'instant initial : la partie y revient.
func _changer_mode(voulu: Mode) -> void:
	var quitte := _mode
	_mode = Mode.JEU if _mode == voulu else voulu
	_selection.vider()
	_editeur.activer(_mode == Mode.SCENARIO)
	_atelier.activer(_mode == Mode.TERRAIN, _terrain_scenario)
	_ihm.mini_carte.visible = _mode != Mode.TERRAIN
	# Le brouillard masquerait le relief qu'on est en train de façonner.
	if (_mode == Mode.TERRAIN) == _brouillard.actif:
		_brouillard.basculer()
	hote.montrer_inconnus = not _brouillard.actif
	if _mode != Mode.JEU and float(_etat.get("t", 0.0)) > 0.0 or quitte == Mode.TERRAIN:
		# En quittant le relief, la nouvelle ouverture remet le sol du scénario.
		_liaison.envoyer({"type": "recommencer"})
	_ihm.annoncer({Mode.JEU: "Mode jeu", Mode.SCENARIO: "Édition du scénario", Mode.TERRAIN: "Édition du relief"}[_mode])


## Envoyer une commande au serveur ; rendre faux si la liaison est coupée.
func envoyer(commande: Dictionary) -> bool:
	return _liaison.envoyer(commande)


## Rendre le point de scène du sol en (`e`, `n`).
func point_sol(e: float, n: float) -> Vector3:
	return Vector3(e, _hauteur_scene_sol(e, n), -n)


## Rendre le point (e, n) du sol visé par le pixel `ecran`, ou null.
func vise(ecran: Vector2) -> Variant:
	var point: Variant = _point_vise(ecran)
	return null if point == null else Vector2(point.x, -point.z)


## Rendre la caméra de la scène.
func camera() -> Camera3D:
	return hote.camera


## Rendre l'interface à l'écran.
func ihm() -> Ihm:
	return _ihm


## Rendre le sol en grille, pour le pinceau de l'éditeur de relief.
func sol() -> SolGrille:
	return _sol


## Rendre le point du sol sous le pixel `ecran`, ou null si le rayon ne descend pas vers le sol.
func _point_vise(ecran: Vector2) -> Variant:
	var origine: Vector3 = hote.camera.project_ray_origin(ecran)
	var direction: Vector3 = hote.camera.project_ray_normal(ecran)
	if direction.y >= -1e-3:
		return null
	var hauteur := 0.0
	var point := origine
	for passe in PASSES_VISEE:
		point = origine + direction * (hauteur - origine.y) / direction.y
		hauteur = _hauteur_scene_sol(point.x, -point.z)
	return point


## Rendre la hauteur de scène du sol en (e, n) : celle de principal.point pour une altitude nulle.
func _hauteur_scene_sol(e: float, n: float) -> float:
	if hote.terrain == null:
		return 0.0
	var courbure := 0.0 if hote.terrain.est_plat() else (e * e + n * n) / (2.0 * RAYON_TERRE)
	return hote.terrain.hauteur_sol(e, n) - courbure
