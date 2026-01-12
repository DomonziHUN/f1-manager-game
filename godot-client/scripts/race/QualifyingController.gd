extends Control

@onready var status_label = $CenterContainer/VBoxContainer/StatusLabel
@onready var progress_bar = $CenterContainer/VBoxContainer/ProgressBar
@onready var results_label = $CenterContainer/VBoxContainer/ResultsLabel

var qualifying_data: Dictionary = {}
var simulation_time: float = 8.0
var current_time: float = 0.0
var grid_positions: Array = []

func _ready():
	print("🏁 Qualifying scene loaded")
	
	# Load qualifying data
	qualifying_data = GameManager.get_qualifying_data()
	print("📊 Qualifying data: " + str(qualifying_data))
	
	# Start simulation
	_start_qualifying_simulation()

func _start_qualifying_simulation():
	status_label.text = "🏁 Qualifying in progress..."
	results_label.text = "Drivers are setting their lap times..."
	current_time = 0.0
	
	# Generate realistic grid positions
	_simulate_qualifying_results()
	
	# Simulate qualifying for 8 seconds with live updates
	var tween = create_tween()
	tween.tween_method(_update_progress, 0.0, 100.0, simulation_time)
	tween.tween_callback(_finish_qualifying)

func _simulate_qualifying_results():
	# Create 20-car grid with realistic performance
	var drivers = []
	
	# Get user pilots
	var user_pilots = qualifying_data.get("user_pilots", [])
	var weather = qualifying_data.get("weather", "dry")
	var pilot1_tire = qualifying_data.get("pilot1_tire", "medium")
	var pilot2_tire = qualifying_data.get("pilot2_tire", "medium")
	
	# Add user's pilots
	if user_pilots.size() >= 2:
		var pilot1 = user_pilots[0]
		var pilot2 = user_pilots[1]
		
		# Calculate qualifying performance based on pilot stats + tire choice + weather
		var pilot1_performance = _calculate_qualifying_performance(pilot1, pilot1_tire, weather)
		var pilot2_performance = _calculate_qualifying_performance(pilot2, pilot2_tire, weather)
		
		drivers.append({
			"name": pilot1.get("name", "Pilot 1"),
			"team": pilot1.get("team", "Your Team"),
			"performance": pilot1_performance,
			"is_player": true,
			"pilot_slot": 1
		})
		
		drivers.append({
			"name": pilot2.get("name", "Pilot 2"),
			"team": pilot2.get("team", "Your Team"),
			"performance": pilot2_performance,
			"is_player": true,
			"pilot_slot": 2
		})
	
	# Add opponent's pilots (simulated)
	var opponent = qualifying_data.get("match_data", {}).get("opponent", {})
	var opponent_name = opponent.get("username", "Opponent")
	
	drivers.append({
		"name": opponent_name + " #1",
		"team": "Opponent Team",
		"performance": randf_range(75, 90),
		"is_opponent": true
	})
	
	drivers.append({
		"name": opponent_name + " #2",
		"team": "Opponent Team",
		"performance": randf_range(75, 90),
		"is_opponent": true
	})
	
	# Add 16 AI drivers
	var ai_names = [
		"Max Verstappen", "Lewis Hamilton", "Charles Leclerc", "Lando Norris",
		"Carlos Sainz", "George Russell", "Sergio Perez", "Fernando Alonso",
		"Oscar Piastri", "Lance Stroll", "Pierre Gasly", "Esteban Ocon",
		"Alex Albon", "Valtteri Bottas", "Zhou Guanyu", "Kevin Magnussen"
	]
	
	for i in range(16):
		drivers.append({
			"name": ai_names[i],
			"team": "AI Team",
			"performance": randf_range(60, 95),
			"is_ai": true
		})
	
	# Sort by performance (higher = better)
	drivers.sort_custom(func(a, b): return a.performance > b.performance)
	
	# Assign grid positions
	grid_positions = []
	for i in range(drivers.size()):
		grid_positions.append({
			"position": i + 1,
			"driver": drivers[i],
			"lap_time": _generate_lap_time(drivers[i].performance)
		})

