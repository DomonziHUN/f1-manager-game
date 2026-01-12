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
var pilot1_tire: String = ""
var pilot2_tire: String = ""
var current_pilot_selection: int = 1  # 1 or 2
var preparation_time: float = 30.0
var is_ready: bool = false
var current_weather: String = "dry"
var user_pilots: Array = []

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

	# Connect WebSocket signals (később használhatod valódi szerver update-ekre)
	WebSocketManager.race_preparation_update.connect(_on_race_preparation_update)
	WebSocketManager.qualifying_start.connect(_on_qualifying_start)
	WebSocketManager.weather_update.connect(_on_weather_update)

	# Load match data from previous scene
	_load_match_data()

	# Időjárás a SZERVER által küldött match_data-ból
	_set_weather_from_match()

	# Pilóták és ajánlott gumik betöltése
	_load_pilot_info()

func _load_match_data():
	match_data = GameManager.get_current_match()
	_update_ui()

func _set_weather_from_match():
	# Szervertől kapott időjárás, fallback dry
	current_weather = match_data.get("weather", "dry")
	var weather_data = weather_conditions.get(current_weather, weather_conditions["dry"])
	weather_info.text = weather_data.icon + " Weather: " + weather_data.name
	print("🌤️ Race weather (from server): " + current_weather)

func _load_pilot_info():
	# Get pilot info from GameManager
	user_pilots = GameManager.get_active_pilots()

	if user_pilots.size() >= 2:
		var pilot1 = user_pilots[0]
		var pilot2 = user_pilots[1]

		pilot1_info.text = "Pilot 1: " + str(pilot1.get("name", "Unknown")) + "\n" + str(pilot1.get("team", "")) + "\nSpeed: " + str(pilot1.get("total_speed", 0))
		pilot2_info.text = "Pilot 2: " + str(pilot2.get("name", "Unknown")) + "\n" + str(pilot2.get("team", "")) + "\nSpeed: " + str(pilot2.get("total_speed", 0))

		print("👨‍✈️ Loaded pilots: " + pilot1.get("name", "") + " & " + pilot2.get("name", ""))
	else:
		pilot1_info.text = "Pilot 1: Not found"
		pilot2_info.text = "Pilot 2: Not found"
		print("❌ Not enough active pilots found")

	# Ajánlott gumik mindkét pilótának az aktuális időjárás alapján
	_auto_select_recommended_tires()

func _auto_select_recommended_tires():
	var recommended_tire = ""

	match current_weather:
		"dry":
			recommended_tire = "medium"  # Safe default for dry
		"light_rain":
			recommended_tire = "intermediate"
		"heavy_rain", "storm":
			recommended_tire = "wet"

	# Set same tire for both pilots initially
	pilot1_tire = recommended_tire
	pilot2_tire = recommended_tire

	# Start with pilot 1 selection
	current_pilot_selection = 1
	_update_tire_selection_ui()

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

func _update_tire_selection_ui():
	# Update button states based on current pilot selection
	var current_tire = pilot1_tire if current_pilot_selection == 1 else pilot2_tire

	# Clear all buttons
	for button in tire_buttons:
		button.button_pressed = false

	# Set current tire button
	match current_tire:
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

	# Update tire info
	_update_tire_info(current_tire)

	# Update status
	var pilot_name = ""
	if user_pilots.size() >= current_pilot_selection:
		pilot_name = user_pilots[current_pilot_selection - 1].get("name", "Pilot " + str(current_pilot_selection))
	else:
		pilot_name = "Pilot " + str(current_pilot_selection)

	status_label.text = "Selecting tire for " + pilot_name + " (Click tire then switch pilot)"

	# Update ready button
	_check_ready_status()

func _select_tire(tire_type: String):
	# Set tire for current pilot
	if current_pilot_selection == 1:
		pilot1_tire = tire_type
	else:
		pilot2_tire = tire_type

	print("🛞 " + tire_type + " selected for pilot " + str(current_pilot_selection))

	# Update UI
	_update_tire_selection_ui()

	# Auto-switch to next pilot if first pilot is done
	if current_pilot_selection == 1 and not pilot1_tire.is_empty():
		current_pilot_selection = 2
		_update_tire_selection_ui()

