@echo off
chcp 65001 >nul
echo ========================================
echo    F1 Manager - Godot Client Setup
echo ========================================
echo.

REM === MAIN DIRECTORIES ===
echo [1/6] Creating main directories...

mkdir godot-client
mkdir godot-client\assets
mkdir godot-client\assets\fonts
mkdir godot-client\assets\images
mkdir godot-client\assets\images\ui
mkdir godot-client\assets\images\cars
mkdir godot-client\assets\images\pilots
mkdir godot-client\assets\images\tracks
mkdir godot-client\assets\images\flags
mkdir godot-client\assets\sounds
mkdir godot-client\assets\sounds\sfx
mkdir godot-client\assets\sounds\music

REM === SCENES ===
echo [2/6] Creating scene directories...

mkdir godot-client\scenes
mkdir godot-client\scenes\auth
mkdir godot-client\scenes\dashboard
mkdir godot-client\scenes\garage
mkdir godot-client\scenes\matchmaking
mkdir godot-client\scenes\race
mkdir godot-client\scenes\ui
mkdir godot-client\scenes\ui\components
mkdir godot-client\scenes\ui\dialogs
mkdir godot-client\scenes\ui\hud

REM === SCRIPTS ===
echo [3/6] Creating script directories...

mkdir godot-client\scripts
mkdir godot-client\scripts\autoload
mkdir godot-client\scripts\auth
mkdir godot-client\scripts\dashboard
mkdir godot-client\scripts\garage
mkdir godot-client\scripts\matchmaking
mkdir godot-client\scripts\race
mkdir godot-client\scripts\ui
mkdir godot-client\scripts\network
mkdir godot-client\scripts\data

REM === RESOURCES ===
echo [4/6] Creating resource directories...

mkdir godot-client\resources
mkdir godot-client\resources\themes
mkdir godot-client\resources\materials
mkdir godot-client\resources\data

REM === MAIN SCENE FILES ===
echo [5/6] Creating main scene files...

REM Main scenes
echo. > godot-client\scenes\Main.tscn
echo. > godot-client\scenes\auth\LoginScene.tscn
echo. > godot-client\scenes\auth\RegisterScene.tscn
echo. > godot-client\scenes\dashboard\DashboardScene.tscn
echo. > godot-client\scenes\garage\GarageScene.tscn
echo. > godot-client\scenes\garage\PilotManagement.tscn
echo. > godot-client\scenes\garage\CarUpgrades.tscn
echo. > godot-client\scenes\matchmaking\MatchmakingScene.tscn
echo. > godot-client\scenes\matchmaking\QueueWaiting.tscn
echo. > godot-client\scenes\matchmaking\MatchFound.tscn
echo. > godot-client\scenes\race\RaceScene.tscn
echo. > godot-client\scenes\race\RaceHUD.tscn
echo. > godot-client\scenes\race\TrackView.tscn

REM UI Components
echo. > godot-client\scenes\ui\components\PilotCard.tscn
echo. > godot-client\scenes\ui\components\CarPartCard.tscn
echo. > godot-client\scenes\ui\components\LeagueCard.tscn
echo. > godot-client\scenes\ui\components\LoadingSpinner.tscn
echo. > godot-client\scenes\ui\components\NotificationPanel.tscn
echo. > godot-client\scenes\ui\dialogs\ConfirmDialog.tscn
echo. > godot-client\scenes\ui\dialogs\PilotDetailsDialog.tscn
echo. > godot-client\scenes\ui\dialogs\ShopDialog.tscn

REM === SCRIPT FILES ===
echo [6/6] Creating script files...

REM Autoload scripts
echo. > godot-client\scripts\autoload\GameManager.gd
echo. > godot-client\scripts\autoload\NetworkManager.gd
echo. > godot-client\scripts\autoload\AudioManager.gd
echo. > godot-client\scripts\autoload\UIManager.gd
echo. > godot-client\scripts\autoload\DataManager.gd

REM Auth scripts
echo. > godot-client\scripts\auth\LoginController.gd
echo. > godot-client\scripts\auth\RegisterController.gd
echo. > godot-client\scripts\auth\AuthValidator.gd

REM Dashboard scripts
echo. > godot-client\scripts\dashboard\DashboardController.gd
echo. > godot-client\scripts\dashboard\StatsDisplay.gd
echo. > godot-client\scripts\dashboard\LeagueDisplay.gd

REM Garage scripts
echo. > godot-client\scripts\garage\GarageController.gd
echo. > godot-client\scripts\garage\PilotManager.gd
echo. > godot-client\scripts\garage\CarManager.gd
echo. > godot-client\scripts\garage\PilotCard.gd
echo. > godot-client\scripts\garage\CarPartCard.gd

REM Matchmaking scripts
echo. > godot-client\scripts\matchmaking\MatchmakingController.gd
echo. > godot-client\scripts\matchmaking\QueueManager.gd
echo. > godot-client\scripts\matchmaking\MatchFoundController.gd

