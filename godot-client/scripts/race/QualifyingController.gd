extends Control

const ROW_SCENE := preload("res://scenes/ui/components/QualifyingRow.tscn")

const TRACK_SCENES := {
	"track_hungaroring": preload("res://scenes/race/tracks/Track_Hungaroring.tscn"),
}

const LAP_TIME_SCALE: float = 0.4
const EXPECTED_AI_COUNT: int = 16

# Header
@onready var session_label: Label = $Header/Left/SessionLabel
@onready var track_label: Label = $Header/Left/TrackLabel
@onready var status_label: Label = $Header/Center/StatusLabel
@onready var header_progress_bar: ProgressBar = $Header/Center/HeaderProgressBar
@onready var weather_label: Label = $Header/Right/WeatherLabel
@onready var weather_detail_label: Label = $Header/Right/WeatherDetailLabel

# Main
@onready var track_container: Node2D = $Main/LeftPanel/TrackContainer
@onready var rows_container: VBoxContainer = $Main/RightPanel/ResultsVBox/RowsContainer

# Footer
@onready var your_title: Label = $Footer/YourPanel/YourTitle
@onready var your_summary: Label = $Footer/YourPanel/YourSummary
@onready var opp_title: Label = $Footer/OpponentPanel/OppTitle
@onready var opp_summary: Label = $Footer/OpponentPanel/OppSummary
@onready var continue_button: Button = $Footer/ContinueButton

# Adatok
var qualifying_data: Dictionary = {}
var match_data: Dictionary = {}
var current_match_id: String = ""
var grid_positions: Array = []

# Animáció
var results_received: bool = false
var sim_time: float = 0.0
var total_sim_duration: float = 30.0

var driver_sim_data: Array = []
var car_texture: Texture2D

# Eredmény-reveal rendszer
var ai_pending: Array = []
var human_results: Array = []
var revealed_results: Array = []

var ai_reveal_interval: float = 2.0
var ai_reveal_timer: float = 0.0

var all_humans_revealed: bool = false
var qualy_finished: bool = false

func _ready() -> void:
	print("Qualifying scene loaded")

	_create_car_texture()
	continue_button.pressed.connect(_on_continue_pressed)
	WebSocketManager.qualifying_results.connect(_on_qualifying_results)

	# Continue gomb kezdetben DISABLED
	continue_button.disabled = true
	continue_button.text = "Waiting..."

	session_label.text = "ONE SHOT QUALIFYING"

	qualifying_data = GameManager.get_qualifying_data()
	match_data = qualifying_data.get("match_data", GameManager.get_current_match())

	if match_data.is_empty():
		status_label.text = "No match data available"
		return

	current_match_id = str(match_data.get("matchId", match_data.get("id", "")))
	if current_match_id.is_empty():
		status_label.text = "Invalid match ID"
		return

	var track: Dictionary = match_data.get("track", {})
	var track_name: String = str(track.get("name", "Unknown"))
	var laps: int = int(track.get("laps", 0))
	track_label.text = "%s  |  %d laps" % [track_name, laps]

	var weather: String = str(match_data.get("weather", "dry"))
	weather_label.text = _get_weather_text(weather)
	weather_detail_label.text = ""

	status_label.text = "Qualifying in progress..."
	header_progress_bar.visible = true
	header_progress_bar.value = 0.0

	WebSocketManager.request_qualifying_results(current_match_id)

func _get_weather_text(weather: String) -> String:
	match weather:
		"dry":
			return "DRY"
		"light_rain":
			return "LIGHT RAIN"
		"heavy_rain":
			return "HEAVY RAIN"
		"storm":
			return "STORM"
		_:
			return weather.to_upper()

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

func _on_qualifying_results(data: Dictionary) -> void:
	var match_id: String = str(data.get("matchId", ""))
	if match_id != current_match_id:
		return

	grid_positions = data.get("grid", [])
	if grid_positions.is_empty():
		status_label.text = "No qualifying data received"
		header_progress_bar.visible = false
		return

	results_received = true
	_split_results_ai_vs_human()
	_compute_simulation_durations()
	_prepare_track_and_cars()
	ai_reveal_timer = 0.0

func _split_results_ai_vs_human() -> void:
	ai_pending.clear()
	human_results.clear()
	revealed_results.clear()
	driver_sim_data.clear()
	all_humans_revealed = false
	qualy_finished = false

	for res_variant in grid_positions:
		var res: Dictionary = res_variant
		var t: String = str(res.get("type", "ai"))
		if t == "ai":
			ai_pending.append(res)
		else:
			human_results.append(res)

	ai_pending.sort_custom(func(a, b):
		return float(a.lapSeconds) < float(b.lapSeconds)
	)
	human_results.sort_custom(func(a, b):
		return float(a.lapSeconds) < float(b.lapSeconds)
	)

