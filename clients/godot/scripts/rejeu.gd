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


## Charger le fichier `chemin` ; rendre "" ou le message d'erreur.
func charger(chemin: String) -> String:
	var octets := FileAccess.get_file_as_bytes(chemin)
	if octets.is_empty():
		return "fichier illisible : %s" % chemin
	var texte := octets.decompress_dynamic(TAILLE_MAX_DECOMPRESSEE, FileAccess.COMPRESSION_GZIP).get_string_from_utf8()
	var lignes := texte.split("\n", false)
	if lignes.is_empty():
		return "fichier vide : %s" % chemin
	var erreur := _lire_entete(lignes[0])
	if erreur != "":
		return erreur
	for rang in range(1, lignes.size()):
		var objet: Variant = JSON.parse_string(lignes[rang])
		if not objet is Dictionary:
			return "ligne %d illisible" % (rang + 1)
		_ranger(objet)
	return "" if not bilan.is_empty() else "fichier tronqué : pas de ligne de bilan"


func _lire_entete(ligne: String) -> String:
	var objet: Variant = JSON.parse_string(ligne)
	if not objet is Dictionary or objet.get("format") != FORMAT:
		return "pas un fichier de rejeu"
	if int(objet["version"]) != VERSION:
		return "version de rejeu %d non prise en charge" % int(objet["version"])
	if objet["colonnes"]["drones"] != COLONNES_POSITION:
		return "colonnes inattendues : %s" % str(objet["colonnes"]["drones"])
	entete = objet
	largeur_drones = entete["colonnes"]["drones"].size()
	largeur_vecteurs = entete["colonnes"]["vecteurs"].size()
	return ""


func _ranger(objet: Dictionary) -> void:
	match objet["genre"]:
		"statique":
			statique = objet
		"bilan":
			bilan = objet
		"evenement":
			_noter_evenement(objet)
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


## Rendre le rang de l'image qui précède `t`, sans jamais désigner la dernière : l'image suivante existe toujours.
func rang_image(t: float) -> int:
	return clampi(instants.bsearch(t, false) - 1, 0, maxi(instants.size() - 2, 0))


## Rendre la fraction de `t` entre l'image `rang` et la suivante, de 0 à 1.
func fraction(rang: int, t: float) -> float:
	if instants.size() < 2:
		return 0.0
	return clampf((t - instants[rang]) / (instants[rang + 1] - instants[rang]), 0.0, 1.0)


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
