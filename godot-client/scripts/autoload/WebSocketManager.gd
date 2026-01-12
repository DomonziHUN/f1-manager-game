extends Node

# WebSocket connection
var websocket: WebSocketPeer
var websocket_url = "ws://localhost:3000"
var is_connected = false
var is_authenticated = false
var connection_timeout = 10.0
var connection_timer = 0.0

# Reconnection
var reconnect_timer: Timer
var reconnect_attempts = 0
var max_reconnect_attempts = 5

# Signals
signal connected()
signal disconnected()
signal authenticated(user_data: Dictionary)
signal auth_error(error: String)

# Matchmaking signals
signal queue_joined(data: Dictionary)
signal queue_left()
signal queue_error(error: String)
signal queue_update(data: Dictionary)
signal match_found(data: Dictionary)

func _ready():
	print("🔌 WebSocketManager initialized")
	
	# Create reconnect timer
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
	print("⏳ WebSocket connection initiated, waiting for response...")

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
	
	print("🔐 Sending authentication with token: " + token.substr(0, 20) + "...")
	
	# Send in the correct wrapper format
	var auth_message = {
		"event": "authenticate",
		"data": {"token": token}
	}
	websocket.send_text(JSON.stringify(auth_message))

func join_queue():
	if not is_authenticated:
		print("❌ Cannot join queue: not authenticated")
		return
	
	print("🎮 Joining matchmaking queue...")
	_send_message("join_queue", {})

func leave_queue():
	if not is_authenticated:
		print("❌ Cannot leave queue: not authenticated")
		return
	
	print("🚪 Leaving matchmaking queue...")
	_send_message("leave_queue", {})

func find_match():
	if not is_authenticated:
		print("❌ Cannot find match: not authenticated")
		return
	
	print("🔍 Requesting match search...")
	_send_message("find_match", {})

func _process(delta):
	if websocket:
		websocket.poll()
		var state = websocket.get_ready_state()
		
		match state:
			WebSocketPeer.STATE_CONNECTING:
				connection_timer += delta
				if connection_timer > connection_timeout:
					print("❌ WebSocket connection timeout after " + str(connection_timeout) + " seconds")
					_handle_connection_error()
					return
				
				# Debug: print every 2 seconds while connecting
				if int(connection_timer) % 2 == 0 and connection_timer - delta < int(connection_timer):
					print("⏳ Still connecting... (" + str(int(connection_timer)) + "s)")
			
			WebSocketPeer.STATE_OPEN:
				if not is_connected:
					_handle_connection_success()
				
				# Process incoming messages
				while websocket.get_available_packet_count():
					var packet = websocket.get_packet()
					var message_text = packet.get_string_from_utf8()
					print("📥 Raw message: " + message_text)
					_handle_message(message_text)
			
			WebSocketPeer.STATE_CLOSING:
				print("🔄 WebSocket closing...")
			
			WebSocketPeer.STATE_CLOSED:
				var close_code = websocket.get_close_code()
				var close_reason = websocket.get_close_reason()
				print("❌ WebSocket closed. Code: " + str(close_code) + ", Reason: " + close_reason)
				if is_connected:
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
	
	# Clean up old connection
	if websocket:
		websocket.close()
	
	# Wait before reconnecting
	reconnect_timer.start()

func _send_message(event: String, data: Dictionary):
	if not is_connected:
		print("❌ Cannot send message: not connected")
		return
	
	var message = {
		"event": event,
		"data": data
	}
	
	var json_string = JSON.stringify(message)
	websocket.send_text(json_string)
	print("📤 Sent: " + event)

func _handle_message(message_text: String):
	var json = JSON.new()
	var parse_result = json.parse(message_text)
	
	if parse_result != OK:
		print("❌ Failed to parse JSON: " + message_text)
		return
	
	var data = json.data
	print("📨 Parsed data: " + str(data))
	
	# Handle different message types based on Socket.IO format
	if data.has("message"):
		# Welcome message or similar
		print("💬 Server message: " + str(data.message))
	elif data.has("success"):
		# Authentication response format
		if data.success:
			is_authenticated = true
			print("✅ Authentication successful")
			authenticated.emit(data)
		else:
			print("❌ Authentication failed: " + str(data.get("error", "Unknown error")))
			auth_error.emit(str(data.get("error", "Unknown error")))
	elif data.has("event"):
		# Wrapper formátum: {"event": "queue_joined", "data": {...}}
		var event = data.get("event", "")
		var payload = data.get("data", {})
		_handle_event(event, payload)
	else:
		# Közvetlen Socket.IO emit formátum
		# Próbáljuk kitalálni az event típusát a tartalom alapján
		if data.has("queueId"):
			# queue_joined event
			print("✅ Joined matchmaking queue")
			queue_joined.emit(data)
		elif data.has("matchId"):
			# match_found event
			print("🎉 Match found!")
			match_found.emit(data)
		elif data.has("playersInQueue"):
			# queue_update event
			print("📊 Queue update: " + str(data))
			queue_update.emit(data)
		elif data.has("error"):
			# Error event
			var error = data.get("error", "Unknown error")
			print("❌ Error: " + error)
			queue_error.emit(error)
		else:
			print("⚠️ Unknown message format: " + str(data))

func _handle_event(event: String, payload: Dictionary):
	match event:
		"welcome":
			print("💬 Server welcome: " + str(payload.get("message", "")))
			# Don't emit signal, just log
		
		"error":
			var error = payload.get("error", "Unknown error")
			print("❌ Server error: " + error)
			# Handle as queue error for now
			queue_error.emit(error)
		
		"authenticated":
			is_authenticated = true
			print("✅ WebSocket authentication successful")
			authenticated.emit(payload)
		
		"auth_error":
			is_authenticated = false
			var error = payload.get("error", "Unknown auth error")
			print("❌ WebSocket authentication failed: " + error)
			auth_error.emit(error)
		
		"queue_joined":
			print("✅ Joined matchmaking queue")
			queue_joined.emit(payload)
		
		"queue_left":
			print("✅ Left matchmaking queue")
			queue_left.emit()
		
		"queue_error":
			var error = payload.get("error", "Unknown queue error")
			print("❌ Queue error: " + error)
			queue_error.emit(error)
		
		"queue_update":
			print("📊 Queue update: " + str(payload))
			queue_update.emit(payload)
		
		"match_found":
			print("🎉 Match found!")
			match_found.emit(payload)
		
		_:
			print("⚠️ Unknown WebSocket event: " + event)