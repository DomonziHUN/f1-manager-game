extends Control

# ====== NODE REFERENCIÁK ======

# Header
@onready var lap_label: Label = $Header/Left/LapLabel
@onready var time_label: Label = $Header/Left/TimeLabel
@onready var weather_label: Label = $Header/Right/WeatherLabel
@onready var weather_forecast: Label = $Header/Right/WeatherForecast

# Main - Track
@onready var track_container: Node2D = $Main/LeftPanel/TrackContainer

# Main - Standings
@onready var standings_container: VBoxContainer = $Main/RightPanel/StandingsScroll/StandingsContainer

# Main - Car Controls
@onready var car1_panel: Control = $Main/RightPanel/ControlsVBox/Car1Panel
@onready var car2_panel: Control = $Main/RightPanel/ControlsVBox/Car2Panel

# Footer
@onready var status_label: Label = $Footer/StatusLabel

# ====== TRACK SCENES ======
const TRACK_SCENES := {
	"track_hungaroring": preload("res://scenes/race/tracks/Track_Hungaroring.tscn"),
}

# ====== DATA ======
var race_data: Dictionary = {}
var match_data: Dictionary = {}
var current_race_id: String = ""
var my_user_id: String = ""

var car_nodes: Dictionary = {} # carId -> {node: Sprite2D, label: Label, data: Dictionary}
var car_texture: Texture2D

var track_curve: Curve2D = null
var track_length: float = 0.0
var use_curve: bool = false

var race_started: bool = false
var race_finished: bool = false
var race_time: float = 0.0

# State interpolation
var last_state: Dictionary = {}
var current_state: Dictionary = {}
var interpolation_progress: float = 0.0
const SERVER_TICK_RATE: float = 1.0 / 50.0 # 50 tick/sec

func _ready() -> void:
	print("🏁 Race scene loaded")
	
	_create_car_texture()
	_load_race_data()
	_setup_track()
	_connect_signals()
	
	# Csatlakozás a versenyhez
	if not current_race_id.is_empty():
		WebSocketManager.join_race(current_race_id)

func _create_car_texture() -> void:
	var size: int = 16
	var img: Image = Image.create(size, size, false, Image.FORMAT_RGBA8)
	img.fill(Color.TRANSPARENT)
	
	var center: Vector2 = Vector2(size / 2.0, size / 2.0)
	var outer_radius: float = size / 2.0
	var inner_radius: float = outer_radius - 2.0
	
	for x in range(size):
		for y in range(size):
			var pos := Vector2(x, y)
			var dist := pos.distance_to(center)
			
			if dist <= outer_radius:
				if dist <= inner_radius:
					img.set_pixel(x, y, Color.WHITE)
				else:
					img.set_pixel(x, y, Color.BLACK)
	
	car_texture = ImageTexture.create_from_image(img)

func _load_race_data() -> void:
	race_data = GameManager.get_race_data()
	match_data = race_data.get("match_data", GameManager.get_current_match())
	
	if match_data.is_empty():
		status_label.text = "No match data available"
		return
	
	current_race_id = str(match_data.get("matchId", match_data.get("id", "")))
	
	var user_info: Dictionary = GameManager.get_user_info()
	my_user_id = str(user_info.get("id", user_info.get("user_id", "")))
	
	var track: Dictionary = match_data.get("track", {})
	var track_name: String = str(track.get("name", "Unknown"))
	var total_laps: int = int(track.get("laps", 15))
	
	lap_label.text = "LAP 0/%d" % total_laps
	time_label.text = "00:00"
	
	var weather: String = str(match_data.get("weather", "dry"))
	weather_label.text = _get_weather_text(weather)
	weather_forecast.text = ""
	
	status_label.text = "Waiting for race start..."

func _setup_track() -> void:
	if track_container == null:
		return
	
	for child in track_container.get_children():
		child.queue_free()
	
	var track_id: String = str(match_data.get("track", {}).get("id", ""))
	var track_scene: PackedScene = TRACK_SCENES.get(track_id, null)
	
	if track_scene != null:
		var track_instance: Node2D = track_scene.instantiate() as Node2D
		track_container.add_child(track_instance)
		track_instance.position = Vector2.ZERO
		
		var path: Path2D = track_instance.get_node_or_null("Path2D")
		if path and path.curve:
			track_curve = path.curve
			track_length = track_curve.get_baked_length()
			use_curve = track_length > 0.0
			print("Track loaded with curve, length: ", track_length)
	else:
		print("⚠️ No track scene for id: ", track_id)

func _connect_signals() -> void:
	WebSocketManager.race_start.connect(_on_race_start)
	WebSocketManager.race_state.connect(_on_race_state)
	WebSocketManager.race_event.connect(_on_race_event)
	WebSocketManager.race_end.connect(_on_race_end)
	WebSocketManager.race_prepare.connect(_on_race_prepare)
	WebSocketManager.race_countdown.connect(_on_race_countdown)