func _calculate_qualifying_performance(pilot: Dictionary, tire: String, weather: String) -> float:
	# Base performance from pilot stats
	var base_speed = pilot.get("total_speed", 75)
	var base_cornering = pilot.get("total_cornering", 75)
	var base_consistency = pilot.get("total_consistency", 75)
	
	# Average pilot performance
	var pilot_performance = (base_speed + base_cornering + base_consistency) / 3.0
	
	# Tire performance modifier
	var tire_data = {
		"soft": {"dry": 1.05, "wet": 0.7},
		"medium": {"dry": 1.0, "wet": 0.65},
		"hard": {"dry": 0.95, "wet": 0.6},
		"intermediate": {"dry": 0.85, "wet": 1.1},
		"wet": {"dry": 0.75, "wet": 1.0}
	}
	
	var tire_modifier = 1.0
	if tire_data.has(tire):
		if weather == "dry":
			tire_modifier = tire_data[tire].dry
		else:
			tire_modifier = tire_data[tire].wet
	
	# Weather skill modifier
	var weather_modifier = 1.0
	if weather != "dry":
		var wet_skill = pilot.get("base_wet_skill", 75)
		weather_modifier = wet_skill / 100.0
	
	# Random factor for realism
	var random_factor = randf_range(0.95, 1.05)
	
	return pilot_performance * tire_modifier * weather_modifier * random_factor

func _generate_lap_time(performance: float) -> String:
	# Base lap time for Spa: ~1:44.000
	var base_time = 104.0  # seconds
	
	# Performance affects lap time (higher performance = faster time)
	var time_modifier = (100.0 - performance) / 100.0 * 5.0  # Up to 5 seconds difference
	var final_time = base_time + time_modifier + randf_range(-0.5, 0.5)
	
	var minutes = int(final_time / 60)
	var seconds = final_time - (minutes * 60)
	
	return "%d:%06.3f" % [minutes, seconds]

func _update_progress(value: float):
	progress_bar.value = value
	current_time = (value / 100.0) * simulation_time
	
	var remaining = simulation_time - current_time
	status_label.text = "🏁 Qualifying... " + str(int(remaining)) + "s remaining"
	
	# Show intermediate results
	if value > 25 and value < 75:
		_show_intermediate_results()

func _show_intermediate_results():
	var result_text = "Current positions:\n\n"
	
	# Show top 10 positions
	for i in range(min(10, grid_positions.size())):
		var pos = grid_positions[i]
		var driver = pos.driver
		var position_str = str(pos.position).pad_zeros(2)
		
		if driver.get("is_player", false):
			result_text += "🏎️ P" + position_str + " - " + driver.name + " (YOU)\n"
		elif driver.get("is_opponent", false):
			result_text += "🏁 P" + position_str + " - " + driver.name + " (OPPONENT)\n"
		else:
			result_text += "   P" + position_str + " - " + driver.name + "\n"
	
	results_label.text = result_text

func _finish_qualifying():
	status_label.text = "✅ Qualifying complete!"
	
	# Show final results
	var result_text = "🏁 QUALIFYING RESULTS:\n\n"
	
	var player_positions = []
	var opponent_positions = []
	
	for i in range(grid_positions.size()):
		var pos = grid_positions[i]
		var driver = pos.driver
		var position_str = str(pos.position).pad_zeros(2)
		
		if driver.get("is_player", false):
			player_positions.append(pos.position)
			result_text += "🏎️ P" + position_str + " - " + driver.name + " - " + pos.lap_time + " (YOU)\n"
		elif driver.get("is_opponent", false):
			opponent_positions.append(pos.position)
			result_text += "🏁 P" + position_str + " - " + driver.name + " - " + pos.lap_time + " (OPPONENT)\n"
		elif i < 10:  # Show top 10 AI
			result_text += "   P" + position_str + " - " + driver.name + " - " + pos.lap_time + "\n"
	
	# Summary
	result_text += "\n📊 YOUR QUALIFYING:\n"
	if player_positions.size() >= 2:
		result_text += "Pilot 1: P" + str(player_positions[0]) + "\n"
		result_text += "Pilot 2: P" + str(player_positions[1]) + "\n"
	
	results_label.text = result_text
	
	# Store grid for race
	GameManager.set_race_data({"grid_positions": grid_positions})
	
	# Wait 5 seconds then continue
	await get_tree().create_timer(5.0).timeout
	_go_to_race()

func _go_to_race():
	print("🏁 Going to race...")
	# For now, go back to dashboard
	# Later: go to race scene
	get_tree().change_scene_to_file("res://scenes/dashboard/DashboardScene.tscn")

func _process(delta):
	# Handle any real-time updates here
	pass