extends Control

# UI References
@onready var timer_label = $VBoxContainer/Header/HeaderContent/TimerLabel
@onready var track_info = $VBoxContainer/Header/HeaderContent/TrackInfo
@onready var weather_info = $VBoxContainer/Header/HeaderContent/WeatherInfo

# Tire buttons
@onready var soft_tire = $VBoxContainer/MainContent/LeftPanel/TireSelection/TireContent/DryTires/SoftTire
@onready var medium_tire = $VBoxContainer/MainContent/LeftPanel/TireSelection/TireContent/DryTires/MediumTire
@onready var hard_tire = $VBoxContainer/MainContent/LeftPanel/TireSelection/TireContent/DryTires/HardTire
@onready var inter_tire = $VBoxContainer/MainContent/LeftPanel/TireSelection/TireContent/WetTires/InterTire
@onready var wet_tire = $VBoxContainer/MainContent/LeftPanel/TireSelection/TireContent/WetTires/WetTire

@onready var tire_info = $VBoxContainer/MainContent/LeftPanel/TireSelection/TireContent/TireInfo

# Right panel
@onready var opponent_name = $VBoxContainer/MainContent/RightPanel/OpponentInfo/OpponentContent/OpponentName
@onready var opponent_league = $VBoxContainer/MainContent/RightPanel/OpponentInfo/OpponentContent/OpponentLeague
@onready var opponent_status = $VBoxContainer/MainContent/RightPanel/OpponentInfo/OpponentContent/OpponentStatus
@onready var pilot1_info = $VBoxContainer/MainContent/RightPanel/PilotInfo/PilotContent/Pilot1Info
@onready var pilot2_info = $VBoxContainer/MainContent/RightPanel/PilotInfo/PilotContent/Pilot2Info

# Bottom panel
@onready var status_label = $VBoxContainer/BottomPanel/BottomContent/StatusLabel
@onready var ready_button = $VBoxContainer/BottomPanel/BottomContent/ReadyButton

# Race data
var match_data: Dictionary = {}
var selected_tire: String = ""
var preparation_time: float = 30.0
var is_ready: bool = false
var current_weather: String = "dry"

# All tire buttons for easy management
var tire_buttons: Array = []

# Tire compounds with weather-specific performance
var tire_compounds = {
	"soft": {
		"name": "Soft", 
		"color": "🔴",
		"dry_speed": 1.05, 
		"wet_speed": 0.7,
		"wear_rate": 1.8,
		"weather_suitability": ["dry"]
	},
	"medium": {
		"name": "Medium", 
		"color": "🟡",
		"dry_speed": 1.0, 
		"wet_speed": 0.65,
		"wear_rate": 1.0,
		"weather_suitability": ["dry"]
	},
	"hard": {
		"name": "Hard", 
		"color": "⚪",
		"dry_speed": 0.95, 
		"wet_speed": 0.6,
		"wear_rate": 0.6,
		"weather_suitability": ["dry"]
	},
	"intermediate": {
		"name": "Intermediate", 
		"color": "🟢",
		"dry_speed": 0.85, 
		"wet_speed": 1.1,
		"wear_rate": 1.2,
		"weather_suitability": ["light_rain", "drying"]
	},
	"wet": {
		"name": "Full Wet", 
		"color": "🔵",
		"dry_speed": 0.75, 
		"wet_speed": 1.0,
		"wear_rate": 0.8,
		"weather_suitability": ["heavy_rain", "storm"]
	}
}

# Weather conditions
var weather_conditions = {
	"dry": {"name": "Dry", "icon": "☀️", "rain_intensity": 0.0},
	"light_rain": {"name": "Light Rain", "icon": "🌦️", "rain_intensity": 0.3},
	"heavy_rain": {"name": "Heavy Rain", "icon": "🌧️", "rain_intensity": 0.7},
	"storm": {"name": "Storm", "icon": "⛈️", "rain_intensity": 1.0}
}