REM Race scripts
echo. > godot-client\scripts\race\RaceController.gd
echo. > godot-client\scripts\race\RaceHUD.gd
echo. > godot-client\scripts\race\TrackRenderer.gd
echo. > godot-client\scripts\race\CarController.gd
echo. > godot-client\scripts\race\RaceSimulator.gd

REM Network scripts
echo. > godot-client\scripts\network\HTTPClient.gd
echo. > godot-client\scripts\network\WebSocketClient.gd
echo. > godot-client\scripts\network\APIEndpoints.gd

REM UI scripts
echo. > godot-client\scripts\ui\BaseDialog.gd
echo. > godot-client\scripts\ui\NotificationManager.gd
echo. > godot-client\scripts\ui\LoadingScreen.gd

REM Data scripts
echo. > godot-client\scripts\data\UserData.gd
echo. > godot-client\scripts\data\PilotData.gd
echo. > godot-client\scripts\data\CarData.gd
echo. > godot-client\scripts\data\RaceData.gd

REM === PROJECT FILES ===
echo Creating Godot project files...

REM project.godot
(
echo ; Engine configuration file.
echo ; It's best edited using the editor UI and not directly,
echo ; since the parameters that go here are not all obvious.
echo ;
echo ; Format:
echo ;   [section] ; section goes between []
echo ;   param=value ; assign values to parameters
echo.
echo config_version=5
echo.
echo [application]
echo.
echo config/name="F1 Manager Game"
echo run/main_scene="res://scenes/Main.tscn"
echo config/features=PackedStringArray^("4.2", "Forward+"^)
echo config/icon="res://icon.svg"
echo.
echo [autoload]
echo.
echo GameManager="*res://scripts/autoload/GameManager.gd"
echo NetworkManager="*res://scripts/autoload/NetworkManager.gd"
echo AudioManager="*res://scripts/autoload/AudioManager.gd"
echo UIManager="*res://scripts/autoload/UIManager.gd"
echo DataManager="*res://scripts/autoload/DataManager.gd"
echo.
echo [display]
echo.
echo window/size/viewport_width=1280
echo window/size/viewport_height=720
echo window/size/mode=2
echo window/stretch/mode="viewport"
echo window/stretch/aspect="expand"
echo.
echo [input]
echo.
echo ui_accept={
echo "deadzone": 0.5,
echo "events": [Object^(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":4194309,"physical_keycode":0,"key_label":0,"unicode":13,"echo":false,"script":null^)
echo , Object^(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":4194310,"physical_keycode":0,"key_label":0,"unicode":0,"echo":false,"script":null^)
echo , Object^(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":32,"physical_keycode":0,"key_label":0,"unicode":32,"echo":false,"script":null^)
echo ]
echo }
echo.
echo [rendering]
echo.
echo renderer/rendering_method="forward_plus"
echo renderer/rendering_method.mobile="mobile"
) > godot-client\project.godot

REM .gitignore
(
echo # Godot 4+ specific ignores
echo .godot/
echo.
echo # Godot-specific ignores
echo *.tmp
echo *.translation
echo.
echo # Mono-specific ignores
echo .mono/
echo data_*/
echo mono_crash.*.json
echo.
echo # System/tool-specific ignores
echo .import/
echo .DS_Store
echo Thumbs.db
) > godot-client\.gitignore

REM README.md
(
echo # F1 Manager Game - Godot Client
echo.
echo ## Project Structure
echo.
echo ```
echo godot-client/
echo ├── assets/          # Game assets ^(images, sounds, fonts^)
echo ├── scenes/          # Godot scene files ^(.tscn^)
echo ├── scripts/         # GDScript files ^(.gd^)
echo ├── resources/       # Godot resources ^(themes, materials^)
echo └── project.godot    # Main project file
echo ```
echo.
echo ## Scenes
echo.
echo - **Main.tscn** - Entry point
echo - **auth/** - Login/Register screens
echo - **dashboard/** - Main dashboard
echo - **garage/** - Pilot and car management
echo - **matchmaking/** - Queue and match finding
echo - **race/** - Race gameplay
echo.
echo ## Scripts
echo.
echo - **autoload/** - Global managers
echo - **network/** - API communication
echo - **data/** - Data structures
echo - **ui/** - UI components
echo.
echo ## Getting Started
echo.
echo 1. Open Godot 4.2+
echo 2. Import this project
echo 3. Set backend URL in NetworkManager
echo 4. Run the project
) > godot-client\README.md

echo.
echo ========================================
echo    Godot Client Setup Complete!
echo ========================================
echo.
echo Project structure created with:
echo - 📁 Organized directory structure
echo - 🎬 Scene files for all screens
echo - 📜 Script files for all functionality
echo - ⚙️  Configured project.godot
echo - 📖 README.md documentation
echo.
echo Next steps:
echo 1. Open Godot 4.2+
echo 2. Import the godot-client folder
echo 3. Start building the UI!
echo.
pause