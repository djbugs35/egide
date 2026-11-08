extends RefCounted
## Liaison WebSocket avec le serveur de partie (src/direct.js, docs/FORMATS.md § 10). Se reconnecte seule si le serveur
## n'est pas encore lancé ou s'il a été relancé.

# Taille par défaut de Godot : 64 Kio, moins qu'une image de 1 000 drones (45 ko) suivie d'un évènement. 16 Mio laissent
# passer plusieurs images d'avance, le temps d'un chargement de terrain.
const TAMPON_OCTETS := 1 << 24
const PAQUETS_EN_ATTENTE := 16384
const DELAI_RECONNEXION_S := 1.0

var _url := ""
var _socket: WebSocketPeer = null
var _attente := 0.0


## Viser le serveur `url` ; la connexion se fait aux appels de recevoir().
func ouvrir(url: String) -> void:
	_url = url
	_connecter()


func _connecter() -> void:
	_socket = WebSocketPeer.new()
	_socket.inbound_buffer_size = TAMPON_OCTETS
	_socket.outbound_buffer_size = TAMPON_OCTETS
	_socket.max_queued_packets = PAQUETS_EN_ATTENTE
	if _socket.connect_to_url(_url) != OK:
		_socket = null


## Rendre vrai si le serveur répond.
func est_connectee() -> bool:
	return _socket != null and _socket.get_ready_state() == WebSocketPeer.STATE_OPEN


## Rendre les enregistrements arrivés depuis le dernier appel ; `delta` (s) rythme les tentatives de reconnexion.
func recevoir(delta: float) -> Array[Dictionary]:
	var messages: Array[Dictionary] = []
	if _socket == null or _socket.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		_attente += delta
		if _attente >= DELAI_RECONNEXION_S:
			_attente = 0.0
			_connecter()
		return messages
	_socket.poll()
	while _socket.get_available_packet_count() > 0:
		var objet: Variant = JSON.parse_string(_socket.get_packet().get_string_from_utf8())
		if objet is Dictionary:
			messages.append(objet)
	return messages


## Envoyer une commande ; rendre faux si la liaison est coupée.
func envoyer(commande: Dictionary) -> bool:
	return est_connectee() and _socket.send_text(JSON.stringify(commande)) == OK
