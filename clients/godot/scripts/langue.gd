extends RefCounted
## Langue du client (jalon 27, docs/PLAN_V3.md) : textes de l'écran tirés de res://langues/<code>.json, que produit
## `node outils/langues.js --godot` à partir des dictionnaires du dépôt (clés godot.*). Anglais par défaut.
##
## Choix, du plus fort au plus faible : `-- --langue <code>` sur la ligne de commande, la variable EGIDE_LANGUE, le choix
## retenu par la touche L (user://langue.cfg), l'anglais. Mêmes règles que src/i18n.js : paramètres {nom}, pluriels
## {"one", "other"} choisis par le paramètre n, repli sur l'anglais, clé absente montrée ⟦clé⟧.
##
## Par preload et non class_name : les noms globaux n'existent qu'après un passage dans l'éditeur.

const LANGUES := ["en", "fr"]
const DEFAUT := "en"
const FICHIER_CHOIX := "user://langue.cfg"

# Statiques : elles survivent au rechargement de la scène qui suit un changement de langue.
static var _code := ""
static var _dico: Dictionary = {}
static var _secours: Dictionary = {}


## Rendre le code de la langue en cours.
static func code() -> String:
	_charger("")
	return _code


## Rendre le texte de `cle` dans la langue en cours, `parametres` remplacés.
static func t(cle: String, parametres: Dictionary = {}) -> String:
	_charger("")
	var valeur: Variant = _dico.get(cle, _secours.get(cle))
	if valeur == null:
		return "⟦%s⟧" % cle
	if valeur is Dictionary:
		valeur = valeur.get(forme(_code, float(parametres.get("n", 0))), valeur.get("other", ""))
	var texte := str(valeur)
	for nom: String in parametres:
		texte = texte.replace("{%s}" % nom, str(parametres[nom]))
	return texte


## Rendre la forme plurielle de `n` dans `langue` : comme Intl.PluralRules pour l'anglais et le français.
static func forme(langue: String, n: float) -> String:
	if langue == "fr":
		return "one" if absf(n) < 2.0 else "other"
	return "one" if n == 1.0 else "other"


## Rendre la langue qui suit celle en cours, pour la touche L.
static func suivante() -> String:
	return LANGUES[(LANGUES.find(code()) + 1) % LANGUES.size()]


## Installer `voulue` aussitôt et la retenir pour les prochains lancements.
static func choisir(voulue: String) -> void:
	if voulue not in LANGUES:
		return
	var reglage := ConfigFile.new()
	reglage.set_value("langue", "code", voulue)
	reglage.save(FICHIER_CHOIX)
	_charger(voulue)


static func _charger(forcee: String) -> void:
	if _code != "" and forcee == "":
		return
	_code = forcee if forcee != "" else _choix_initial()
	_secours = _lire(DEFAUT)
	_dico = _secours if _code == DEFAUT else _lire(_code)


static func _choix_initial() -> String:
	var arguments := OS.get_cmdline_user_args()
	var rang := arguments.find("--langue")
	if rang >= 0 and rang + 1 < arguments.size() and arguments[rang + 1] in LANGUES:
		return arguments[rang + 1]
	var variable := OS.get_environment("EGIDE_LANGUE")
	if variable in LANGUES:
		return variable
	var reglage := ConfigFile.new()
	if reglage.load(FICHIER_CHOIX) == OK and str(reglage.get_value("langue", "code", "")) in LANGUES:
		return str(reglage.get_value("langue", "code"))
	return DEFAUT


static func _lire(langue: String) -> Dictionary:
	var lu: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://langues/%s.json" % langue))
	return lu if lu is Dictionary else {}
