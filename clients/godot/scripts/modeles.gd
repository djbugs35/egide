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

var _table: Dictionary = {}
var _catalogue: Dictionary = {}
var _maillages: Dictionary = {}


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
	if icone != null and _table["icones"].has(icone):
		return _table["icones"][icone]
	return _table["familles"].get(fiche.get("famille", ""), MODELE_SECOURS)


## Rendre le nom du modèle d'une icône (sites et centres n'ont pas d'unité).
func modele_icone(icone: String) -> String:
	return _table["icones"].get(icone, MODELE_SECOURS)


## Rendre le maillage du modèle `nom`, construit une fois.
func maillage(nom: String) -> Mesh:
	if not _maillages.has(nom):
		_maillages[nom] = _construire(nom)
	return _maillages[nom]


static func _construire(nom: String) -> Mesh:
	if VOLANTS.has(nom):
		return _fleche(VOLANTS[nom][0], VOLANTS[nom][1])
	var boite := BoxMesh.new()
	boite.size = AU_SOL.get(nom, Vector3.ONE)
	return boite


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