func _ready():
	print("🏁 Race preparation scene loaded")
	
	# Store tire buttons for easy management
	tire_buttons = [soft_tire, medium_tire, hard_tire, inter_tire, wet_tire]
	
	# Connect tire buttons
	soft_tire.pressed.connect(func(): _select_tire("soft"))
	medium_tire.pressed.connect(func(): _select_tire("medium"))
	hard_tire.pressed.connect(func(): _select_tire("hard"))
	inter_tire.pressed.connect(func(): _select_tire("intermediate"))
	wet_tire.pressed.connect(func(): _select_tire("wet"))
	ready_button.pressed.connect(_on_ready_pressed)
	
	# Connect WebSocket signals
	WebSocketManager.race_preparation_update.connect(_on_race_preparation_update)
	WebSocketManager.qualifying_start.connect(_on_qualifying_start)
	WebSocketManager.weather_update.connect(_on_weather_update)
	
	# Load match data from previous scene
	_load_match_data()
	
	# Generate random weather for this race
	_generate_race_weather()
	
	# Default tire selection based on weather
	_auto_select_recommended_tire()

func _load_match_data():
	# This should be passed from matchmaking scene
	# For now, we'll get it from a global or load from WebSocket
	if GameManager.has_method("get_current_match"):
		match_data = GameManager.get_current_match()
	
	_update_ui()

func _generate_race_weather():
	# Random weather generation (later this will come from server)
	var weather_types = ["dry", "dry", "dry", "light_rain", "heavy_rain"]  # 60% dry, 20% light rain, 20% heavy rain
	current_weather = weather_types[randi() % weather_types.size()]
	
	# Update weather display
	var weather_data = weather_conditions[current_weather]
	weather_info.text = weather_data.icon + " Weather: " + weather_data.name
	
	print("🌤️ Race weather: " + current_weather)

func _auto_select_recommended_tire():
	var recommended_tire = ""
	
	match current_weather:
		"dry":
			recommended_tire = "medium"  # Safe default for dry
		"light_rain":
			recommended_tire = "intermediate"
		"heavy_rain", "storm":
			recommended_tire = "wet"
	
	_select_tire(recommended_tire)

func _update_ui():
	if match_data.is_empty():
		return
	
	# Update track info
	var track = match_data.get("track", {})
	track_info.text = "Track: " + str(track.get("name", "Unknown")) + " (" + str(track.get("laps", 0)) + " laps)"
	
	# Update opponent info
	var opponent = match_data.get("opponent", {})
	opponent_name.text = str(opponent.get("username", "Unknown Player"))
	opponent_league.text = "League " + str(opponent.get("league", 1))
	
	# Load pilot info from garage
	_load_pilot_info()

func _load_pilot_info():
	# Get pilot info from NetworkManager or local storage
	NetworkManager.get_garage()

func _select_tire(tire_type: String):
	selected_tire = tire_type
	
	# Update button states
	for button in tire_buttons:
		button.button_pressed = false
	
	match tire_type:
		"soft":
			soft_tire.button_pressed = true
		"medium":
			medium_tire.button_pressed = true
		"hard":
			hard_tire.button_pressed = true
		"intermediate":
			inter_tire.button_pressed = true
		"wet":
			wet_tire.button_pressed = true
	
	# Update tire info with weather-specific performance
	_update_tire_info(tire_type)
	
	# Enable ready button
	ready_button.disabled = false
	
	var tire_data = tire_compounds[tire_type]
	status_label.text = "Tire selected: " + tire_data.color + " " + tire_data.name

