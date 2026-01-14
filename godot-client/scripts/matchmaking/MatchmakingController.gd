extends Control

# UI References
@onready var status_label = $CenterContainer/MainPanel/VBoxContainer/StatusLabel
@onready var league_label = $CenterContainer/MainPanel/VBoxContainer/QueueInfo/LeagueLabel
@onready var players_label = $CenterContainer/MainPanel/VBoxContainer/QueueInfo/PlayersLabel
@onready var time_label = $CenterContainer/MainPanel/VBoxContainer/QueueInfo/TimeLabel

@onready var loading_spinner = $CenterContainer/MainPanel/VBoxContainer/LoadingContainer/LoadingSpinner
@onready var progress_bar = $CenterContainer/MainPanel/VBoxContainer/LoadingContainer/ProgressBar

@onready var cancel_button = $CenterContainer/MainPanel/VBoxContainer/ButtonContainer/CancelButton
@onready var find_match_button = $CenterContainer/MainPanel/VBoxContainer/ButtonContainer/FindMatchButton

@onready var match_found_panel = $CenterContainer/MainPanel/VBoxContainer/MatchFoundPanel
@onready var opponent_label = $CenterContainer/MainPanel/VBoxContainer/MatchFoundPanel/MatchFoundContent/OpponentLabel
@onready var track_label = $CenterContainer/MainPanel/VBoxContainer/MatchFoundPanel/MatchFoundContent/TrackLabel

enum MatchmakingState { READY, CONNECTING, SEARCHING, IN_QUEUE, MATCH_FOUND }
var current_state: MatchmakingState = MatchmakingState.READY
var queue_timer: float = 0.0

var match_data: Dictionary = {}

func _ready():
	print("🎮 Matchmaking scene loaded")

	cancel_button.pressed.connect(_on_cancel_pressed)
	find_match_button.pressed.connect(_on_find_match_pressed)

	WebSocketManager.connected.connect(_on_websocket_connected)
	WebSocketManager.disconnected.connect(_on_websocket_disconnected)
	WebSocketManager.authenticated.connect(_on_websocket_authenticated)
	WebSocketManager.auth_error.connect(_on_websocket_auth_error)

	WebSocketManager.queue_joined.connect(_on_queue_joined)
	WebSocketManager.queue_left.connect(_on_queue_left)
	WebSocketManager.queue_error.connect(_on_queue_error)
	WebSocketManager.queue_update.connect(_on_queue_update)
	WebSocketManager.match_found.connect(_on_match_found)

	_initialize_websocket()

func _initialize_websocket():
	_set_state(MatchmakingState.CONNECTING)
	if not WebSocketManager.is_connected:
		WebSocketManager.connect_to_server()
	else:
		_authenticate_websocket()

func _authenticate_websocket():
	if NetworkManager.auth_token.is_empty():
		status_label.text = "❌ No auth token available"
		_set_state(MatchmakingState.READY)
		return
	WebSocketManager.authenticate(NetworkManager.auth_token)

func _set_state(new_state: MatchmakingState):
	current_state = new_state
	match current_state:
		MatchmakingState.READY:
			status_label.text = "Ready to find a match"
			loading_spinner.visible = false
			progress_bar.visible = false
			find_match_button.disabled = false
			find_match_button.text = "🔍 Find Match"
			cancel_button.text = "← Back to Dashboard"
			cancel_button.disabled = false
			match_found_panel.visible = false

		MatchmakingState.CONNECTING:
			status_label.text = "Connecting to matchmaking server..."
			loading_spinner.visible = true
			loading_spinner.text = "🔄 Connecting..."
			progress_bar.visible = false
			find_match_button.disabled = true
			cancel_button.text = "← Back to Dashboard"
			cancel_button.disabled = false

		MatchmakingState.SEARCHING:
			status_label.text = "Joining matchmaking queue..."
			loading_spinner.visible = true
			loading_spinner.text = "🔄 Joining queue..."
			progress_bar.visible = false
			find_match_button.disabled = true
			cancel_button.text = "Cancel"
			cancel_button.disabled = false

		MatchmakingState.IN_QUEUE:
			status_label.text = "Searching for opponents..."
			loading_spinner.visible = true
			loading_spinner.text = "🔄 Searching for opponents..."
			progress_bar.visible = true
			find_match_button.disabled = true
			cancel_button.text = "Leave Queue"
			cancel_button.disabled = false

		MatchmakingState.MATCH_FOUND:
			status_label.text = "Match found!"
			loading_spinner.visible = false
			progress_bar.visible = false
			find_match_button.disabled = true
			cancel_button.disabled = true
			match_found_panel.visible = true

