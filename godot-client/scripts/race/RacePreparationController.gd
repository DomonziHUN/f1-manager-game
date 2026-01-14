extends Control

# Header
@onready var title_label: Label = $Header/TitleLabel
@onready var track_label: Label = $Header/TrackLabel
@onready var weather_label: Label = $Header/WeatherLabel
@onready var time_label: Label = $Header/TimeLabel

# Left – driver cards
@onready var pilot1_card: Button = $Main/LeftPanel/Margin/LeftContent/Pilot1Card
@onready var pilot1_name_label: Label = $Main/LeftPanel/Margin/LeftContent/Pilot1Card/Pilot1VBox/PilotName
@onready var pilot1_team_label: Label = $Main/LeftPanel/Margin/LeftContent/Pilot1Card/Pilot1VBox/PilotTeam
@onready var pilot1_stats_label: Label = $Main/LeftPanel/Margin/LeftContent/Pilot1Card/Pilot1VBox/PilotStats
@onready var pilot1_tyre_label: Label = $Main/LeftPanel/Margin/LeftContent/Pilot1Card/Pilot1VBox/PilotTyre

@onready var pilot2_card: Button = $Main/LeftPanel/Margin/LeftContent/Pilot2Card
@onready var pilot2_name_label: Label = $Main/LeftPanel/Margin/LeftContent/Pilot2Card/Pilot2VBox/PilotName
@onready var pilot2_team_label: Label = $Main/LeftPanel/Margin/LeftContent/Pilot2Card/Pilot2VBox/PilotTeam
@onready var pilot2_stats_label: Label = $Main/LeftPanel/Margin/LeftContent/Pilot2Card/Pilot2VBox/PilotStats
@onready var pilot2_tyre_label: Label = $Main/LeftPanel/Margin/LeftContent/Pilot2Card/Pilot2VBox/PilotTyre

# Center – tyre selection
@onready var tyre_title_label: Label = $Main/CenterPanel/Margin/CenterContent/TyreTitle
@onready var soft_button: Button = $Main/CenterPanel/Margin/CenterContent/DryButtons/SoftButton
@onready var medium_button: Button = $Main/CenterPanel/Margin/CenterContent/DryButtons/MediumButton
@onready var hard_button: Button = $Main/CenterPanel/Margin/CenterContent/DryButtons/HardButton
@onready var inter_button: Button = $Main/CenterPanel/Margin/CenterContent/WetButtons/InterButton
@onready var wet_button: Button = $Main/CenterPanel/Margin/CenterContent/WetButtons/WetButton
@onready var tyre_info_label: Label = $Main/CenterPanel/Margin/CenterContent/TyreInfo

# Right – opponent
@onready var opponent_title_label: Label = $Main/RightPanel/Margin/RightContent/OpponentTitle
@onready var opponent_name_label: Label = $Main/RightPanel/Margin/RightContent/OpponentName
@onready var opponent_league_label: Label = $Main/RightPanel/Margin/RightContent/OpponentLeague
@onready var opponent_status_label: Label = $Main/RightPanel/Margin/RightContent/OpponentStatus

# Footer
@onready var status_label: Label = $Footer/StatusLabel
@onready var ready_button: Button = $Footer/ReadyButton

# Data
var match_data: Dictionary = {}
var user_pilots: Array = []
var current_weather: String = "dry"

var pilot_tires: Array = ["", ""]  # [pilot1, pilot2]
var selected_pilot_index: int = 0  # 0 vagy 1

var preparation_time: float = 30.0
var is_ready: bool = false

