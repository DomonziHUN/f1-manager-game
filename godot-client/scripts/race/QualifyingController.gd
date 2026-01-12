extends Control

@onready var status_label = $CenterContainer/VBoxContainer/StatusLabel
@onready var progress_bar = $CenterContainer/VBoxContainer/ProgressBar
@onready var results_label = $CenterContainer/VBoxContainer/ResultsLabel

var qualifying_data: Dictionary = {}
var match_data: Dictionary = {}
var current_match_id: String = ""
var grid_positions: Array = []
var results_received: bool = false

func _ready():
	print("🏁 Qualifying scene loaded (server-based)")

	# Kapcsolódás WebSocket jelhez
	WebSocketManager.qualifying_results.connect(_on_qualifying_results)

	# Qualifying adat (RacePreparationController állította be)
	qualifying_data = GameManager.get_qualifying_data()
	match_data = qualifying_data.get("match_data", GameManager.get_current_match())

	if match_data.is_empty():
		status_label.text = "❌ No match data available"
		return

	current_match_id = str(match_data.get("matchId", match_data.get("id", "")))
	if current_match_id.is_empty():
		status_label.text = "❌ Invalid match ID"
		return

	status_label.text = "🏁 Requesting qualifying results from server..."
	progress_bar.visible = true
	progress_bar.value = 0

	# Kérés a szerver felé
	WebSocketManager.request_qualifying_results(current_match_id)

func _on_qualifying_results(data: Dictionary):
	# Ha több meccs is futna párhuzamosan, csak a sajátunk érdekel
	var match_id = str(data.get("matchId", ""))
	if match_id != current_match_id:
		return

	results_received = true
	grid_positions = data.get("grid", [])
	if grid_positions.is_empty():
		status_label.text = "❌ No qualifying data received"
		return

	status_label.text = "✅ Qualifying complete!"
	progress_bar.visible = false

	_display_results()

	# Grid eltárolása a későbbi futamhoz
	GameManager.set_race_data({"grid_positions": grid_positions})

	# Pár másodperc múlva továbbléphetünk (egyelőre vissza a dashboardra)
	await get_tree().create_timer(5.0).timeout
	_go_to_next_scene()

func _display_results():
	var my_user = GameManager.get_user_info()
	var my_user_id = str(my_user.get("id", my_user.get("user_id", "")))

	var result_text = "🏁 QUALIFYING RESULTS:\n\n"
	var my_positions: Array = []
	var opponent_positions: Array = []

	for i in range(grid_positions.size()):
		var pos = grid_positions[i]
		var position = int(pos.get("position", i + 1))
		var name = str(pos.get("name", "Driver"))
		var lap_time = str(pos.get("lapTime", ""))
		var owner = str(pos.get("owner", "ai"))    # 'player1' | 'player2' | 'ai'
		var user_id = str(pos.get("userId", ""))

		var position_str = str(position).pad_zeros(2)

		var suffix = ""
		if user_id == my_user_id:
			suffix = " (YOU)"
			my_positions.append(position)
		elif owner == "player1" or owner == "player2":
			# másik emberi játékos
			suffix = " (OPPONENT)"
			opponent_positions.append(position)

		if suffix == " (YOU)":
			result_text += "🏎️ P" + position_str + " - " + name + " - " + lap_time + suffix + "\n"
		elif suffix == " (OPPONENT)":
			result_text += "🏁 P" + position_str + " - " + name + " - " + lap_time + suffix + "\n"
		elif i < 10:
			result_text += "   P" + position_str + " - " + name + " - " + lap_time + "\n"

	result_text += "\n📊 YOUR QUALIFYING:\n"
	if my_positions.size() >= 2:
		result_text += "Pilot 1: P" + str(my_positions[0]) + "\n"
		result_text += "Pilot 2: P" + str(my_positions[1]) + "\n"
	elif my_positions.size() == 1:
		result_text += "Pilot: P" + str(my_positions[0]) + "\n"
	else:
		result_text += "No player cars found.\n"

	results_label.text = result_text

func _go_to_next_scene():
	print("🏁 Going to next scene (currently dashboard)...")
	get_tree().change_scene_to_file("res://scenes/dashboard/DashboardScene.tscn")

func _process(delta):
	if not results_received and progress_bar.visible:
		progress_bar.value = fmod(progress_bar.value + delta * 20.0, 100.0)