# ====== WEBSOCKET EVENTS ======

func _on_race_prepare(data: Dictionary) -> void:
	print("🏁 Race prepare:", data)
	status_label.text = "Race starting soon..."

func _on_race_countdown(data: Dictionary) -> void:
	var seconds: int = int(data.get("seconds", 0))
	status_label.text = str(seconds) + "..."
	print("⏱️ Countdown:", seconds)

func _on_race_start(data: Dictionary) -> void:
	print("🏁 RACE START!")
	race_started = true
	status_label.text = "RACE STARTED!"
	
	var total_laps: int = int(data.get("totalLaps", 15))
	lap_label.text = "LAP 0/%d" % total_laps

func _on_race_state(state: Dictionary) -> void:
	if not race_started:
		return
	
	# Interpoláció: előző state -> új state
	last_state = current_state
	current_state = state
	interpolation_progress = 0.0
	
	# UI frissítés
	_update_ui_from_state(state)

func _on_race_event(event: Dictionary) -> void:
	var event_type: String = str(event.get("type", ""))
	print("📢 Race event:", event_type, event)
	
	match event_type:
		"LAP_COMPLETE":
			_handle_lap_complete(event)
		"OVERTAKE":
			_handle_overtake(event)
		"PIT_ENTER":
			_handle_pit_enter(event)
		"PIT_EXIT":
			_handle_pit_exit(event)
		"WEATHER_CHANGE":
			_handle_weather_change(event)
		"TIRE_CRITICAL":
			_handle_tire_critical(event)
		"ERS_DEPLETED":
			_handle_ers_depleted(event)

func _on_race_end(results: Dictionary) -> void:
	print("🏁 RACE FINISHED!")
	print("Results:", results)
	race_finished = true
	status_label.text = "RACE FINISHED!"
	
	# TODO: Eredmény képernyő
	await get_tree().create_timer(5.0).timeout
	get_tree().change_scene_to_file("res://scenes/dashboard/DashboardScene.tscn")

# ====== STATE UPDATE ======

func _update_ui_from_state(state: Dictionary) -> void:
	var current_lap: int = int(state.get("currentLap", 0))
	var total_laps: int = int(state.get("totalLaps", 15))
	var race_time_sec: float = float(state.get("raceTime", 0.0))
	var weather: String = str(state.get("weather", "dry"))
	
	lap_label.text = "LAP %d/%d" % [current_lap, total_laps]
	
	var minutes: int = int(race_time_sec / 60)
	var seconds: int = int(race_time_sec) % 60
	time_label.text = "%02d:%02d" % [minutes, seconds]
	
	weather_label.text = _get_weather_text(weather)
	
	# Autók adatai
	var cars: Array = state.get("cars", [])
	
	for car_data in cars:
		var car_id: String = str(car_data.get("id", ""))
		if car_id.is_empty():
			continue
		
		# Ha még nincs node az autónak, hozzuk létre
		if not car_nodes.has(car_id):
			_create_car_node(car_id, car_data)
		
		# Frissítjük az adatokat
		if car_nodes.has(car_id):
			car_nodes[car_id].data = car_data
	
	# Standings frissítés
	_update_standings(cars)
	
	# Car control panel frissítés
	_update_car_controls(cars)

func _create_car_node(car_id: String, car_data: Dictionary) -> void:
	var owner: String = str(car_data.get("owner", "ai"))
	var user_id: String = str(car_data.get("userId", ""))
	
	var car_sprite := Sprite2D.new()
	car_sprite.texture = car_texture
	car_sprite.scale = Vector2(2.0, 2.0)
	
	var is_player: bool = (user_id == my_user_id)
	
	if is_player:
		car_sprite.modulate = Color(0.4, 0.8, 1.0) # Világoskék
		car_sprite.z_index = 10
	elif owner == "player1" or owner == "player2":
		car_sprite.modulate = Color(1.0, 0.2, 0.2) # Piros (ellenfél)
		car_sprite.z_index = 5
	else:
		car_sprite.modulate = Color(0.7, 0.7, 0.8) # Szürke (AI)
		car_sprite.z_index = 0
	
	# Pozíció label
	var pos_label := Label.new()
	pos_label.text = "P1"
	pos_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	pos_label.add_theme_font_size_override("font_size", 10)
	pos_label.add_theme_color_override("font_color", Color.WHITE)
	pos_label.add_theme_color_override("font_outline_color", Color.BLACK)
	pos_label.add_theme_constant_override("outline_size", 2)
	pos_label.position = Vector2(-12, 12)
	car_sprite.add_child(pos_label)
	
	track_container.add_child(car_sprite)
	
	car_nodes[car_id] = {
		"node": car_sprite,
		"label": pos_label,
		"data": car_data
	}

