extends RefCounted
## Sélection du joueur et groupes mémorisés. Sans nœud ni écran : tout se vérifie par scripts/jeu/verifier_jeu.gd.

const GROUPES_MAX := 9

var ids: Array[int] = []
## Objet fixe inspecté (radar ou poste, ligne de `couvertures`), ou null.
var fixe: Variant = null
var _groupes: Dictionary = {}


## Rendre les clés de `points` ({id: Vector2}) dont la position est dans `cadre`, triées.
static func dans_cadre(points: Dictionary, cadre: Rect2) -> Array[int]:
	var trouves: Array[int] = []
	for id: int in points:
		if cadre.abs().has_point(points[id]):
			trouves.append(id)
	trouves.sort()
	return trouves


## Rendre la clé de `points` la plus proche de `position` à moins de `rayon` px, ou -1.
static func plus_proche(points: Dictionary, position: Vector2, rayon: float) -> int:
	var retenu := -1
	var meilleur := rayon
	for id: int in points:
		var distance: float = position.distance_to(points[id])
		if distance <= meilleur:
			meilleur = distance
			retenu = id
	return retenu


## Remplacer la sélection par `choisis`, ou les y ajouter si `ajout` ; un objet fixe inspecté cède la place.
func choisir(choisis: Array[int], ajout := false) -> void:
	fixe = null
	if not ajout:
		ids = choisis.duplicate()
		return
	for id in choisis:
		if not ids.has(id):
			ids.append(id)


## Tout désélectionner.
func vider() -> void:
	ids.clear()
	fixe = null


## Mémoriser la sélection dans le groupe `numero` (1 à 9).
func memoriser(numero: int) -> void:
	_groupes[numero] = ids.duplicate()


## Rappeler le groupe `numero` ; rendre faux s'il est vide, sans toucher la sélection.
func rappeler(numero: int) -> bool:
	if not _groupes.has(numero) or _groupes[numero].is_empty():
		return false
	var groupe: Array[int] = []
	groupe.assign(_groupes[numero])
	choisir(groupe)
	return true


## Oublier les groupes : ils citent les vecteurs d'une partie précédente.
func oublier_groupes() -> void:
	_groupes.clear()
	vider()
