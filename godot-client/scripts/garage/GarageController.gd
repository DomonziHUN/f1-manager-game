extends Control

# UI References
@onready var back_button = $VBoxContainer/Header/HeaderContent/BackButton
@onready var tab_container = $VBoxContainer/TabContainer

# Pilots tab
@onready var slot1_info = $VBoxContainer/TabContainer/Pilots/PilotsContent/ActivePilots/Slot1Panel/Slot1Content/Slot1Info
@onready var slot1_button = $VBoxContainer/TabContainer/Pilots/PilotsContent/ActivePilots/Slot1Panel/Slot1Content/Slot1Button
@onready var slot2_info = $VBoxContainer/TabContainer/Pilots/PilotsContent/ActivePilots/Slot2Panel/Slot2Content/Slot2Info
@onready var slot2_button = $VBoxContainer/TabContainer/Pilots/PilotsContent/ActivePilots/Slot2Panel/Slot2Content/Slot2Button
@onready var pilots_list = $VBoxContainer/TabContainer/Pilots/PilotsContent/AllPilots/PilotsScrollContainer/PilotsList

# Car parts tab
@onready var stats_label = $"VBoxContainer/TabContainer/Car Parts/CarContent/CarStats/StatsPanel/StatsContent/StatsLabel"
@onready var parts_list = $"VBoxContainer/TabContainer/Car Parts/CarContent/CarParts/PartsScrollContainer/PartsList"

# Status
@onready var status_label = $VBoxContainer/StatusPanel/StatusContent/StatusLabel
@onready var save_button = $VBoxContainer/StatusPanel/StatusContent/SaveButton

# Data
var garage_data: Dictionary = {}
var selected_slot: int = 0  # 0 = none, 1 = slot1, 2 = slot2
var changes_made: bool = false

func _ready():
	print("🔧 Garage loaded")
	
	# Connect buttons
	back_button.pressed.connect(_on_back_pressed)
	slot1_button.pressed.connect(func(): _on_slot_button_pressed(1))
	slot2_button.pressed.connect(func(): _on_slot_button_pressed(2))
	save_button.pressed.connect(_on_save_pressed)
	
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
		
		"/game/pilots/activate":
			if success:
				status_label.text = "✅ Pilot activated!"
				changes_made = false
				save_button.disabled = true
				# Reload garage data
				_load_garage_data()
			else:
				status_label.text = "❌ Failed to activate pilot: " + str(data.get("error", "Unknown error"))

func _update_ui():
	var user = garage_data.get("user", {})
	var pilots = garage_data.get("pilots", [])
	var car_stats = garage_data.get("carStats", {})
	var car_parts = garage_data.get("carParts", [])
	
	# Update active pilots
	_update_active_pilots(pilots)
	
	# Update all pilots list
	_update_pilots_list(pilots)
	
	# Update car stats
	_update_car_stats(car_stats)
	
	# Update car parts list
	_update_car_parts_list(car_parts)
	
	status_label.text = "✅ Garage loaded"

func _update_active_pilots(pilots: Array):
	var slot1_pilot = null
	var slot2_pilot = null
	
	for pilot in pilots:
		if pilot.get("is_active_slot_1", 0) == 1:
			slot1_pilot = pilot
		elif pilot.get("is_active_slot_2", 0) == 1:
			slot2_pilot = pilot
	
	# Update slot 1
	if slot1_pilot:
		slot1_info.text = str(slot1_pilot.get("name", "Unknown")) + "\n" + str(slot1_pilot.get("team", "")) + "\nSpeed: " + str(slot1_pilot.get("total_speed", 0))
		slot1_button.text = "Change Pilot"
	else:
		slot1_info.text = "Empty\nNo pilot assigned"
		slot1_button.text = "Select Pilot"
	
	# Update slot 2
	if slot2_pilot:
		slot2_info.text = str(slot2_pilot.get("name", "Unknown")) + "\n" + str(slot2_pilot.get("team", "")) + "\nSpeed: " + str(slot2_pilot.get("total_speed", 0))
		slot2_button.text = "Change Pilot"
	else:
		slot2_info.text = "Empty\nNo pilot assigned"
		slot2_button.text = "Select Pilot"