func _update_standings(cars: Array) -> void:
	# Töröljük az előző standings-t
	for child in standings_container.get_children():
		child.queue_free()
	
	# Rendezés pozíció szerint
	var sorted_cars: Array = cars.duplicate()
	sorted_cars.sort_custom(func(a, b): return a.position < b.position)
	
	for car_data in sorted_cars:
		var row := HBoxContainer.new()
		row.custom_minimum_size = Vector2(0, 24)
		
		var position: int = int(car_data.get("position", 0))
		var pilot_name: String = str(car_data.get("pilotName", "Driver"))
		var gap: float = float(car_data.get("gapToLeader", 0.0))
		var tire_compound: String = str(car_data.get("tireCompound", "medium"))
		var tire_wear: int = int(car_data.get("tireWear", 100))
		var owner: String = str(car_data.get("owner", "ai"))
		var user_id: String = str(car_data.get("userId", ""))
		
		var is_you: bool = (user_id == my_user_id)
		var is_opponent: bool = (owner == "player1" or owner == "player2") and not is_you
		
		# POS
		var pos_label := Label.new()
		pos_label.text = "P%d" % position
		pos_label.custom_minimum_size = Vector2(40, 0)
		pos_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		pos_label.add_theme_font_size_override("font_size", 12)
		
		if is_you:
			pos_label.add_theme_color_override("font_color", Color(0.4, 0.85, 1))
		elif is_opponent:
			pos_label.add_theme_color_override("font_color", Color(1, 0.45, 0.45))
		else:
			pos_label.add_theme_color_override("font_color", Color(0.7, 0.75, 0.85))
		
		row.add_child(pos_label)
		
		# DRIVER NAME
		var name_label := Label.new()
		name_label.text = pilot_name
		name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name_label.add_theme_font_size_override("font_size", 12)
		
		if is_you:
			name_label.add_theme_color_override("font_color", Color(0.4, 0.85, 1))
		elif is_opponent:
			name_label.add_theme_color_override("font_color", Color(1, 0.45, 0.45))
		else:
			name_label.add_theme_color_override("font_color", Color(0.9, 0.92, 0.95))
		
		row.add_child(name_label)
		
		# GAP
		var gap_label := Label.new()
		if position == 1:
			gap_label.text = "LEADER"
		else:
			gap_label.text = "+%.3f" % gap
		gap_label.custom_minimum_size = Vector2(80, 0)
		gap_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		gap_label.add_theme_font_size_override("font_size", 11)
		gap_label.add_theme_color_override("font_color", Color(0.6, 0.65, 0.75))
		row.add_child(gap_label)
		
		# TIRE
		var tire_label := Label.new()
		tire_label.text = "%s %d%%" % [_get_tire_short(tire_compound), tire_wear]
		tire_label.custom_minimum_size = Vector2(70, 0)
		tire_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tire_label.add_theme_font_size_override("font_size", 11)
		tire_label.add_theme_color_override("font_color", _get_tire_color(tire_compound))
		row.add_child(tire_label)
		
		standings_container.add_child(row)

func _update_car_controls(cars: Array) -> void:
	# Saját autók megkeresése
	var my_cars: Array = []
	for car_data in cars:
		var user_id: String = str(car_data.get("userId", ""))
		if user_id == my_user_id:
			my_cars.append(car_data)
	
	# Rendezés slot szerint (car1 = player1_car1, car2 = player1_car2)
	my_cars.sort_custom(func(a, b): return a.id < b.id)
	
	# Car1 Panel
	if my_cars.size() >= 1 and car1_panel:
		_update_single_car_control(car1_panel, my_cars[0])
	
	# Car2 Panel
	if my_cars.size() >= 2 and car2_panel:
		_update_single_car_control(car2_panel, my_cars[1])

func _update_single_car_control(panel: Control, car_data: Dictionary) -> void:
	if not panel or not is_instance_valid(panel):
		return
	
	var car_id: String = str(car_data.get("id", ""))
	var pilot_name: String = str(car_data.get("pilotName", "Driver"))
	var position: int = int(car_data.get("position", 0))
	var tire_wear: int = int(car_data.get("tireWear", 100))
	var tire_compound: String = str(car_data.get("tireCompound", "medium"))
	var ers_charge: int = int(car_data.get("ersCharge", 100))
	var ers_mode: String = str(car_data.get("ersMode", "MEDIUM"))
	var is_in_pit: bool = bool(car_data.get("isInPit", false))
	
	# Panel címkék frissítése (ha van CarControlPanel component)
	if panel.has_method("update_data"):
		panel.update_data(car_id, pilot_name, position, tire_wear, tire_compound, ers_charge, ers_mode, is_in_pit)

