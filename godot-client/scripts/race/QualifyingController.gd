extends Control

@onready var status_label = $CenterContainer/VBoxContainer/StatusLabel
@onready var progress_bar = $CenterContainer/VBoxContainer/ProgressBar
@onready var results_label = $CenterContainer/VBoxContainer/ResultsLabel

var qualifying_data: Dictionary = {}
var simulation_time: float = 5.0
var current_time: float = 0.0

func _ready():
	print("🏁 Qualifying scene loaded")
	
	# Load qualifying data
	qualifying_data = GameManager.get_qualifying_data()
	
	# Start simulation
	_start_qualifying_simulation()

func _start_qualifying_simulation():
	status_label.text = "🏁 Qualifying in progress..."
	current_time = 0.0
	
	# Simulate qualifying for 5 seconds
	var tween = create_tween()
	tween.tween_method(_update_progress, 0.0, 100.0, simulation_time)
	tween.tween_callback(_finish_qualifying)

func _update_progress(value: float):
	progress_bar.value = value
	current_time = (value / 100.0) * simulation_time
	
	var remaining = simulation_time - current_time
	status_label.text = "🏁 Qualifying... " + str(int(remaining)) + "s remaining"

func _finish_qualifying():
	status_label.text = "✅ Qualifying complete!"
	results_label.text = "🚧 Full qualifying simulation coming soon!\n\nFor now: You qualified P10"
	
	# Wait 3 seconds then go back to dashboard
	await get_tree().create_timer(3.0).timeout
	_go_to_dashboard()

func _go_to_dashboard():
	print("🏠 Going back to dashboard...")
	get_tree().change_scene_to_file("res://scenes/dashboard/DashboardScene.tscn")

func _process(delta):
	# Handle any real-time updates here
	pass