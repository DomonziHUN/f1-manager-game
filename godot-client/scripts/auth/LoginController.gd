extends Control

@onready var email_input = $CenterContainer/LoginPanel/VBoxContainer/EmailInput
@onready var password_input = $CenterContainer/LoginPanel/VBoxContainer/PasswordInput
@onready var login_button = $CenterContainer/LoginPanel/VBoxContainer/LoginButton
@onready var register_button = $CenterContainer/LoginPanel/VBoxContainer/RegisterButton
@onready var status_label = $CenterContainer/LoginPanel/VBoxContainer/StatusLabel
@onready var loading_spinner = $CenterContainer/LoginPanel/VBoxContainer/LoadingSpinner

var is_loading = false

func _ready():
	print("🔐 Login screen loaded")
	
	# Connect buttons
	login_button.pressed.connect(_on_login_pressed)
	register_button.pressed.connect(_on_register_pressed)
	
	# Connect NetworkManager
	NetworkManager.request_completed.connect(_on_network_response)
	NetworkManager.auth_changed.connect(_on_auth_changed)
	
	# Set default values for testing
	email_input.text = "test@example.com"
	password_input.text = "123456"

func _on_login_pressed():
	if is_loading:
		return
	
	var email = email_input.text.strip_edges()
	var password = password_input.text.strip_edges()
	
	if email.is_empty() or password.is_empty():
		_show_error("Please enter email and password")
		return
	
	if not _is_valid_email(email):
		_show_error("Please enter a valid email")
		return
	
	_set_loading(true, "Logging in...")
	NetworkManager.login(email, password)

func _on_register_pressed():
	if is_loading:
		return
	
	var email = email_input.text.strip_edges()
	var password = password_input.text.strip_edges()
	
	if email.is_empty() or password.is_empty():
		_show_error("Please enter email and password")
		return
	
	if not _is_valid_email(email):
		_show_error("Please enter a valid email")
		return
	
	if password.length() < 6:
		_show_error("Password must be at least 6 characters")
		return
	
	# Generate username from email
	var username = email.split("@")[0]
	
	_set_loading(true, "Creating account...")
	NetworkManager.register(email, username, password)

func _on_network_response(endpoint: String, success: bool, data: Dictionary):
	if endpoint in ["/auth/login", "/auth/register"]:
		_set_loading(false)
		
		if success:
			_show_success("Login successful!")
			# Wait a moment then go to dashboard
			await get_tree().create_timer(1.0).timeout
			_go_to_dashboard()
		else:
			var error_msg = data.get("error", "Unknown error")
			_show_error("Login failed: " + str(error_msg))

func _on_auth_changed(authenticated: bool):
	if authenticated:
		print("✅ User authenticated")

func _go_to_dashboard():
	print("🏠 Going to dashboard...")
	var dashboard_scene = preload("res://scenes/dashboard/DashboardScene.tscn")
	get_tree().change_scene_to_packed(dashboard_scene)

func _set_loading(loading: bool, message: String = ""):
	is_loading = loading
	login_button.disabled = loading
	register_button.disabled = loading
	email_input.editable = not loading
	password_input.editable = not loading
	
	if loading:
		loading_spinner.text = "🔄 " + message
		loading_spinner.visible = true
		status_label.visible = false
	else:
		loading_spinner.visible = false
		status_label.visible = true

func _show_error(message: String):
	status_label.text = "❌ " + message
	status_label.modulate = Color.RED

func _show_success(message: String):
	status_label.text = "✅ " + message
	status_label.modulate = Color.GREEN

func _is_valid_email(email: String) -> bool:
	return email.contains("@") and email.contains(".")

func _input(event):
	if event.is_action_pressed("ui_accept") and not is_loading:
		_on_login_pressed() 
