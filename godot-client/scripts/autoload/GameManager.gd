extends Node

# Game state
var current_user: Dictionary = {}
var garage_data: Dictionary = {}
var current_scene: String = ""

func _ready():
	# Connect to NetworkManager signals
	NetworkManager.request_completed.connect(_on_network_request_completed)
	NetworkManager.auth_changed.connect(_on_auth_changed)
	
	print("🎮 GameManager initialized")
	
	# Test network connection
	_test_network()

func _test_network():
	print("🧪 Testing network connection...")
	
	# Test registration
	NetworkManager.register("godot@test.com", "GodotUser", "123456")

func _on_network_request_completed(endpoint: String, success: bool, data: Dictionary):
	print("📨 Network response - " + endpoint + ": " + str(success))
	print("📄 Data: " + str(data))
	
	match endpoint:
		"/auth/register":
			if success:
				print("✅ Registration successful!")
				# Test garage data
				NetworkManager.get_garage()
		
		"/game/garage":
			if success:
				garage_data = data.data
				print("🏠 Garage loaded: " + str(garage_data.pilots.size()) + " pilots")

func _on_auth_changed(authenticated: bool):
	print("🔐 Auth status changed: " + str(authenticated))