var tire_compounds: Dictionary = {
	"soft": {
		"name": "Soft",
		"emoji": "🔴",
		"dry_speed": 1.05,
		"wet_speed": 0.7,
		"wear": "High"
	},
	"medium": {
		"name": "Medium",
		"emoji": "🟡",
		"dry_speed": 1.0,
		"wet_speed": 0.65,
		"wear": "Medium"
	},
	"hard": {
		"name": "Hard",
		"emoji": "⚪",
		"dry_speed": 0.96,
		"wet_speed": 0.6,
		"wear": "Low"
	},
	"intermediate": {
		"name": "Intermediate",
		"emoji": "🟢",
		"dry_speed": 0.85,
		"wet_speed": 1.1,
		"wear": "Medium-High"
	},
	"wet": {
		"name": "Full Wet",
		"emoji": "🔵",
		"dry_speed": 0.8,
		"wet_speed": 1.0,
		"wear": "Medium"
	}
}

func _ready() -> void:
	print("🏁 Race Preparation loaded")

	title_label.text = "🏁 Race Preparation"

	pilot1_card.pressed.connect(_on_pilot1_pressed)
	pilot2_card.pressed.connect(_on_pilot2_pressed)
	soft_button.pressed.connect(func() -> void: _select_tire_for_current_pilot("soft"))
	medium_button.pressed.connect(func() -> void: _select_tire_for_current_pilot("medium"))
	hard_button.pressed.connect(func() -> void: _select_tire_for_current_pilot("hard"))
	inter_button.pressed.connect(func() -> void: _select_tire_for_current_pilot("intermediate"))
	wet_button.pressed.connect(func() -> void: _select_tire_for_current_pilot("wet"))
	ready_button.pressed.connect(_on_ready_pressed)

	WebSocketManager.race_preparation_update.connect(_on_race_preparation_update)
	WebSocketManager.qualifying_start.connect(_on_qualifying_start)
	WebSocketManager.weather_update.connect(_on_weather_update)

	_load_match_data()
	_load_pilots()
	_auto_assign_default_tires()
	_update_ui()

func _load_match_data() -> void:
	match_data = GameManager.get_current_match()
	if match_data.is_empty():
		return

	var track: Dictionary = match_data.get("track", {})
	var track_name: String = str(track.get("name", "Unknown"))
	var laps: int = int(track.get("laps", 0))
	track_label.text = "Track: %s (%d laps)" % [track_name, laps]

	current_weather = str(match_data.get("weather", "dry"))
	weather_label.text = "%s Weather: %s" % [GameManager.get_weather_emoji(current_weather), current_weather.capitalize()]

	var opp: Dictionary = match_data.get("opponent", {})
	var opp_name: String = str(opp.get("username", "Unknown"))
	var opp_league: int = int(opp.get("league", 1))

	opponent_name_label.text = opp_name
	opponent_league_label.text = "League %d" % opp_league
	opponent_status_label.text = "Preparing..."

func _load_pilots() -> void:
	user_pilots = GameManager.get_active_pilots()
	if user_pilots.size() >= 1:
		_set_pilot_card(user_pilots[0], pilot1_name_label, pilot1_team_label, pilot1_stats_label)
	if user_pilots.size() >= 2:
		_set_pilot_card(user_pilots[1], pilot2_name_label, pilot2_team_label, pilot2_stats_label)

func _set_pilot_card(pilot: Dictionary, name_label: Label, team_label: Label, stats_label: Label) -> void:
	var name: String = str(pilot.get("name", "Pilot"))
	var team: String = str(pilot.get("team", "Team"))
	var pace: float = float(pilot.get("total_speed", 75.0))
	var tire_mgmt: float = float(pilot.get("total_tire_management", 75.0))
	var wet_skill: float = float(pilot.get("base_wet_skill", 75.0))

	name_label.text = name
	team_label.text = team
	stats_label.text = "Pace: %.0f  Tire: %.0f  Wet: %.0f" % [pace, tire_mgmt, wet_skill]

func _auto_assign_default_tires() -> void:
	var recommended: String = "medium"
	if current_weather == "light_rain":
		recommended = "intermediate"
	elif current_weather == "heavy_rain" or current_weather == "storm":
		recommended = "wet"

	pilot_tires[0] = recommended
	pilot_tires[1] = recommended

	selected_pilot_index = 0
	_update_pilot_highlight()
	_update_tyre_title()
	_update_pilot_tyre_labels()
	_update_tyre_buttons_state()
	_update_tyre_info(pilot_tires[selected_pilot_index])
	_update_ready_state()