func _update_tire_info(tire_type: String):
	var tire_data = tire_compounds[tire_type]
	var weather_data = weather_conditions[current_weather]
	
	tire_info.text = tire_data.color + " " + tire_data.name + " selected\n\n"
	
	# Show performance based on current weather
	if current_weather == "dry":
		var speed_percent = int(tire_data.dry_speed * 100)
		tire_info.text += "☀️ Dry Performance:\n"
		tire_info.text += "Speed: " + str(speed_percent) + "%\n"
	else:
		var speed_percent = int(tire_data.wet_speed * 100)
		tire_info.text += "🌧️ Wet Performance:\n"
		tire_info.text += "Speed: " + str(speed_percent) + "%\n"
	
	tire_info.text += "Wear rate: " + str(int(tire_data.wear_rate * 100)) + "%\n\n"
	
	# Show suitability warning
	var is_suitable = current_weather in tire_data.weather_suitability
	if not is_suitable:
		if current_weather == "dry" and tire_type in ["intermediate", "wet"]:
			tire_info.text += "⚠️ WARNING: Wet tires overheat in dry conditions!"
		elif current_weather != "dry" and tire_type in ["soft", "medium", "hard"]:
			tire_info.text += "⚠️ WARNING: Dry tires are dangerous in wet conditions!"
	else:
		tire_info.text += "✅ Good choice for current weather"

func _on_ready_pressed():
	if selected_tire.is_empty():
		status_label.text = "❌ Please select a tire compound first"
		return
	
	is_ready = true
	ready_button.disabled = true
	ready_button.text = "✅ Ready!"
	status_label.text = "✅ Ready! Waiting for opponent..."
	opponent_status.text = "⏳ Waiting for opponent..."
	
	# Send preparation data to server
	var preparation_data = {
		"tire_compound": selected_tire,
		"weather": current_weather,
		"ready": true
	}
	
	# For now, we'll simulate this since WebSocket methods don't exist yet
	print("📤 Sending race preparation: " + str(preparation_data))
	
	# Simulate opponent getting ready after 3-8 seconds
	var wait_time = randf_range(3.0, 8.0)
	await get_tree().create_timer(wait_time).timeout
	_simulate_opponent_ready()

func _simulate_opponent_ready():
	opponent_status.text = "✅ Ready!"
	status_label.text = "✅ Both players ready! Starting qualifying in 3 seconds..."
	
	await get_tree().create_timer(3.0).timeout
	_start_qualifying()

func _start_qualifying():
	print("🏁 Starting qualifying simulation...")
	
	# Pass race data to qualifying scene
	var qualifying_data = {
		"match_data": match_data,
		"weather": current_weather,
		"player_tire": selected_tire
	}
	
	# Store in GameManager for next scene
	if GameManager.has_method("set_qualifying_data"):
		GameManager.set_qualifying_data(qualifying_data)
	
	# Go to qualifying scene
	var qualifying_scene = preload("res://scenes/race/QualifyingScene.tscn")
	get_tree().change_scene_to_packed(qualifying_scene)

func _on_race_preparation_update(data: Dictionary):
	print("📊 Race preparation update: " + str(data))
	
	# Update opponent status
	var opponent_ready = data.get("opponent_ready", false)
	if opponent_ready:
		opponent_status.text = "✅ Ready!"
		if is_ready:
			status_label.text = "✅ Both players ready! Starting qualifying..."
			await get_tree().create_timer(2.0).timeout
			_start_qualifying()

func _on_qualifying_start(data: Dictionary):
	print("🏁 Qualifying starting: " + str(data))
	_start_qualifying()

func _on_weather_update(data: Dictionary):
	print("🌤️ Weather update: " + str(data))
	
	var new_weather = data.get("weather", current_weather)
	if new_weather != current_weather:
		current_weather = new_weather
		_generate_race_weather()
		_update_tire_info(selected_tire)

func _process(delta):
	if preparation_time > 0:
		preparation_time -= delta
		var minutes = int(preparation_time / 60)
		var seconds = int(preparation_time) % 60
		timer_label.text = "Time remaining: %02d:%02d" % [minutes, seconds]
		
		if preparation_time <= 0:
			timer_label.text = "⏰ Time's up!"
			_auto_ready()

func _auto_ready():
	if not is_ready:
		# Auto-select recommended tire if nothing selected
		if selected_tire.is_empty():
			_auto_select_recommended_tire()
		
		# Auto-ready
		_on_ready_pressed()
		status_label.text = "⏰ Auto-ready! Time expired."

func _exit_tree():
	# Clean up any timers or connections
	pass