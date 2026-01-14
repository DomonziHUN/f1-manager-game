extends Node

# Backend configuration
const BASE_URL = "http://localhost:3000/api"
const TIMEOUT = 30.0

# Auth endpoints
const AUTH_REGISTER = "/auth/register"
const AUTH_LOGIN = "/auth/login"
const AUTH_VERIFY = "/auth/verify"
const AUTH_ME = "/auth/me"

# Game endpoints
const GAME_GARAGE = "/game/garage"
const GAME_PILOTS_AVAILABLE = "/game/pilots/available"
const GAME_PILOTS_ACTIVATE = "/game/pilots/activate"
const GAME_PILOTS_BUY = "/game/pilots/buy"
const GAME_CAR_EQUIP = "/game/car/equip"
const GAME_LEAGUES = "/game/leagues"

# Matchmaking endpoints
const MATCHMAKING_QUEUE_JOIN = "/matchmaking/queue/join"
const MATCHMAKING_QUEUE_LEAVE = "/matchmaking/queue/leave"
const MATCHMAKING_QUEUE_STATUS = "/matchmaking/queue/status"
const MATCHMAKING_FIND_MATCH = "/matchmaking/find-match"
const MATCHMAKING_MATCH_CURRENT = "/matchmaking/match/current"

# Current auth token
var auth_token: String = ""
var is_authenticated: bool = false

# HTTP client
var http_client: HTTPRequest
var current_endpoint: String = ""

# Signals
signal request_completed(endpoint: String, success: bool, data: Dictionary)
signal auth_changed(authenticated: bool)

func _ready():
	print("🌐 NetworkManager initializing...")
	
	# Create HTTP client with proper setup
	http_client = HTTPRequest.new()
	add_child(http_client)
	
	# Wait for next frame to ensure everything is ready
	await get_tree().process_frame
	
	# Connect signal
	http_client.request_completed.connect(_on_request_completed)
	http_client.timeout = TIMEOUT
	
	# Load saved token
	_load_auth_token()
	
	print("🌐 NetworkManager initialized successfully")

# ==========================================
# AUTH METHODS
# ==========================================

func register(email: String, username: String, password: String):
	var data = {
		"email": email,
		"username": username,
		"password": password
	}
	_make_request("POST", AUTH_REGISTER, data, false)

func login(email: String, password: String):
	var data = {
		"email": email,
		"password": password
	}
	_make_request("POST", AUTH_LOGIN, data, false)

func verify_token():
	if auth_token.is_empty():
		_emit_auth_failed("No token")
		return
	_make_request("GET", AUTH_VERIFY, {}, true)

func get_user_info():
	_make_request("GET", AUTH_ME, {}, true)

func logout():
	auth_token = ""
	is_authenticated = false
	_save_auth_token()
	auth_changed.emit(false)
	print("🚪 Logged out")

# ==========================================
# GAME METHODS
# ==========================================

func get_garage():
	_make_request("GET", GAME_GARAGE, {}, true)

func get_available_pilots():
	_make_request("GET", GAME_PILOTS_AVAILABLE, {}, true)

func activate_pilot(pilot_id: String, slot: int):
	var data = {
		"pilotId": pilot_id,
		"slot": slot
	}
	_make_request("POST", GAME_PILOTS_ACTIVATE, data, true)

func buy_pilot(pilot_id: String, payment_type: String):
	var data = {
		"pilotId": pilot_id,
		"paymentType": payment_type
	}
	_make_request("POST", GAME_PILOTS_BUY, data, true)

func equip_car_part(part_id: String):
	var data = {
		"partId": part_id
	}
	_make_request("POST", GAME_CAR_EQUIP, data, true)

func get_leagues():
	_make_request("GET", GAME_LEAGUES, {}, true)

# ==========================================
# MATCHMAKING METHODS
# ==========================================

func join_queue():
	_make_request("POST", MATCHMAKING_QUEUE_JOIN, {}, true)

func leave_queue():
	_make_request("POST", MATCHMAKING_QUEUE_LEAVE, {}, true)

func get_queue_status():
	_make_request("GET", MATCHMAKING_QUEUE_STATUS, {}, true)

func find_match():
	_make_request("POST", MATCHMAKING_FIND_MATCH, {}, true)

func get_current_match():
	_make_request("GET", MATCHMAKING_MATCH_CURRENT, {}, true)

# ==========================================
# PRIVATE METHODS
# ==========================================

func _make_request(method: String, endpoint: String, data: Dictionary, requires_auth: bool):
	if not http_client:
		print("❌ HTTP client not ready")
		request_completed.emit(endpoint, false, {"error": "HTTP client not ready"})
		return
	
	if requires_auth and not is_authenticated:
		print("❌ Request requires authentication: " + endpoint)
		request_completed.emit(endpoint, false, {"error": "Not authenticated"})
		return
	
	current_endpoint = endpoint
	var url = BASE_URL + endpoint
	var headers = ["Content-Type: application/json"]
	
	if requires_auth and not auth_token.is_empty():
		headers.append("Authorization: Bearer " + auth_token)
	
	var json_data = ""
	if not data.is_empty():
		json_data = JSON.stringify(data)
	
	print("🌐 Making request: " + method + " " + endpoint)
	
	var http_method = HTTPClient.METHOD_GET if method == "GET" else HTTPClient.METHOD_POST
	var error = http_client.request(url, headers, http_method, json_data)
	
	if error != OK:
		print("❌ Request failed: " + str(error))
		request_completed.emit(endpoint, false, {"error": "Request failed: " + str(error)})

func _on_request_completed(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray):
	var endpoint = current_endpoint
	var success = response_code >= 200 and response_code < 300
	var response_text = body.get_string_from_utf8()
	
	print("📡 Response: " + str(response_code) + " - " + endpoint)
	
	var data = {}
	if not response_text.is_empty():
		var json = JSON.new()
		var parse_result = json.parse(response_text)
		if parse_result == OK:
			data = json.data
		else:
			print("❌ Failed to parse JSON: " + response_text)
			data = {"error": "Invalid JSON response"}
	
	# Handle auth responses
	if endpoint in [AUTH_REGISTER, AUTH_LOGIN]:
		if success and data.has("token"):
			_set_auth_token(data.token)
			print("✅ Authentication successful")
		else:
			print("❌ Authentication failed")
	
	elif endpoint == AUTH_VERIFY:
		if success:
			is_authenticated = true
			auth_changed.emit(true)
			print("✅ Token verified")
		else:
			_clear_auth_token()
			print("❌ Token verification failed")
	
	request_completed.emit(endpoint, success, data)

func _set_auth_token(token: String):
	auth_token = token
	is_authenticated = true
	_save_auth_token()
	auth_changed.emit(true)

func _clear_auth_token():
	auth_token = ""
	is_authenticated = false
	_save_auth_token()
	auth_changed.emit(false)

func _save_auth_token():
	var config = ConfigFile.new()
	config.set_value("auth", "token", auth_token)
	config.save("user://auth.cfg")

func _load_auth_token():
	var config = ConfigFile.new()
	if config.load("user://auth.cfg") == OK:
		auth_token = config.get_value("auth", "token", "")
		if not auth_token.is_empty():
			# Verify token on startup
			verify_token()

func _emit_auth_failed(reason: String):
	print("❌ Auth failed: " + reason)
	request_completed.emit("auth_failed", false, {"error": reason})