func _on_websocket_connected():
	print("✅ WebSocket connected, authenticating...")
	_authenticate_websocket()

func _on_websocket_disconnected():
	print("❌ WebSocket disconnected")
	status_label.text = "❌ Connection lost. Reconnecting..."
	_set_state(MatchmakingState.CONNECTING)

func _on_websocket_authenticated(user_data: Dictionary):
	print("✅ WebSocket authenticated")
	_set_state(MatchmakingState.READY)
	var user = user_data.get("user", {})
	league_label.text = "League: " + str(user.get("league", 1))

func _on_websocket_auth_error(error: String):
	print("❌ WebSocket auth error: " + error)
	status_label.text = "❌ Authentication failed: " + error
	_set_state(MatchmakingState.READY)

func _on_queue_joined(data: Dictionary):
	print("✅ Joined queue: " + str(data))
	_set_state(MatchmakingState.IN_QUEUE)
	queue_timer = 0.0
	players_label.text = "Players in queue: " + str(data.get("playersInQueue", 0))
	time_label.text = "Estimated wait: " + str(data.get("estimatedWaitTime", "Unknown"))

func _on_queue_left():
	print("✅ Left queue")
	_set_state(MatchmakingState.READY)

func _on_queue_error(error: String):
	print("❌ Queue error: " + error)
	status_label.text = "❌ Queue error: " + error
	_set_state(MatchmakingState.READY)

func _on_queue_update(data: Dictionary):
	print("📊 Queue update: " + str(data))
	players_label.text = "Players in queue: " + str(data.get("playersInQueue", 0))

func _on_match_found(data: Dictionary):
	print("🎉 Match found: " + str(data))
	match_data = data
	_show_match_found(data)

func _on_find_match_pressed():
	print("🔍 Starting matchmaking...")
	_set_state(MatchmakingState.SEARCHING)
	WebSocketManager.join_queue()

func _on_cancel_pressed():
	match current_state:
		MatchmakingState.READY, MatchmakingState.CONNECTING:
			_go_back_to_dashboard()
		MatchmakingState.SEARCHING, MatchmakingState.IN_QUEUE:
			print("🚪 Leaving queue...")
			WebSocketManager.leave_queue()

func _show_match_found(data: Dictionary):
	var opponent = data.get("opponent", {})
	var track = data.get("track", {})
	opponent_label.text = "Opponent: " + str(opponent.get("username", "Unknown Player"))
	track_label.text = "Track: " + str(track.get("name", "Unknown")) + " (" + str(track.get("laps", 0)) + " laps)"

	_set_state(MatchmakingState.MATCH_FOUND)

	# Teljes match payload mentése (matchId, weather, seed, track, opponent, stb.)
	GameManager.set_current_match(data)

	status_label.text = "🎉 Match found! Starting race preparation..."

	await get_tree().create_timer(3.0).timeout
	_go_to_race_preparation()

func _go_to_race_preparation():
	print("🏁 Going to race preparation...")
	var race_prep_scene = preload("res://scenes/race/RacePreparationScene.tscn")
	get_tree().change_scene_to_packed(race_prep_scene)

func _go_back_to_dashboard():
	print("🏠 Going back to dashboard...")
	WebSocketManager.disconnect_from_server()
	get_tree().change_scene_to_file("res://scenes/dashboard/DashboardScene.tscn")

func _process(delta):
	if current_state == MatchmakingState.IN_QUEUE:
		queue_timer += delta
		var progress = fmod(queue_timer * 0.3, 1.0)
		progress_bar.value = progress * 100
		var minutes = int(queue_timer / 60)
		var seconds = int(queue_timer) % 60
		time_label.text = "Time in queue: %02d:%02d" % [minutes, seconds]

func _exit_tree():
	if WebSocketManager.is_connected:
		WebSocketManager.leave_queue()