func _update_ui() -> void:
	time_label.text = "Time remaining: %02d:%02d" % [int(preparation_time) / 60, int(preparation_time) % 60]

func _update_pilot_highlight() -> void:
	pilot1_card.modulate = Color(0.85, 0.85, 0.9, 1)
	pilot2_card.modulate = Color(0.85, 0.85, 0.9, 1)
	if selected_pilot_index == 0:
		pilot1_card.modulate = Color(1.0, 1.0, 1.0, 1)
	else:
		pilot2_card.modulate = Color(1.0, 1.0, 1.0, 1)

func _update_pilot_tyre_labels() -> void:
	var p1_t: String = str(pilot_tires[0])
	var p2_t: String = str(pilot_tires[1])
	if p1_t == "":
		pilot1_tyre_label.text = "Tyre: -"
	else:
		pilot1_tyre_label.text = "Tyre: %s %s" % [GameManager.get_tire_emoji(p1_t), p1_t.capitalize()]

	if p2_t == "":
		pilot2_tyre_label.text = "Tyre: -"
	else:
		pilot2_tyre_label.text = "Tyre: %s %s" % [GameManager.get_tire_emoji(p2_t), p2_t.capitalize()]

func _update_tyre_title() -> void:
	var name: String = "-"
	if selected_pilot_index == 0 and user_pilots.size() >= 1:
		name = str(user_pilots[0].get("name", "Pilot 1"))
	elif selected_pilot_index == 1 and user_pilots.size() >= 2:
		name = str(user_pilots[1].get("name", "Pilot 2"))
	tyre_title_label.text = "Starting tyre for: " + name

func _update_tyre_buttons_state() -> void:
	var compound: String = str(pilot_tires[selected_pilot_index])

	soft_button.button_pressed = (compound == "soft")
	medium_button.button_pressed = (compound == "medium")
	hard_button.button_pressed = (compound == "hard")
	inter_button.button_pressed = (compound == "intermediate")
	wet_button.button_pressed = (compound == "wet")

func _update_tyre_info(compound: String) -> void:
	if compound == "":
		tyre_info_label.text = "Select a tyre to see details."
		return

	var data: Dictionary = tire_compounds.get(compound, {})
	var name: String = str(data.get("name", compound.capitalize()))
	var emoji: String = str(data.get("emoji", "⚫"))
	var dry_speed: float = float(data.get("dry_speed", 1.0))
	var wet_speed: float = float(data.get("wet_speed", 1.0))
	var wear_text: String = str(data.get("wear", "Medium"))

	var text: String = "%s %s\n\n" % [emoji, name]
	if current_weather == "dry":
		text += "Dry performance: %.0f%%\n" % (dry_speed * 100.0)
		text += "Wet performance: %.0f%%\n" % (wet_speed * 100.0)
	else:
		text += "Wet performance: %.0f%%\n" % (wet_speed * 100.0)
		text += "Dry performance: %.0f%%\n" % (dry_speed * 100.0)

	text += "Wear: %s\n\n" % wear_text

	if current_weather == "dry" and (compound == "intermediate" or compound == "wet"):
		text += "⚠️ Wet tyres overheat and are very slow in dry conditions!"
	elif current_weather != "dry" and (compound == "soft" or compound == "medium" or compound == "hard"):
		text += "⚠️ Slick tyres are dangerous and very slow in wet conditions!"
	else:
		text += "✅ Good choice for current weather."

	tyre_info_label.text = text

func _select_tire_for_current_pilot(compound: String) -> void:
	pilot_tires[selected_pilot_index] = compound
	_update_tyre_buttons_state()
	_update_pilot_tyre_labels()
	_update_tyre_info(compound)
	_update_ready_state()

func _on_pilot1_pressed() -> void:
	selected_pilot_index = 0
	_update_pilot_highlight()
	_update_tyre_title()
	_update_tyre_buttons_state()
	_update_tyre_info(str(pilot_tires[selected_pilot_index]))

