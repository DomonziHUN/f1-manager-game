extends Node

# Game state
var current_user: Dictionary = {}
var garage_data: Dictionary = {}
var current_scene: String = ""

# Race system data
var current_match_data: Dictionary = {}
var qualifying_data: Dictionary = {}
var race_data: Dictionary = {}

func _ready():
	# Connect to NetworkManager signals
	NetworkManager.request_completed.connect(_on_network_request_completed)
	NetworkManager.auth_changed.connect(_on_auth_changed)
	
	print("🎮 GameManager initialized")

func _on_network_request_completed(endpoint: String, success: bool, data: Dictionary):
	print("📨 Network response - " + endpoint + ": " + str(success))
	
	match endpoint:
		"/auth/register", "/auth/login":
			if success:
				print("✅ Authentication successful!")
				current_user = data.get("user", {})
		
		"/game/garage":
			if success:
				garage_data = data.get("data", {})
				print("🏠 Garage loaded: " + str(garage_data.get("pilots", []).size()) + " pilots")

func _on_auth_changed(authenticated: bool):
	print("🔐 Auth status changed: " + str(authenticated))

# ==========================================
# MATCH DATA MANAGEMENT
# ==========================================

func set_current_match(data: Dictionary):
	current_match_data = data
	print("💾 Match data stored: " + str(data.get("track", {}).get("name", "Unknown track")))

func get_current_match() -> Dictionary:
	return current_match_data

func has_current_match() -> bool:
	return not current_match_data.is_empty()

func clear_current_match():
	current_match_data = {}
	qualifying_data = {}
	race_data = {}
	print("🗑️ Match data cleared")

# ==========================================
# QUALIFYING DATA MANAGEMENT
# ==========================================

func set_qualifying_data(data: Dictionary):
	qualifying_data = data
	print("💾 Qualifying data stored - Weather: " + str(data.get("weather", "unknown")))

func get_qualifying_data() -> Dictionary:
	return qualifying_data

func has_qualifying_data() -> bool:
	return not qualifying_data.is_empty()

# ==========================================
# RACE DATA MANAGEMENT
# ==========================================

func set_race_data(data: Dictionary):
	race_data = data
	print("💾 Race data stored")

func get_race_data() -> Dictionary:
	return race_data

func has_race_data() -> bool:
	return not race_data.is_empty()

# ==========================================
# USER DATA HELPERS
# ==========================================

func get_user_pilots() -> Array:
	if garage_data.has("pilots"):
		return garage_data.pilots
	return []

func get_active_pilots() -> Array:
	var active_pilots = []
	for pilot in get_user_pilots():
		if pilot.get("is_active_slot_1", 0) == 1 or pilot.get("is_active_slot_2", 0) == 1:
			active_pilots.append(pilot)
	return active_pilots

func get_user_car_stats() -> Dictionary:
	if garage_data.has("carStats"):
		return garage_data.carStats
	return {}

func get_user_info() -> Dictionary:
	if garage_data.has("user"):
		return garage_data.user
	return current_user

# ==========================================
# SCENE MANAGEMENT
# ==========================================

func set_current_scene(scene_name: String):
	current_scene = scene_name
	print("🎬 Scene changed to: " + scene_name)

func get_current_scene() -> String:
	return current_scene

# ==========================================
# UTILITY FUNCTIONS
# ==========================================

func format_time(seconds: float) -> String:
	var minutes = int(seconds / 60)
	var secs = int(seconds) % 60
	var milliseconds = int((seconds - int(seconds)) * 100)
	return "%02d:%02d.%02d" % [minutes, secs, milliseconds]

func get_tire_emoji(tire_type: String) -> String:
	match tire_type:
		"soft":
			return "🔴"
		"medium":
			return "🟡"
		"hard":
			return "⚪"
		"intermediate":
			return "🟢"
		"wet":
			return "🔵"
		_:
			return "⚫"

func get_weather_emoji(weather: String) -> String:
	match weather:
		"dry":
			return "☀️"
		"light_rain":
			return "🌦️"
		"heavy_rain":
			return "🌧️"
		"storm":
			return "⛈️"
		_:
			return "🌤️"

# ==========================================
# DEBUG FUNCTIONS
# ==========================================

func print_current_state():
	print("🔍 GameManager State:")
	print("  Current User: " + str(current_user.get("username", "None")))
	print("  Current Scene: " + current_scene)
	print("  Has Match: " + str(has_current_match()))
	print("  Has Qualifying: " + str(has_qualifying_data()))
	print("  Has Race: " + str(has_race_data()))
	print("  Active Pilots: " + str(get_active_pilots().size()))