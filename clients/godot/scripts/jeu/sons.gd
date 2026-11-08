extends Node
## Sons du jeu, synthétisés au lancement : aucun fichier à livrer, et rien d'emprunté à un autre jeu.

const FREQUENCE := 22_050
const VOIX := 12
const VOLUME_DB := -12.0
# Montée et descente du volume, en part de la durée : sans elles, un son coupé net claque.
const ATTAQUE := 0.02
const CHUTE := 0.2
# Écart minimal (s) entre deux occurrences : un raid tire des centaines de coups, le son deviendrait un bruit continu.
const ECARTS := {"tir": 0.07, "explosion": 0.12, "impact": 0.5, "alerte": 3.0, "ordre": 0.1, "selection": 0.05}

var muet := false
var _voix: Array[AudioStreamPlayer] = []
var _flux: Dictionary = {}
var _dernier: Dictionary = {}
var _hasard := RandomNumberGenerator.new()


func _ready() -> void:
	_hasard.seed = 1
	_flux = {
		"tir": _flux_depuis(_bruit_sec(0.09)), "explosion": _flux_depuis(_grondement(0.55, 0.985)), "impact": _flux_depuis(_grondement(1.1, 0.993)),
		"alerte": _flux_depuis(_deux_tons(740.0, 988.0, 0.16)), "ordre": _flux_depuis(_glissando(1000.0, 1500.0, 0.09)), "selection": _flux_depuis(_glissando(900.0, 900.0, 0.04)),
	}
	for rang in VOIX:
		var voix := AudioStreamPlayer.new()
		voix.volume_db = VOLUME_DB
		add_child(voix)
		_voix.append(voix)


## Jouer le son `nom` si son écart minimal est passé.
func jouer(nom: String) -> void:
	var maintenant := Time.get_ticks_msec() / 1000.0
	if muet or maintenant - float(_dernier.get(nom, -100.0)) < float(ECARTS[nom]):
		return
	_dernier[nom] = maintenant
	for voix in _voix:
		if not voix.playing:
			voix.stream = _flux[nom]
			voix.play()
			return


func _flux_depuis(echantillons: PackedFloat32Array) -> AudioStreamWAV:
	var octets := PackedByteArray()
	octets.resize(echantillons.size() * 2)
	for rang in echantillons.size():
		octets.encode_s16(rang * 2, int(clampf(echantillons[rang], -1.0, 1.0) * 32_767.0))
	var flux := AudioStreamWAV.new()
	flux.format = AudioStreamWAV.FORMAT_16_BITS
	flux.mix_rate = FREQUENCE
	flux.data = octets
	return flux


# Dérivée de bruit blanc : aigu et bref, comme un départ de coup.
func _bruit_sec(duree: float) -> PackedFloat32Array:
	var n := int(duree * FREQUENCE)
	var sortie := PackedFloat32Array()
	sortie.resize(n)
	var precedent := 0.0
	for i in n:
		var blanc := _hasard.randf_range(-1.0, 1.0)
		sortie[i] = (blanc - precedent) * 0.5 * exp(-5.0 * float(i) / n)
		precedent = blanc
	return sortie


# Bruit filtré par intégration : `rappel` proche de 1 donne un son plus sourd.
func _grondement(duree: float, rappel: float) -> PackedFloat32Array:
	var n := int(duree * FREQUENCE)
	var sortie := PackedFloat32Array()
	sortie.resize(n)
	var filtre := 0.0
	for i in n:
		filtre = rappel * filtre + (1.0 - rappel) * _hasard.randf_range(-1.0, 1.0)
		sortie[i] = filtre * (1.0 / sqrt(1.0 - rappel)) * 0.35 * exp(-4.0 * float(i) / n)
	return sortie


func _deux_tons(f1: float, f2: float, duree: float) -> PackedFloat32Array:
	var sortie := _glissando(f1, f1, duree)
	sortie.append_array(_glissando(f2, f2, duree))
	return sortie


func _glissando(f1: float, f2: float, duree: float) -> PackedFloat32Array:
	var n := int(duree * FREQUENCE)
	var sortie := PackedFloat32Array()
	sortie.resize(n)
	var phase := 0.0
	for i in n:
		var part := float(i) / n
		phase += TAU * lerpf(f1, f2, part) / FREQUENCE
		sortie[i] = sin(phase) * 0.4 * minf(1.0, (1.0 - part) / CHUTE) * minf(1.0, part / ATTAQUE)
	return sortie
