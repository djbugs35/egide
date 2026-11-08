extends RefCounted
## Lit un fichier .egide-rejeu (docs/FORMATS.md § 6). Égide reste l'autorité : le client relit, il ne simule rien.

const FORMAT := "egide-rejeu"
const VERSION := 1
# Le rejeu de référence fait 86 Mo une fois décompressé : 1 Gio laisse de la marge sans accepter n'importe quoi.
const TAILLE_MAX_DECOMPRESSEE := 1 << 30
const COLONNES_POSITION := ["id", "e", "n", "u", "alt", "cap_deg", "etat"]
const ID := 0
const E := 1
const N := 2
const U := 3
const ALT := 4
const CAP := 5
const ETAT := 6
const MUNITIONS := 7
const NOMBRE_INSTANTS_CONTROLE := 25

var entete: Dictionary = {}
var statique: Dictionary = {}
var bilan: Dictionary = {}
var evenements: Array[Dictionary] = []
var instants := PackedFloat64Array()
var drones: Array[PackedFloat32Array] = []
var vecteurs: Array[PackedFloat32Array] = []
var postes: Array[PackedInt32Array] = []
var largeur_drones := 0
var largeur_vecteurs := 0
var instants_impacts := PackedFloat64Array()
var instants_detruits_air := PackedFloat64Array()
var instants_detruits_sol := PackedFloat64Array()
var instants_couvertures := PackedFloat64Array()
var couvertures: Array[Dictionary] = []


## Charger le fichier `chemin` ; rendre "" ou le message d'erreur.
func charger(chemin: String) -> String:
	var octets := FileAccess.get_file_as_bytes(chemin)
	if octets.is_empty():
		return "fichier illisible : %s" % chemin
	var texte := octets.decompress_dynamic(TAILLE_MAX_DECOMPRESSEE, FileAccess.COMPRESSION_GZIP).get_string_from_utf8()
	var lignes := texte.split("\n", false)
	if lignes.is_empty():
		return "fichier vide : %s" % chemin
	var erreur := _entete_de_ligne(lignes[0])
	if erreur != "":
		return erreur
	for rang in range(1, lignes.size()):
		var objet: Variant = JSON.parse_string(lignes[rang])
		if not objet is Dictionary:
			return "ligne %d illisible" % (rang + 1)
		ajouter(objet)
	return "" if not bilan.is_empty() else "fichier tronqué : pas de ligne de bilan"


func _entete_de_ligne(ligne: String) -> String:
	var objet: Variant = JSON.parse_string(ligne)
	return lire_entete(objet) if objet is Dictionary else "pas un fichier de rejeu"


## Retenir l'en-tête `objet` ; rendre "" ou le message d'erreur.
func lire_entete(objet: Dictionary) -> String:
	if objet.get("format") != FORMAT:
		return "pas un fichier de rejeu"
	if int(objet["version"]) != VERSION:
		return "version de rejeu %d non prise en charge" % int(objet["version"])
	if objet["colonnes"]["drones"] != COLONNES_POSITION:
		return "colonnes inattendues : %s" % str(objet["colonnes"]["drones"])
	entete = objet
	largeur_drones = entete["colonnes"]["drones"].size()
	largeur_vecteurs = entete["colonnes"]["vecteurs"].size()
	return ""


## Ranger un enregistrement du rejeu ou de la liaison en direct, à la suite des précédents.
func ajouter(objet: Dictionary) -> void:
	match objet["genre"]:
		"statique":
			statique = objet
		"bilan":
			bilan = objet
		"evenement":
			_noter_evenement(objet)
		"couvertures":
			instants_couvertures.append(float(objet["t"]))
			couvertures.append(objet)
		"image":
			var t: float = objet["t"]
			instants.append(t)
			drones.append(_aplatir(objet["drones"], largeur_drones))
			vecteurs.append(_aplatir(objet["vecteurs"], largeur_vecteurs))
			postes.append(PackedInt32Array(objet["postes"]))


func _noter_evenement(objet: Dictionary) -> void:
	evenements.append(objet)
	var t: float = objet["t"]
	if objet["type"] == "impact":
		instants_impacts.append(t)
	elif objet["type"] == "tir" and objet["detruit"]:
		if objet["couche"] == "air":
			instants_detruits_air.append(t)
		else:
			instants_detruits_sol.append(t)


# Mémoire : 1,8 million d'échantillons en listes de Variant dépasseraient plusieurs Go.
static func _aplatir(lignes: Array, largeur: int) -> PackedFloat32Array:
	var plat := PackedFloat32Array()
	plat.resize(lignes.size() * largeur)
	var k := 0
	for ligne: Array in lignes:
		for valeur: float in ligne:
			plat[k] = valeur
			k += 1
	return plat