func _compute_simulation_durations() -> void:
	var max_human_secs: float = 0.0
	for res_variant in human_results:
		var res: Dictionary = res_variant
		var secs: float = float(res.get("lapSeconds", 0.0))
		if secs > max_human_secs:
			max_human_secs = secs
	if max_human_secs <= 0.0:
		max_human_secs = 104.0

	total_sim_duration = max_human_secs * LAP_TIME_SCALE

	var ai_count: int = ai_pending.size()
	if ai_count <= 0:
		ai_reveal_interval = total_sim_duration
	else:
		ai_reveal_interval = total_sim_duration / float(ai_count + 2)

	print("total_sim_duration=", total_sim_duration, " ai_reveal_interval=", ai_reveal_interval)

func _prepare_track_and_cars() -> void:
	if track_container == null:
		return

	for child in track_container.get_children():
		child.queue_free()

	var track_id: String = str(match_data.get("track", {}).get("id", ""))
	var track_scene: PackedScene = TRACK_SCENES.get(track_id, null)
	var track_instance: Node2D = null
	var track_curve: Curve2D = null
	var track_length: float = 0.0
	var use_curve: bool = false

	if track_scene != null:
		track_instance = track_scene.instantiate() as Node2D
		track_container.add_child(track_instance)
		track_instance.position = Vector2.ZERO

		var path: Path2D = track_instance.get_node_or_null("Path2D")
		if path and path.curve:
			track_curve = path.curve
			track_length = track_curve.get_baked_length()
			use_curve = track_length > 0.0
	else:
		print("No track scene for id: ", track_id)

	var my_user: Dictionary = GameManager.get_user_info()
	var my_user_id: String = str(my_user.get("id", my_user.get("user_id", "")))

	for res_variant in human_results:
		var res: Dictionary = res_variant
		var lap_secs: float = float(res.get("lapSeconds", 0.0))
		if lap_secs <= 0.0:
			lap_secs = _parse_lap_time_str(str(res.get("lapTime", "0:00.000")))

		var finish_time: float = lap_secs * LAP_TIME_SCALE
		var owner: String = str(res.get("owner", "player1"))
		var user_id: String = str(res.get("userId", ""))
		var name: String = str(res.get("name", "Driver"))

		var car := Sprite2D.new()
		car.texture = car_texture
		car.scale = Vector2(2.0, 2.0)

		if user_id == my_user_id:
			car.modulate = Color(0.4, 0.8, 1.0)
			car.z_index = 10
		else:
			car.modulate = Color(1.0, 0.2, 0.2)
			car.z_index = 5

		if use_curve:
			track_instance.add_child(car)
			car.position = track_curve.sample_baked(0.0)
		else:
			track_container.add_child(car)
			car.position = _get_track_position(0.0, driver_sim_data.size())

		driver_sim_data.append({
			"node": car,
			"finish_time": finish_time,
			"lap_seconds": lap_secs,
			"owner": owner,
			"user_id": user_id,
			"name": name,
			"curve": track_curve,
			"length": track_length,
			"result": res,
			"revealed": false
		})

func _parse_lap_time_str(s: String) -> float:
	var parts: Array = s.split(":")
	if parts.size() < 2:
		return 0.0
	var minutes: int = int(parts[0])
	var seconds: float = float(parts[1])
	return float(minutes) * 60.0 + seconds

func _get_track_position(progress: float, index: int) -> Vector2:
	var radius: float = 200.0
	var lane_offset: float = float(index) * 4.0
	var angle: float = -PI / 2.0 + progress * TAU
	var r: float = radius + lane_offset * 0.05
	return Vector2(cos(angle), sin(angle)) * r

