extends Node

var websocket: WebSocketPeer
var websocket_url = "ws://localhost:3000"
var is_connected = false
var is_authenticated = false
var connection_timeout = 10.0
var connection_timer = 0.0

var reconnect_timer: Timer
var reconnect_attempts = 0
var max_reconnect_attempts = 5

signal connected()
signal disconnected()
signal authenticated(user_data: Dictionary)
signal auth_error(error: String)

# Matchmaking
signal queue_joined(data: Dictionary)
signal queue_left()
signal queue_error(error: String)
signal queue_update(data: Dictionary)
signal match_found(data: Dictionary)

# Race / quali
signal race_preparation_update(data: Dictionary)
signal qualifying_start(data: Dictionary)
signal weather_update(data: Dictionary)
signal race_start(data: Dictionary)
signal race_update(data: Dictionary)
signal race_finished(data: Dictionary)
signal qualifying_results(data: Dictionary)   # ÚJ

func _ready():
	print("🔌 WebSocketManager initialized")
	reconnect_timer = Timer.new()
	reconnect_timer.wait_time = 3.0
	reconnect_timer.timeout.connect(_attempt_reconnect)
	add_child(reconnect_timer)

func connect_to_server():
	if is_connected:
		print("⚠️ Already connected to WebSocket")
		return
	print("🔌 Connecting to WebSocket: " + websocket_url)
	websocket = WebSocketPeer.new()
	var error = websocket.connect_to_url(websocket_url)
	if error != OK:
		print("❌ Failed to initiate WebSocket connection: " + str(error))
		_handle_connection_error()
		return
	connection_timer = 0.0

func disconnect_from_server():
	if websocket:
		websocket.close()
	is_connected = false
	is_authenticated = false
	reconnect_timer.stop()
	print("🔌 Disconnected from WebSocket")
	disconnected.emit()

func authenticate(token: String):
	if not is_connected:
		print("❌ Cannot authenticate: not connected")
		return
	print("🔐 Sending authentication...")
	var auth_message = {
		"event": "authenticate",
		"data": {"token": token}
	}
	websocket.send_text(JSON.stringify(auth_message))

# Matchmaking helpers
func join_queue():
	if not is_authenticated:
		print("❌ Cannot join queue: not authenticated")
		return
	_send_message("join_queue", {})

func leave_queue():
	if not is_authenticated:
		print("❌ Cannot leave queue: not authenticated")
		return
	_send_message("leave_queue", {})

func find_match():
	if not is_authenticated:
		print("❌ Cannot find match: not authenticated")
		return
	_send_message("find_match", {})

# Qualifying helper
func request_qualifying_results(match_id: String):
	if not is_authenticated:
		print("❌ Cannot request qualifying results: not authenticated")
		return
	print("🏁 Requesting qualifying results for match: " + match_id)
	_send_message("request_qualifying_results", {"matchId": match_id})

func _process(delta):
	if websocket:
		websocket.poll()
		var state = websocket.get_ready_state()

		match state:
			WebSocketPeer.STATE_CONNECTING:
				connection_timer += delta
				if connection_timer > connection_timeout:
					print("❌ WebSocket connection timeout")
					_handle_connection_error()
					return
			WebSocketPeer.STATE_OPEN:
				if not is_connected:
					_handle_connection_success()
				while websocket.get_available_packet_count():
					var packet = websocket.get_packet()
					var message_text = packet.get_string_from_utf8()
					print("📥 Raw message: " + message_text)
					_handle_message(message_text)
			WebSocketPeer.STATE_CLOSING:
				pass
			WebSocketPeer.STATE_CLOSED:
				if is_connected:
					print("❌ WebSocket closed")
					_handle_connection_lost()

func _handle_connection_success():
	is_connected = true
	reconnect_attempts = 0
	reconnect_timer.stop()
	connection_timer = 0.0
	print("✅ WebSocket connected successfully!")
	connected.emit()

func _handle_connection_lost():
	is_connected = false
	is_authenticated = false
	print("❌ WebSocket connection lost")
	disconnected.emit()
	_attempt_reconnect()

func _handle_connection_error():
	print("❌ WebSocket connection error")
	if websocket:
		websocket.close()
	is_connected = false
	is_authenticated = false
	_attempt_reconnect()

func _attempt_reconnect():
	if reconnect_attempts >= max_reconnect_attempts:
		print("❌ Max reconnection attempts reached")
		return
	reconnect_attempts += 1
	print("🔄 Attempting to reconnect... (" + str(reconnect_attempts) + "/" + str(max_reconnect_attempts) + ")")
	if websocket:
		websocket.close()
	reconnect_timer.start()

func _send_message(event: String, data: Dictionary):
	if not is_connected:
		print("❌ Cannot send message: not connected")
		return
	var message = { "event": event, "data": data }
	websocket.send_text(JSON.stringify(message))
	print("📤 Sent: " + event)

func _handle_message(message_text: String):
	var json = JSON.new()
	var parse_result = json.parse(message_text)
	if parse_result != OK:
		print("❌ Failed to parse JSON: " + message_text)
		return
	var data = json.data
	print("📨 Parsed data: " + str(data))

	if data.has("event"):
		var event = data.get("event", "")
		var payload = data.get("data", {})
		_handle_event(event, payload)
	elif data.has("success"):
		# legacy auth response
		if data.success:
			is_authenticated = true
			authenticated.emit(data)
		else:
			auth_error.emit(str(data.get("error", "Unknown error")))
	else:
		print("⚠️ Unknown message format: " + str(data))

func _handle_event(event: String, payload: Dictionary):
	match event:
		"welcome":
			print("💬 Server welcome: " + str(payload.get("message", "")))

		"error":
			var err = payload.get("error", "Unknown error")
			print("❌ Server error: " + err)
			queue_error.emit(err)

		"authenticated":
			is_authenticated = true
			print("✅ WebSocket authentication successful")
			authenticated.emit(payload)

		"auth_error":
			is_authenticated = false
			var er = payload.get("error", "Unknown auth error")
			print("❌ WebSocket authentication failed: " + er)
			auth_error.emit(er)

		"queue_joined":
			queue_joined.emit(payload)

		"queue_left":
			queue_left.emit()

		"queue_error":
			queue_error.emit(payload.get("error", "Unknown queue error"))

		"queue_update":
			queue_update.emit(payload)

		"match_found":
			match_found.emit(payload)

		"race_preparation_update":
			race_preparation_update.emit(payload)

		"qualifying_start":
			qualifying_start.emit(payload)

		"weather_update":
			weather_update.emit(payload)

		"race_start":
			race_start.emit(payload)

		"race_update":
			race_update.emit(payload)

		"race_finished":
			race_finished.emit(payload)

		"qualifying_results":
			print("🏁 Qualifying results received")
			qualifying_results.emit(payload)

		_:
			print("⚠️ Unknown WebSocket event: " + event)