func _on_pilot2_pressed() -> void:
	selected_pilot_index = 1
	_update_pilot_highlight()
	_update_tyre_title()
	_update_tyre_buttons_state()
	_update_tyre_info(str(pilot_tires[selected_pilot_index]))

func _update_ready_state() -> void:
	var p1_ok: bool = (str(pilot_tires[0]) != "")
	var p2_ok: bool = (str(pilot_tires[1]) != "")

	if p1_ok and p2_ok:
		ready_button.disabled = false
		status_label.text = "✅ Both drivers have tyres selected. Ready to start!"
	else:
		ready_button.disabled = true
		status_label.text = "Select tyres for both drivers."

func _on_ready_pressed() -> void:
	if ready_button.disabled:
		return

	is_ready = true
	ready_button.disabled = true
	ready_button.text = "Ready!"
	status_label.text = "✅ Ready! Waiting for opponent..."
	opponent_status_label.text = "⏳ Waiting for opponent..."

	var prep_data := {
		"matchId": match_data.get("matchId", match_data.get("id", "")),
		"pilot1_tire": str(pilot_tires[0]),
		"pilot2_tire": str(pilot_tires[1])
	}
	WebSocketManager.send_race_preparation(prep_data)

func _on_race_preparation_update(data: Dictionary) -> void:
	print("📊 Race preparation update: " + str(data))

func _on_qualifying_start(data: Dictionary) -> void:
	print("🏁 Qualifying starting (server): " + str(data))
	_start_qualifying()

func _on_weather_update(data: Dictionary) -> void:
	print("🌤️ Weather update: " + str(data))
	current_weather = str(data.get("weather", current_weather))
	weather_label.text = "%s Weather: %s" % [GameManager.get_weather_emoji(current_weather), current_weather.capitalize()]
	_update_tyre_info(str(pilot_tires[selected_pilot_index]))

func _start_qualifying() -> void:
	print("🏁 Starting qualifying (server-based)...")

	var qualifying_data := {
		"match_data": match_data,
		"weather": current_weather,
		"pilot1_tire": str(pilot_tires[0]),
		"pilot2_tire": str(pilot_tires[1]),
		"user_pilots": user_pilots,
		"seed": match_data.get("seed", 0)
	}
	GameManager.set_qualifying_data(qualifying_data)

	var qualifying_scene: PackedScene = preload("res://scenes/race/QualifyingScene.tscn")
	get_tree().change_scene_to_packed(qualifying_scene)

func _process(delta: float) -> void:
	if preparation_time > 0.0:
		preparation_time -= delta
		if preparation_time < 0.0:
			preparation_time = 0.0

		time_label.text = "Time remaining: %02d:%02d" % [int(preparation_time) / 60, int(preparation_time) % 60]

		if preparation_time <= 0.0:
			_auto_ready()

func _auto_ready() -> void:
	if is_ready:
		return

	for i in range(2):
		if str(pilot_tires[i]) == "":
			var recommended: String = "medium"
			if current_weather == "light_rain":
				recommended = "intermediate"
			elif current_weather == "heavy_rain" or current_weather == "storm":
				recommended = "wet"
			pilot_tires[i] = recommended

	_update_pilot_tyre_labels()
	_update_tyre_buttons_state()
	_update_tyre_info(str(pilot_tires[selected_pilot_index]))
	_update_ready_state()
	_on_ready_pressed()

func _exit_tree() -> void:
	if WebSocketManager.race_preparation_update.is_connected(_on_race_preparation_update):
		WebSocketManager.race_preparation_update.disconnect(_on_race_preparation_update)
	if WebSocketManager.qualifying_start.is_connected(_on_qualifying_start):
		WebSocketManager.qualifying_start.disconnect(_on_qualifying_start)
	if WebSocketManager.weather_update.is_connected(_on_weather_update):
		WebSocketManager.weather_update.disconnect(_on_weather_update)
