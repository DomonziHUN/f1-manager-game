# F1 Manager Game - Godot Client

## Project Structure

```
godot-client/
├── assets/          # Game assets (images, sounds, fonts)
├── scenes/          # Godot scene files (.tscn)
├── scripts/         # GDScript files (.gd)
├── resources/       # Godot resources (themes, materials)
└── project.godot    # Main project file
```

## Scenes

- **Main.tscn** - Entry point
- **auth/** - Login/Register screens
- **dashboard/** - Main dashboard
- **garage/** - Pilot and car management
- **matchmaking/** - Queue and match finding
- **race/** - Race gameplay

## Scripts

- **autoload/** - Global managers
- **network/** - API communication
- **data/** - Data structures
- **ui/** - UI components

## Getting Started

1. Open Godot 4.2+
2. Import this project
3. Set backend URL in NetworkManager
4. Run the project