func _rebuild_results_table() -> void:
	for child in rows_container.get_children():
		child.queue_free()

	if revealed_results.is_empty():
		return

	var my_user: Dictionary = GameManager.get_user_info()
	var my_user_id: String = str(my_user.get("id", my_user.get("user_id", "")))
	var opp_username: String = str(match_data.get("opponent", {}).get("username", ""))

	revealed_results.sort_custom(func(a, b):
		return float(a.lapSeconds) < float(b.lapSeconds)
	)

	var ref_secs: float = float(revealed_results[0].lapSeconds)

	var my_positions: Array = []
	var opp_positions: Array = []

	for i in range(revealed_results.size()):
		var pos: Dictionary = revealed_results[i]
		var position: int = int(pos.get("position", i + 1))
		var name: String = str(pos.get("name", "Driver"))
		var team: String = str(pos.get("team", "Team"))
		var lap_time: String = str(pos.get("lapTime", ""))
		var owner: String = str(pos.get("owner", "ai"))
		var user_id: String = str(pos.get("userId", ""))
		var compound: String = str(pos.get("compound", ""))

		var lap_secs: float = float(pos.get("lapSeconds", 0.0))
		if lap_secs <= 0.0:
			lap_secs = _parse_lap_time_str(lap_time)

		var gap_str: String = ""
		if i == 0:
			gap_str = "LEADER"
		else:
			var gap: float = lap_secs - ref_secs
			gap_str = "+%.3f" % gap

		var tyre_str: String = _get_tyre_text(compound)

		var is_you: bool = (user_id == my_user_id)
		var is_opponent: bool = (owner == "player1" or owner == "player2") and not is_you

		if is_you:
			my_positions.append(i + 1)
		elif is_opponent:
			opp_positions.append(i + 1)

		var row: HBoxContainer = ROW_SCENE.instantiate()
		rows_container.add_child(row)
		row.call_deferred("set_data", i + 1, name, team, tyre_str, lap_time, gap_str, is_you, is_opponent)

	if all_humans_revealed:
		var my_summary: String = "Driver 1: ---\nDriver 2: ---"
		if my_positions.size() >= 2:
			my_summary = "Driver 1: P%d\nDriver 2: P%d" % [my_positions[0], my_positions[1]]
		elif my_positions.size() == 1:
			my_summary = "Driver: P%d" % my_positions[0]
		your_summary.text = my_summary

		var opp_summary_text: String = "Driver 1: ---\nDriver 2: ---"
		if opp_positions.size() >= 2:
			opp_summary_text = "Driver 1: P%d\nDriver 2: P%d" % [opp_positions[0], opp_positions[1]]
		elif opp_positions.size() == 1:
			opp_summary_text = "Driver: P%d" % opp_positions[0]
		opp_summary.text = opp_summary_text

		if opp_username != "":
			opp_title.text = "OPPONENT  [%s]" % opp_username
		else:
			opp_title.text = "OPPONENT"

func _get_tyre_text(compound: String) -> String:
	match compound:
		"soft":
			return "SOFT"
		"medium":
			return "MED"
		"hard":
			return "HARD"
		"intermediate":
			return "INTER"
		"wet":
			return "WET"
		_:
			return ""

func _go_to_next_scene(tree: SceneTree) -> void:
	if tree == null:
		print("⚠️ _go_to_next_scene called with null SceneTree, aborting.")
		return

	# Qualifying után RACE jön!
	print("🏁 Going to Race Scene...")
	
	# Race data mentése GameManager-be
	GameManager.set_race_data({
		"match_data": match_data,
		"qualifying_grid": grid_positions
	})
	
	tree.change_scene_to_file("res://scenes/race/RaceScene.tscn")

func _on_continue_pressed() -> void:
	if continue_button.disabled:
		return
	var tree: SceneTree = Engine.get_main_loop() as SceneTree
	if tree != null:
		_go_to_next_scene(tree)

func _process(delta: float) -> void:
	if not results_received:
		return

	if not qualy_finished:
		sim_time = min(sim_time + delta, total_sim_duration)
		if total_sim_duration > 0.0:
			header_progress_bar.value = (sim_time / total_sim_duration) * 100.0

	_ai_reveal_step(delta)
	_update_human_cars()

	# Ha minden kész, ENABLE continue gomb
	if not qualy_finished and ai_pending.is_empty() and all_humans_revealed:
		qualy_finished = true
		status_label.text = "Qualifying Complete"
		header_progress_bar.value = 100.0
		
		# Continue gomb ENABLED
		continue_button.disabled = false
		continue_button.text = "Continue"

func _ai_reveal_step(delta: float) -> void:
	if ai_pending.is_empty():
		return

	ai_reveal_timer += delta
	if ai_reveal_timer >= ai_reveal_interval:
		ai_reveal_timer = 0.0
		var res: Dictionary = ai_pending.pop_front()
		revealed_results.append(res)
		_rebuild_results_table()

func _update_human_cars() -> void:
	if driver_sim_data.is_empty():
		return

	for d_variant in driver_sim_data:
		var d: Dictionary = d_variant
		var node: Sprite2D = d.node
		if node == null or not is_instance_valid(node):
			continue

		var finish_time: float = float(d.finish_time)
		var lap_secs: float = float(d.lap_seconds)
		var curve: Curve2D = d.curve
		var length: float = float(d.length)

		var progress_val: float = 0.0
		if finish_time > 0.0:
			progress_val = clamp(sim_time / finish_time, 0.0, 1.0)

		if curve != null and length > 0.0:
			var dist: float = progress_val * length
			node.position = curve.sample_baked(dist)
		else:
			var idx: int = driver_sim_data.find(d)
			node.position = _get_track_position(progress_val, idx)

		if not bool(d.revealed) and progress_val >= 1.0:
			d.revealed = true
			var res: Dictionary = d.result
			revealed_results.append(res)
			_rebuild_results_table()

	var all_revealed := true
	for d2_variant in driver_sim_data:
		var d2: Dictionary = d2_variant
		if not bool(d2.revealed):
			all_revealed = false
			break
	all_humans_revealed = all_revealed

func _exit_tree() -> void:
	if WebSocketManager.qualifying_results.is_connected(_on_qualifying_results):
		WebSocketManager.qualifying_results.disconnect(_on_qualifying_results)