## Ne garder que les `gardees` dernières images et les évènements qu'elles couvrent : une partie en direct n'a pas de fin connue.
func oublier_anciennes(gardees: int) -> void:
	var premiere := instants.size() - gardees
	if premiere <= 0:
		return
	var seuil := instants[premiere]
	instants = instants.slice(premiere)
	drones = drones.slice(premiere)
	vecteurs = vecteurs.slice(premiere)
	postes = postes.slice(premiere)
	var restants: Array[Dictionary] = []
	for evenement in evenements:
		if float(evenement["t"]) >= seuil:
			restants.append(evenement)
	evenements = restants


## Rendre le rang de l'image qui précède `t`, sans jamais désigner la dernière : l'image suivante existe toujours.
func rang_image(t: float) -> int:
	return clampi(instants.bsearch(t, false) - 1, 0, maxi(instants.size() - 2, 0))


## Rendre la fraction de `t` entre l'image `rang` et la suivante, de 0 à 1.
func fraction(rang: int, t: float) -> float:
	if instants.size() < 2:
		return 0.0
	return clampf((t - instants[rang]) / (instants[rang + 1] - instants[rang]), 0.0, 1.0)


## Rendre l'image qui suit le rang `rang`, ou celle-là même s'il n'y en a pas encore (partie en direct, à l'instant initial).
func rang_suivant(rang: int) -> int:
	return mini(rang + 1, instants.size() - 1)


## Rendre les lignes de `a` avancées de la fraction `f` vers `b` ; une entité absente de `b` reste où elle est.
static func interpoler(a: PackedFloat32Array, b: PackedFloat32Array, largeur: int, f: float) -> PackedFloat32Array:
	var sortie := a.duplicate()
	var j := 0
	var k := 0
	while k < a.size():
		var id: float = a[k + ID]
		while j < b.size() and b[j + ID] < id:
			j += largeur
		if j < b.size() and b[j + ID] == id:
			sortie[k + E] = lerpf(a[k + E], b[j + E], f)
			sortie[k + N] = lerpf(a[k + N], b[j + N], f)
			sortie[k + U] = lerpf(a[k + U], b[j + U], f)
			sortie[k + ALT] = lerpf(a[k + ALT], b[j + ALT], f)
			sortie[k + CAP] = rad_to_deg(lerp_angle(deg_to_rad(a[k + CAP]), deg_to_rad(b[j + CAP]), f))
		k += largeur
	return sortie


## Rendre le point de scène de coordonnées locales : (x, y, z) = (e, hauteur, -n), comme le maillage glTF (FORMATS § 7.2).
static func point_scene(e: float, n: float, hauteur: float) -> Vector3:
	return Vector3(e, hauteur, -n)


## Rendre les couvertures en vigueur à l'instant `t`.
func couvertures_a(t: float) -> Dictionary:
	return couvertures[maxi(instants_couvertures.bsearch(t, false) - 1, 0)]


## Rendre le nombre d'instants de `liste` antérieurs ou égaux à `t`.
static func compter_jusqua(liste: PackedFloat64Array, t: float) -> int:
	return liste.bsearch(t, false)


## Rendre le bilan recalculé à partir des seules images et évènements (voir bilan_du_rejeu, src/moteur/rejeu.js).
func bilan_recalcule() -> Dictionary:
	var fuites := PackedInt32Array()
	fuites.resize(statique["sites"].size())
	for evenement in evenements:
		if evenement["type"] == "impact":
			fuites[int(evenement["cible"])] += 1
	var total := 0
	var maximum := 0
	for nombre in fuites:
		total += nombre
		maximum = maxi(maximum, nombre)
	return {
		"fuites": total, "fuites_max_cible": maximum, "detruits_air": instants_detruits_air.size(), "detruits_sol": instants_detruits_sol.size(),
		"munitions_air_restantes": _somme_munitions(vecteurs[-1]), "munitions_sol_restantes": _somme(postes[-1]), "duree": instants[-1],
	}


## Rendre un échantillon d'images pour outils/verifier_client.js : [{t, drones, vecteurs}], points en (e, u, -n) sans le sol.
func images_de_controle() -> Array:
	var images := []
	var saut := maxi(1, instants.size() / NOMBRE_INSTANTS_CONTROLE)
	for rang in range(0, instants.size() - 1, saut):
		images.append({"t": instants[rang], "drones": _points(drones[rang], largeur_drones), "vecteurs": _points(vecteurs[rang], largeur_vecteurs)})
	return images


static func _points(plat: PackedFloat32Array, largeur: int) -> Array:
	var points := []
	var k := 0
	while k < plat.size():
		var p := point_scene(plat[k + E], plat[k + N], plat[k + U])
		points.append([int(plat[k + ID]), p.x, p.y, p.z])
		k += largeur
	return points


func _somme_munitions(plat: PackedFloat32Array) -> int:
	var somme := 0
	var k := MUNITIONS
	while k < plat.size():
		somme += int(plat[k])
		k += largeur_vecteurs
	return somme


static func _somme(valeurs: PackedInt32Array) -> int:
	var somme := 0
	for valeur in valeurs:
		somme += valeur
	return somme
