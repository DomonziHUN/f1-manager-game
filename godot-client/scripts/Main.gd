extends Control

func _ready():
	print("🎮 F1 Manager Game Started!")
	
	# Use call_deferred to avoid the busy node error
	call_deferred("_go_to_login")

func _go_to_login():
	var login_scene = preload("res://scenes/auth/LoginScene.tscn")
	get_tree().change_scene_to_packed(login_scene)