func _update_tire_info(tire_type: String):
	if tire_type.is_empty():
		tire_info.text = "Select tire compound for Pilot " + str(current_pilot_selection)
		return

	var tire_data = tire_compounds[tire_type]
	var weather_data = weather_conditions[current_weather]

	tire_info.text = "Pilot " + str(current_pilot_selection) + ": " + tire_data.color + " " + tire_data.name + "\n\n"

	# Show performance based on current weather
	if current_weather == "dry":
		var speed_percent = int(tire_data.dry_speed * 100)
		tire_info.text += "☀️ Dry Performance: " + str(speed_percent) + "%\n"
	else:
		var speed_percent = int(tire_data.wet_speed * 100)
		tire_info.text += "🌧️ Wet Performance: " + str(speed_percent) + "%\n"

	tire_info.text += "Wear rate: " + str(int(tire_data.wear_rate * 100)) + "%\n\n"

	# Show both pilots' tire selection
	if not pilot1_tire.is_empty():
		tire_info.text += "Pilot 1: " + tire_compounds[pilot1_tire].color + " " + tire_compounds[pilot1_tire].name + "\n"
	if not pilot2_tire.is_empty():
		tire_info.text += "Pilot 2: " + tire_compounds[pilot2_tire].color + " " + tire_compounds[pilot2_tire].name + "\n"

func _check_ready_status():
	var both_tires_selected = not pilot1_tire.is_empty() and not pilot2_tire.is_empty()
	ready_button.disabled = not both_tires_selected

	if both_tires_selected:
		ready_button.text = "Ready!"
		status_label.text = "✅ Both pilots have tires selected. Ready to start!"
	else:
		ready_button.text = "Select Tires"

func _on_ready_pressed():
	if pilot1_tire.is_empty() or pilot2_tire.is_empty():
		status_label.text = "❌ Please select tires for both pilots"
		return

	is_ready = true
	ready_button.disabled = true
	ready_button.text = "✅ Ready!"
	status_label.text = "✅ Ready! Waiting for opponent..."
	opponent_status.text = "⏳ Waiting for opponent..."

	# Itt később küldheted a szervernek a gumi­választást is (race_preparation event)

	print("📤 Sending race preparation (local simulation for now)")

	# Jelenleg csak szimuláljuk, hogy az ellenfél is ready
	var wait_time = randf_range(2.0, 5.0)
	await get_tree().create_timer(wait_time).timeout
	_simulate_both_ready()

func _simulate_both_ready():
	opponent_status.text = "✅ Ready!"
	status_label.text = "✅ Both players ready! Starting qualifying automatically..."

	# Automatically start qualifying after 2 seconds
	await get_tree().create_timer(2.0).timeout
	_start_qualifying()

func _start_qualifying():
	print("🏁 Starting qualifying simulation...")

	# Pass race data to qualifying scene, including server seed
	var qualifying_data = {
		"match_data": match_data,
		"weather": current_weather,
		"pilot1_tire": pilot1_tire,
		"pilot2_tire": pilot2_tire,
		"user_pilots": user_pilots,
		"seed": match_data.get("seed", 0)
	}

	GameManager.set_qualifying_data(qualifying_data)

	var qualifying_scene = preload("res://scenes/race/QualifyingScene.tscn")
	get_tree().change_scene_to_packed(qualifying_scene)

func _on_race_preparation_update(data: Dictionary):
	print("📊 Race preparation update: " + str(data))

	var opponent_ready = data.get("opponent_ready", false)
	if opponent_ready:
		opponent_status.text = "✅ Ready!"
		if is_ready:
			status_label.text = "✅ Both players ready! Starting qualifying automatically..."
			await get_tree().create_timer(2.0).timeout
			_start_qualifying()
	else:
		var opponent_progress = data.get("opponent_progress", "Preparing...")
		opponent_status.text = "⏳ " + str(opponent_progress)

func _on_qualifying_start(data: Dictionary):
	print("🏁 Qualifying starting: " + str(data))
	_start_qualifying()

func _on_weather_update(data: Dictionary):
	print("🌤️ Weather update: " + str(data))

	var new_weather = data.get("weather", current_weather)
	if new_weather != current_weather:
		current_weather = new_weather
		var weather_data = weather_conditions.get(current_weather, weather_conditions["dry"])
		weather_info.text = weather_data.icon + " Weather: " + weather_data.name
		_update_tire_info(pilot1_tire if current_pilot_selection == 1 else pilot2_tire)

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
		if pilot1_tire.is_empty() or pilot2_tire.is_empty():
			_auto_select_recommended_tires()

		_on_ready_pressed()
		status_label.text = "⏰ Auto-ready! Time expired."

func _input(event):
	if event.is_action_pressed("ui_focus_next"):
		if current_pilot_selection == 1:
			current_pilot_selection = 2
		else:
			current_pilot_selection = 1
		_update_tire_selection_ui()

func _exit_tree():
	# Clean up if needed
	pass