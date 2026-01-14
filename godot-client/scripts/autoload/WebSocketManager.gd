extends Node

# =========================
# ÁLLAPOT VÁLTOZÓK
# =========================
var socket: WebSocketPeer = WebSocketPeer.new()

var is_connected: bool = false   # ← kapcsolat állapot
var is_authenticated: bool = false

var ws_url: String = "ws://localhost:3000"
var auth_token: String = ""

# =========================
# SIGNALOK
# =========================

# EREDETI SIGNAL NEVEK – ezekre figyelnek a kontrollerek
signal connected()                         # MatchmakingController ezt várja
signal disconnected()                      # MatchmakingController ezt várja
signal authenticated(user_data: Dictionary)  # MatchmakingController ezt várja
signal auth_error(error_message: String)

# Matchmaking
signal queue_joined(data: Dictionary)
signal queue_left()
signal queue_update(data: Dictionary)
signal queue_error(error_message: String)
signal match_found(match_data: Dictionary)

# Quali / prep
signal race_preparation_update(data: Dictionary)
signal qualifying_start(data: Dictionary)
signal qualifying_results(data: Dictionary)
signal weather_update(data: Dictionary)

# Verseny
signal race_prepare(data: Dictionary)
signal race_countdown(data: Dictionary)
signal race_start(data: Dictionary)
signal race_state(state: Dictionary)
signal race_event(event: Dictionary)
signal race_end(results: Dictionary)
signal race_player_disconnected(data: Dictionary)

func _ready() -> void:
	set_process(true)
	print("📡 WebSocketManager initialized")

func _process(_delta: float) -> void:
	socket.poll()

	var state := socket.get_ready_state()

	# Kapcsolat elveszett
	if state == WebSocketPeer.STATE_CLOSED:
		if is_connected:
			is_connected = false
			is_authenticated = false
			disconnected.emit()
			print("❌ WebSocket connection lost")
		return

	# Kapcsolat létrejött
	if state == WebSocketPeer.STATE_OPEN:
		if not is_connected:
			is_connected = true
			connected.emit()
			print("✅ WebSocket connected")

		while socket.get_available_packet_count() > 0:
			var packet: PackedByteArray = socket.get_packet()
			var json_string := packet.get_string_from_utf8()

			var json := JSON.new()
			var err := json.parse(json_string)
			if err == OK:
				var data: Variant = json.data
				if typeof(data) == TYPE_DICTIONARY:
					_handle_message(data)
				else:
					print("⚠️ Received non-dictionary JSON")
			else:
				print("❌ JSON parse error: ", json_string)

# =========================
# KAPCSOLATKEZELÉS
# =========================

func connect_to_server() -> void:
	print("🔌 Connecting to: ", ws_url)
	var err := socket.connect_to_url(ws_url)
	if err != OK:
		print("❌ Connection failed: ", err)
		disconnected.emit()

func disconnect_from_server() -> void:
	socket.close()
	is_connected = false
	is_authenticated = false
	print("🔌 Disconnected from server")

func is_ws_connected() -> bool:
	return is_connected and socket.get_ready_state() == WebSocketPeer.STATE_OPEN

# =========================
# ÜZENET KÜLDÉS
# =========================

func _send_message(event: String, data: Dictionary = {}) -> void:
	if not is_ws_connected():
		print("⚠️ Cannot send message, not connected")
		return

	var message := {
		"event": event,
		"data": data
	}

	var json_string := JSON.stringify(message)
	var err := socket.send_text(json_string)
	if err != OK:
		print("❌ Failed to send message: ", err)
	else:
		print("📤 Sent: ", event)

# =========================
# BEJÖVŐ ÜZENET KEZELÉSE
# =========================

func _handle_message(message: Dictionary) -> void:
	var event: String = str(message.get("event", ""))
	var data: Dictionary = message.get("data", {})

	print("📥 Received event: ", event)

	match event:
		"welcome":
			print("👋 Welcome: ", data)

		"authenticated":
			is_authenticated = true
			authenticated.emit(data)
			print("✅ Authenticated")

		"auth_error":
			var err_text := str(data.get("error", "Unknown auth error"))
			auth_error.emit(err_text)

		# MATCHMAKING
		"queue_joined":
			queue_joined.emit(data)

		"queue_left":
			queue_left.emit()

		"queue_update":
			queue_update.emit(data)

		"queue_error":
			var qerr := str(data.get("error", "Unknown queue error"))
			queue_error.emit(qerr)

		"match_found":
			match_found.emit(data)
			print("🎮 Match found")

		# RACE PREP / QUALI
		"race_preparation_update":
			race_preparation_update.emit(data)

		"qualifying_start":
			qualifying_start.emit(data)

		"qualifying_results":
			qualifying_results.emit(data)

		"weather_update":
			weather_update.emit(data)

		# RACE
		"race:prepare", "race_prepare":
			race_prepare.emit(data)

		"race:countdown", "race_countdown":
			race_countdown.emit(data)

		"race:start", "race_start":
			race_start.emit(data)

		"race:state", "race_state":
			race_state.emit(data)

		"race:event", "race_event":
			race_event.emit(data)

		"race:end", "race_end":
			race_end.emit(data)

		"race:player_disconnected", "race_player_disconnected":
			race_player_disconnected.emit(data)

		"error":
			print("❌ Server error: ", data.get("error", "Unknown"))

		_:
			print("⚠️ Unknown event: ", event)

# =========================
# AUTH
# =========================

func authenticate(token: String) -> void:
	auth_token = token
	_send_message("authenticate", {"token": token})

# =========================
# MATCHMAKING API
# =========================

func join_queue() -> void:
	_send_message("join_queue", {})

func leave_queue() -> void:
	_send_message("leave_queue", {})

func find_match() -> void:
	_send_message("find_match", {})

# =========================
# QUALI / PREP
# =========================

func send_race_preparation(data: Dictionary) -> void:
	_send_message("race_preparation", data)

func request_qualifying_results(match_id: String) -> void:
	_send_message("request_qualifying_results", {"matchId": match_id})

# =========================
# RACE COMMANDS
# =========================

func join_race(race_id: String) -> void:
	print("🏁 Joining race: ", race_id)
	_send_message("race_join", {
		"raceId": race_id,
		"matchId": race_id
	})

func leave_race() -> void:
	_send_message("race_leave", {})

func send_pit_stop(car_id: String, new_compound: String = "medium") -> void:
	print("🛑 Pit stop requested for: ", car_id, " Tire: ", new_compound)
	_send_message("race_command", {
		"carId": car_id,
		"command": {
			"type": "PIT",
			"compound": new_compound
		}
	})

func send_ers_mode(car_id: String, mode: String) -> void:
	print("🔋 ERS mode change: ", car_id, " Mode: ", mode)
	_send_message("race_command", {
		"carId": car_id,
		"command": {
			"type": "ERS_MODE",
			"mode": mode
		}
	})