func _update_pilots_list(pilots: Array):
	# Clear existing pilot buttons
	for child in pilots_list.get_children():
		child.queue_free()
	
		# Add pilot buttons
	for pilot in pilots:
		var pilot_button = Button.new()
		var pilot_name = str(pilot.get("name", "Unknown"))
		var pilot_team = str(pilot.get("team", ""))
		var pilot_speed = str(pilot.get("total_speed", 0))
		var is_active = pilot.get("is_active_slot_1", 0) == 1 or pilot.get("is_active_slot_2", 0) == 1
		
		# Button text
		var button_text = pilot_name + " (" + pilot_team + ")\nSpeed: " + pilot_speed
		if is_active:
			button_text += " ✅"
		
		pilot_button.text = button_text
		pilot_button.custom_minimum_size = Vector2(0, 60)
		
		# Connect button press
		var pilot_id = pilot.get("pilot_id", "")
		pilot_button.pressed.connect(func(): _on_pilot_selected(pilot_id, pilot_name))
		
		# Disable if no slot selected
		pilot_button.disabled = selected_slot == 0
		
		pilots_list.add_child(pilot_button)

func _update_car_stats(car_stats: Dictionary):
	var stats_text = "Speed: " + str(car_stats.get("speed", 0))
	stats_text += "\nAcceleration: " + str(car_stats.get("acceleration", 0))
	stats_text += "\nDownforce: " + str(car_stats.get("downforce", 0))
	stats_text += "\nReliability: " + str(car_stats.get("reliability", 0))
	stats_text += "\nPit Stop Speed: " + str(car_stats.get("pit_stop_speed", 0))
	stats_text += "\nTire Wear Reduction: " + str(car_stats.get("tire_wear_reduction", 0))
	stats_text += "\nERS Efficiency: " + str(car_stats.get("ers_efficiency", 0))
	
	stats_label.text = stats_text

func _update_car_parts_list(car_parts: Array):
	# Clear existing part buttons
	for child in parts_list.get_children():
		child.queue_free()
	
	# Group parts by type
	var parts_by_type = {}
	for part in car_parts:
		var part_type = part.get("part_type", "unknown")
		if not parts_by_type.has(part_type):
			parts_by_type[part_type] = []
		parts_by_type[part_type].append(part)
	
	# Add parts by type
	for part_type in parts_by_type.keys():
		# Add type header
		var type_label = Label.new()
		type_label.text = "=== " + part_type.to_upper() + " ==="
		parts_list.add_child(type_label)
		
		# Add parts of this type
		for part in parts_by_type[part_type]:
			var part_button = Button.new()
			var part_name = str(part.get("name", "Unknown"))
			var is_equipped = part.get("is_equipped", 0) == 1
			var rarity = str(part.get("rarity", "common"))
			
			var button_text = part_name + " (" + rarity + ")"
			if is_equipped:
				button_text += " ✅ EQUIPPED"
			
			part_button.text = button_text
			part_button.custom_minimum_size = Vector2(0, 40)
			
			# Connect button press
			var part_id = part.get("part_id", "")
			if not is_equipped:
				part_button.pressed.connect(func(): _on_part_selected(part_id, part_name))
			else:
				part_button.disabled = true
			
			parts_list.add_child(part_button)

func _on_slot_button_pressed(slot: int):
	selected_slot = slot
	status_label.text = "Select a pilot for Slot " + str(slot)
	
	# Update pilot buttons state
	for child in pilots_list.get_children():
		if child is Button:
			child.disabled = false

func _on_pilot_selected(pilot_id: String, pilot_name: String):
	if selected_slot == 0:
		status_label.text = "❌ Please select a slot first"
		return
	
	status_label.text = "Activating " + pilot_name + " in Slot " + str(selected_slot) + "..."
	changes_made = true
	save_button.disabled = false
	
	# Call API to activate pilot
	NetworkManager.activate_pilot(pilot_id, selected_slot)
	
	# Reset selection
	selected_slot = 0

func _on_part_selected(part_id: String, part_name: String):
	status_label.text = "Equipping " + part_name + "..."
	changes_made = true
	save_button.disabled = false
	
	# Call API to equip part
	NetworkManager.equip_car_part(part_id)

func _on_save_pressed():
	# This is handled automatically by the API calls
	status_label.text = "Changes saved!"
	changes_made = false
	save_button.disabled = true

func _on_back_pressed():
	print("🏠 Going back to dashboard...")
	
	# Try to load the scene
	var dashboard_scene_path = "res://scenes/dashboard/DashboardScene.tscn"
	
	if ResourceLoader.exists(dashboard_scene_path):
		get_tree().change_scene_to_file(dashboard_scene_path)
	else:
		print("❌ Dashboard scene not found at: " + dashboard_scene_path)
		# Fallback - go to login
		get_tree().change_scene_to_file("res://scenes/auth/LoginScene.tscn")