extends Control

# UI References
@onready var welcome_label = $ScrollContainer/VBoxContainer/Header/HeaderContent/UserInfo/WelcomeLabel
@onready var league_label = $ScrollContainer/VBoxContainer/Header/HeaderContent/UserInfo/LeagueLabel
@onready var coins_label = $ScrollContainer/VBoxContainer/Header/HeaderContent/Currency/CoinsLabel
@onready var gems_label = $ScrollContainer/VBoxContainer/Header/HeaderContent/Currency/GemsLabel
@onready var logout_button = $ScrollContainer/VBoxContainer/Header/HeaderContent/LogoutButton

@onready var pilot1_label = $ScrollContainer/VBoxContainer/MainContent/LeftPanel/PilotsPanel/PilotsContent/Pilot1
@onready var pilot2_label = $ScrollContainer/VBoxContainer/MainContent/LeftPanel/PilotsPanel/PilotsContent/Pilot2
@onready var car_stats_label = $ScrollContainer/VBoxContainer/MainContent/LeftPanel/CarPanel/CarContent/CarStats

@onready var find_match_button = $ScrollContainer/VBoxContainer/MainContent/RightPanel/ActionsPanel/ActionsContent/FindMatchButton
@onready var garage_button = $ScrollContainer/VBoxContainer/MainContent/RightPanel/ActionsPanel/ActionsContent/GarageButton
@onready var shop_button = $ScrollContainer/VBoxContainer/MainContent/RightPanel/ActionsPanel/ActionsContent/ShopButton
@onready var status_label = $ScrollContainer/VBoxContainer/MainContent/RightPanel/ActionsPanel/ActionsContent/StatusLabel

# Data
var garage_data: Dictionary = {}

func _ready():
	print("🏠 Dashboard loaded")
	
	# Connect buttons
	logout_button.pressed.connect(_on_logout_pressed)
	find_match_button.pressed.connect(_on_find_match_pressed)
	garage_button.pressed.connect(_on_garage_pressed)
	shop_button.pressed.connect(_on_shop_pressed)
	
	# Connect NetworkManager
	NetworkManager.request_completed.connect(_on_network_response)
	
	# Load garage data
	_load_garage_data()

func _load_garage_data():
	status_label.text = "Loading garage data..."
	NetworkManager.get_garage()

func _on_network_response(endpoint: String, success: bool, data: Dictionary):
	match endpoint:
		"/game/garage":
			if success:
				garage_data = data.data
				_update_ui()
			else:
				status_label.text = "❌ Failed to load garage data"

func _update_ui():
	var user = garage_data.get("user", {})
	var pilots = garage_data.get("pilots", [])
	var car_stats = garage_data.get("carStats", {})
	var league = garage_data.get("league", {})
	
	# Update header
	welcome_label.text = "Welcome back, " + str(user.get("username", "Player")) + "!"
	league_label.text = str(league.get("name", "Unknown League")) + " - " + str(user.get("league_points", 0)) + " points"
	coins_label.text = "💰 " + str(user.get("coins", 0))
	gems_label.text = "💎 " + str(user.get("gems", 0))
	
	# Update pilots
	var active_pilots = []
	for pilot in pilots:
		if pilot.get("is_active_slot_1", 0) == 1:
			active_pilots.append({"slot": 1, "pilot": pilot})
		elif pilot.get("is_active_slot_2", 0) == 1:
			active_pilots.append({"slot": 2, "pilot": pilot})
	
	# Sort by slot
	active_pilots.sort_custom(func(a, b): return a.slot < b.slot)
	
	if active_pilots.size() >= 1:
		var p1 = active_pilots[0].pilot
		pilot1_label.text = "Slot 1: " + str(p1.get("name", "Unknown")) + " (" + str(p1.get("total_speed", 0)) + " speed)"
	else:
		pilot1_label.text = "Slot 1: Empty"
	
	if active_pilots.size() >= 2:
		var p2 = active_pilots[1].pilot
		pilot2_label.text = "Slot 2: " + str(p2.get("name", "Unknown")) + " (" + str(p2.get("total_speed", 0)) + " speed)"
	else:
		pilot2_label.text = "Slot 2: Empty"
	
	# Update car stats
	var stats_text = "Speed: " + str(car_stats.get("speed", 0))
	stats_text += "\nAcceleration: " + str(car_stats.get("acceleration", 0))
	stats_text += "\nDownforce: " + str(car_stats.get("downforce", 0))
	stats_text += "\nReliability: " + str(car_stats.get("reliability", 0))
	car_stats_label.text = stats_text
	
	# Enable find match if we have 2 pilots
	var can_race = active_pilots.size() >= 2
	find_match_button.disabled = not can_race
	
	if can_race:
		status_label.text = "✅ Ready to race!"
	else:
		status_label.text = "⚠️ Need 2 active pilots to race"

func _on_logout_pressed():
	print("🚪 Logging out...")
	NetworkManager.logout()
	var login_scene = preload("res://scenes/auth/LoginScene.tscn")
	get_tree().change_scene_to_packed(login_scene)

func _on_find_match_pressed():
	print("🏁 Finding match...")
	var matchmaking_scene = preload("res://scenes/matchmaking/MatchmakingScene.tscn")
	get_tree().change_scene_to_packed(matchmaking_scene)

func _on_garage_pressed():
	print("🔧 Opening garage...")
	var garage_scene = preload("res://scenes/garage/GarageScene.tscn")
	get_tree().change_scene_to_packed(garage_scene)


func _on_shop_pressed():
	print("🛒 Opening shop...")
	# TODO: Implement shop scene 