# ====== PROCESS (Interpolation) ======

func _process(delta: float) -> void:
	if not race_started or race_finished:
		return
	
	# Interpoláció növelése
	interpolation_progress += delta / SERVER_TICK_RATE
	interpolation_progress = clamp(interpolation_progress, 0.0, 1.0)
	
	# Autók pozíciójának frissítése interpolációval
	_update_car_positions(interpolation_progress)

func _update_car_positions(t: float) -> void:
	for car_id in car_nodes.keys():
		var car_node_data: Dictionary = car_nodes[car_id]
		var node: Sprite2D = car_node_data.node
		var label: Label = car_node_data.label
		var current_data: Dictionary = car_node_data.data
		
		if not is_instance_valid(node):
			continue
		
		var track_pos: float = float(current_data.get("trackPosition", 0.0))
		var position: int = int(current_data.get("position", 0))
		
		# Pozíció label frissítés
		if label and is_instance_valid(label):
			label.text = "P%d" % position
		
		# Pályán való pozíció
		if use_curve and track_curve:
			var dist: float = track_pos * track_length
			node.position = track_curve.sample_baked(dist)
		else:
			# Fallback: körpálya
			var radius: float = 200.0
			var angle: float = -PI / 2.0 + track_pos * TAU
			node.position = Vector2(cos(angle), sin(angle)) * radius

# ====== EVENT HANDLERS ======

func _handle_lap_complete(event: Dictionary) -> void:
	var car_id: String = str(event.get("carId", ""))
	var lap: int = int(event.get("lap", 0))
	print("🏁 Lap complete: ", car_id, " Lap ", lap)

func _handle_overtake(event: Dictionary) -> void:
	var car_id: String = str(event.get("carId", ""))
	var from_pos: int = int(event.get("from", 0))
	var to_pos: int = int(event.get("to", 0))
	print("🏎️ OVERTAKE: ", car_id, " P", from_pos, " → P", to_pos)

func _handle_pit_enter(event: Dictionary) -> void:
	var car_id: String = str(event.get("carId", ""))
	print("🛑 PIT ENTER: ", car_id)

func _handle_pit_exit(event: Dictionary) -> void:
	var car_id: String = str(event.get("carId", ""))
	var compound: String = str(event.get("compound", "medium"))
	print("✅ PIT EXIT: ", car_id, " New tire: ", compound)

func _handle_weather_change(event: Dictionary) -> void:
	var from_weather: String = str(event.get("from", "dry"))
	var to_weather: String = str(event.get("to", "dry"))
	print("🌧️ WEATHER CHANGE: ", from_weather, " → ", to_weather)
	status_label.text = "Weather changed to " + to_weather.to_upper()

func _handle_tire_critical(event: Dictionary) -> void:
	var car_id: String = str(event.get("carId", ""))
	var wear: int = int(event.get("wear", 0))
	print("⚠️ TIRE CRITICAL: ", car_id, " Wear: ", wear, "%")

func _handle_ers_depleted(event: Dictionary) -> void:
	var car_id: String = str(event.get("carId", ""))
	print("🔋 ERS DEPLETED: ", car_id)

# ====== HELPER FUNCTIONS ======

func _get_weather_text(weather: String) -> String:
	match weather:
		"dry":
			return "DRY"
		"cloudy":
			return "CLOUDY"
		"light_rain":
			return "LIGHT RAIN"
		"rain":
			return "RAIN"
		"storm":
			return "STORM"
		_:
			return weather.to_upper()

func _get_tire_short(compound: String) -> String:
	match compound:
		"soft":
			return "S"
		"medium":
			return "M"
		"hard":
			return "H"
		"intermediate":
			return "I"
		"wet":
			return "W"
		_:
			return "?"

func _get_tire_color(compound: String) -> Color:
	match compound:
		"soft":
			return Color(1, 0.3, 0.3)
		"medium":
			return Color(1, 0.85, 0.2)
		"hard":
			return Color(0.9, 0.9, 0.95)
		"intermediate":
			return Color(0.3, 0.9, 0.4)
		"wet":
			return Color(0.3, 0.6, 1)
		_:
			return Color(0.7, 0.75, 0.85)

func _exit_tree() -> void:
	if WebSocketManager.race_start.is_connected(_on_race_start):
		WebSocketManager.race_start.disconnect(_on_race_start)
	if WebSocketManager.race_state.is_connected(_on_race_state):
		WebSocketManager.race_state.disconnect(_on_race_state)
	if WebSocketManager.race_event.is_connected(_on_race_event):
		WebSocketManager.race_event.disconnect(_on_race_event)
	if WebSocketManager.race_end.is_connected(_on_race_end):
		WebSocketManager.race_end.disconnect(_on_race_end)
