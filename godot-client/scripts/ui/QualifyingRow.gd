extends HBoxContainer

@onready var pos_label: Label = $Pos
@onready var driver_label: Label = $Driver
@onready var team_label: Label = $Team
@onready var tyre_label: Label = $Tyre
@onready var time_label: Label = $Time
@onready var gap_label: Label = $Gap

func set_data(pos: int, driver_name: String, team_name: String, tyre_str: String, time_str: String, gap_str: String, is_you: bool, is_opponent: bool) -> void:
	pos_label.text = "P" + str(pos).pad_zeros(2)
	driver_label.text = driver_name
	team_label.text = team_name
	tyre_label.text = tyre_str
	time_label.text = time_str
	gap_label.text = gap_str

	# alap színek
	self.modulate = Color(1, 1, 1, 1)
	driver_label.add_theme_color_override("font_color", Color(0.9, 0.9, 0.9))
	team_label.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))

	if is_you:
		# Te: enyhén kiemelt háttér
		self.modulate = Color(0.8, 1.0, 0.8, 1)
	elif is_opponent:
		# Ellenfél: enyhe narancsos háttér
		self.modulate = Color(1.0, 0.9, 0.8, 1)
