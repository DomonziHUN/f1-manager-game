@echo off
chcp 65001 >nul
echo ========================================
echo    F1 Manager Game - Project Setup
echo ========================================
echo.

REM === BACKEND STRUKTURA ===
echo [1/5] Creating backend structure...

mkdir backend
mkdir backend\src
mkdir backend\src\config
mkdir backend\src\controllers
mkdir backend\src\middleware
mkdir backend\src\models
mkdir backend\src\routes
mkdir backend\src\services
mkdir backend\src\websocket
mkdir backend\src\race-engine
mkdir backend\data

REM === GODOT STRUKTURA ===
echo [2/5] Creating Godot project structure...

mkdir godot-client
mkdir godot-client\assets
mkdir godot-client\assets\fonts
mkdir godot-client\assets\images
mkdir godot-client\assets\images\cars
mkdir godot-client\assets\images\pilots
mkdir godot-client\assets\images\tracks
mkdir godot-client\assets\images\ui
mkdir godot-client\scenes
mkdir godot-client\scenes\auth
mkdir godot-client\scenes\dashboard
mkdir godot-client\scenes\matchmaking
mkdir godot-client\scenes\race
mkdir godot-client\scenes\components
mkdir godot-client\scripts
mkdir godot-client\scripts\autoload
mkdir godot-client\scripts\auth
mkdir godot-client\scripts\dashboard
mkdir godot-client\scripts\race
mkdir godot-client\scripts\matchmaking
mkdir godot-client\resources

echo [3/5] Creating backend package.json...

(
echo {
echo   "name": "f1-manager-backend",
echo   "version": "1.0.0",
echo   "description": "F1 Manager Game Backend",
echo   "main": "src/server.js",
echo   "scripts": {
echo     "start": "node src/server.js",
echo     "dev": "nodemon src/server.js"
echo   },
echo   "dependencies": {
echo     "express": "^4.18.2",
echo     "socket.io": "^4.7.2",
echo     "cors": "^2.8.5",
echo     "dotenv": "^16.3.1",
echo     "bcryptjs": "^2.4.3",
echo     "jsonwebtoken": "^9.0.2",
echo     "better-sqlite3": "^9.2.2",
echo     "uuid": "^9.0.1"
echo   },
echo   "devDependencies": {
echo     "nodemon": "^3.0.2"
echo   }
echo }
) > backend\package.json

echo [4/5] Creating .env file...

(
echo PORT=3000
echo JWT_SECRET=your-super-secret-key-change-this-in-production-abc123
echo NODE_ENV=development
) > backend\.env

echo [5/5] Creating Godot project.godot...

(
echo ; Engine configuration file.
echo config_version=5
echo.
echo [application]
echo config/name="F1 Manager Game"
echo run/main_scene="res://scenes/Main.tscn"
echo config/features=PackedStringArray^("4.2", "Forward+"^)
echo.
echo [autoload]
echo GameManager="*res://scripts/autoload/GameManager.gd"
echo NetworkManager="*res://scripts/autoload/NetworkManager.gd"
echo.
echo [display]
echo window/size/viewport_width=1280
echo window/size/viewport_height=720
echo window/stretch/mode="viewport"
echo window/stretch/aspect="expand"
) > godot-client\project.godot

echo.
echo ========================================
echo    Folder structure created!
echo ========================================
echo.
echo Now installing Node.js dependencies...
echo.

cd backend
call npm install

echo.
echo ========================================
echo    SETUP COMPLETE!
echo ========================================
echo.
echo Next steps:
echo 1. Add the backend source files
echo 2. Open Godot and import: godot-client folder
echo.
pause