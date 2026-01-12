const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/game.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

const initialize = () => {
    console.log('Initializing database...');
    
    // Users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            google_id TEXT UNIQUE,
            current_league INTEGER DEFAULT 1,
            league_points INTEGER DEFAULT 0,
            total_wins INTEGER DEFAULT 0,
            total_races INTEGER DEFAULT 0,
            coins INTEGER DEFAULT 5000,
            gems INTEGER DEFAULT 100,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Pilots table (master data)
    db.exec(`
        CREATE TABLE IF NOT EXISTS pilots (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            team TEXT,
            nationality TEXT,
            base_speed INTEGER NOT NULL,
            base_cornering INTEGER NOT NULL,
            base_overtaking INTEGER NOT NULL,
            base_consistency INTEGER NOT NULL,
            base_tire_management INTEGER NOT NULL,
            base_wet_skill INTEGER NOT NULL,
            rarity TEXT NOT NULL,
            image_url TEXT
        )
    `);
    
    // User's pilots collection
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_pilots (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            pilot_id TEXT NOT NULL,
            level INTEGER DEFAULT 1,
            experience INTEGER DEFAULT 0,
            speed_bonus INTEGER DEFAULT 0,
            cornering_bonus INTEGER DEFAULT 0,
            overtaking_bonus INTEGER DEFAULT 0,
            is_active_slot_1 INTEGER DEFAULT 0,
            is_active_slot_2 INTEGER DEFAULT 0,
            acquired_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (pilot_id) REFERENCES pilots(id),
            UNIQUE(user_id, pilot_id)
        )
    `);
    
    // Car parts table (master data)
    db.exec(`
        CREATE TABLE IF NOT EXISTS car_parts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            part_type TEXT NOT NULL,
            speed_bonus INTEGER DEFAULT 0,
            acceleration_bonus INTEGER DEFAULT 0,
            downforce_bonus INTEGER DEFAULT 0,
            reliability_bonus INTEGER DEFAULT 0,
            pit_stop_bonus INTEGER DEFAULT 0,
            tire_wear_reduction INTEGER DEFAULT 0,
            ers_efficiency_bonus INTEGER DEFAULT 0,
            rarity TEXT NOT NULL
        )
    `);
    
    // User's car parts
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_car_parts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            part_id TEXT NOT NULL,
            level INTEGER DEFAULT 1,
            is_equipped INTEGER DEFAULT 0,
            acquired_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (part_id) REFERENCES car_parts(id),
            UNIQUE(user_id, part_id)
        )
    `);
    
    // Leagues table
    db.exec(`
        CREATE TABLE IF NOT EXISTS leagues (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            min_points INTEGER NOT NULL,
            max_points INTEGER,
            win_points INTEGER NOT NULL,
            lose_points INTEGER NOT NULL,
            rewards_coins INTEGER DEFAULT 0,
            rewards_gems INTEGER DEFAULT 0
        )
    `);
    
    // Race history
    db.exec(`
        CREATE TABLE IF NOT EXISTS race_history (
            id TEXT PRIMARY KEY,
            player1_id TEXT,
            player2_id TEXT,
            winner_id TEXT,
            league_id INTEGER,
            track_name TEXT,
            player1_points INTEGER,
            player2_points INTEGER,
            race_data TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player1_id) REFERENCES users(id),
            FOREIGN KEY (player2_id) REFERENCES users(id),
            FOREIGN KEY (league_id) REFERENCES leagues(id)
        )
    `);
    
    // Insert default leagues if not exist
    const leagueCount = db.prepare('SELECT COUNT(*) as count FROM leagues').get();
    if (leagueCount.count === 0) {
        db.exec(`
            INSERT INTO leagues (id, name, min_points, max_points, win_points, lose_points, rewards_coins, rewards_gems) VALUES
            (1, 'Bronze League', 0, 999, 30, 10, 100, 0),
            (2, 'Silver League', 1000, 2499, 25, 15, 200, 5),
            (3, 'Gold League', 2500, NULL, 20, 20, 300, 10)
        `);
    }
    
    // Insert default pilots if not exist
    const pilotCount = db.prepare('SELECT COUNT(*) as count FROM pilots').get();
    if (pilotCount.count === 0) {
        seedPilots();
    }
    
    // Insert default car parts if not exist
    const partsCount = db.prepare('SELECT COUNT(*) as count FROM car_parts').get();
    if (partsCount.count === 0) {
        seedCarParts();
    }
    
    console.log('Database initialized successfully!');
};

const seedPilots = () => {
    const pilots = [
        // Legendary
        { id: 'pilot_verstappen', name: 'Max Verstappen', team: 'Red Bull', nationality: 'Dutch', base_speed: 98, base_cornering: 96, base_overtaking: 97, base_consistency: 95, base_tire_management: 92, base_wet_skill: 94, rarity: 'legendary' },
        { id: 'pilot_hamilton', name: 'Lewis Hamilton', team: 'Mercedes', nationality: 'British', base_speed: 96, base_cornering: 95, base_overtaking: 94, base_consistency: 97, base_tire_management: 96, base_wet_skill: 98, rarity: 'legendary' },
        
        // Epic
        { id: 'pilot_leclerc', name: 'Charles Leclerc', team: 'Ferrari', nationality: 'Monegasque', base_speed: 94, base_cornering: 93, base_overtaking: 88, base_consistency: 85, base_tire_management: 86, base_wet_skill: 87, rarity: 'epic' },
        { id: 'pilot_norris', name: 'Lando Norris', team: 'McLaren', nationality: 'British', base_speed: 92, base_cornering: 91, base_overtaking: 90, base_consistency: 88, base_tire_management: 87, base_wet_skill: 89, rarity: 'epic' },
        { id: 'pilot_sainz', name: 'Carlos Sainz', team: 'Ferrari', nationality: 'Spanish', base_speed: 90, base_cornering: 89, base_overtaking: 86, base_consistency: 91, base_tire_management: 90, base_wet_skill: 85, rarity: 'epic' },
        { id: 'pilot_russell', name: 'George Russell', team: 'Mercedes', nationality: 'British', base_speed: 91, base_cornering: 90, base_overtaking: 87, base_consistency: 89, base_tire_management: 88, base_wet_skill: 86, rarity: 'epic' },
        
        // Rare
        { id: 'pilot_perez', name: 'Sergio Perez', team: 'Red Bull', nationality: 'Mexican', base_speed: 86, base_cornering: 85, base_overtaking: 88, base_consistency: 82, base_tire_management: 91, base_wet_skill: 80, rarity: 'rare' },
        { id: 'pilot_alonso', name: 'Fernando Alonso', team: 'Aston Martin', nationality: 'Spanish', base_speed: 88, base_cornering: 90, base_overtaking: 92, base_consistency: 93, base_tire_management: 94, base_wet_skill: 91, rarity: 'rare' },
        { id: 'pilot_piastri', name: 'Oscar Piastri', team: 'McLaren', nationality: 'Australian', base_speed: 85, base_cornering: 84, base_overtaking: 82, base_consistency: 86, base_tire_management: 83, base_wet_skill: 81, rarity: 'rare' },
        { id: 'pilot_stroll', name: 'Lance Stroll', team: 'Aston Martin', nationality: 'Canadian', base_speed: 78, base_cornering: 77, base_overtaking: 75, base_consistency: 74, base_tire_management: 76, base_wet_skill: 79, rarity: 'rare' },
        
        // Common
        { id: 'pilot_gasly', name: 'Pierre Gasly', team: 'Alpine', nationality: 'French', base_speed: 82, base_cornering: 81, base_overtaking: 80, base_consistency: 79, base_tire_management: 78, base_wet_skill: 77, rarity: 'common' },
        { id: 'pilot_ocon', name: 'Esteban Ocon', team: 'Alpine', nationality: 'French', base_speed: 80, base_cornering: 79, base_overtaking: 78, base_consistency: 80, base_tire_management: 77, base_wet_skill: 76, rarity: 'common' },
        { id: 'pilot_albon', name: 'Alex Albon', team: 'Williams', nationality: 'Thai', base_speed: 79, base_cornering: 78, base_overtaking: 81, base_consistency: 77, base_tire_management: 80, base_wet_skill: 75, rarity: 'common' },
        { id: 'pilot_bottas', name: 'Valtteri Bottas', team: 'Alfa Romeo', nationality: 'Finnish', base_speed: 83, base_cornering: 82, base_overtaking: 76, base_consistency: 85, base_tire_management: 84, base_wet_skill: 80, rarity: 'common' },
        { id: 'pilot_zhou', name: 'Zhou Guanyu', team: 'Alfa Romeo', nationality: 'Chinese', base_speed: 74, base_cornering: 73, base_overtaking: 72, base_consistency: 75, base_tire_management: 74, base_wet_skill: 71, rarity: 'common' },
        { id: 'pilot_magnussen', name: 'Kevin Magnussen', team: 'Haas', nationality: 'Danish', base_speed: 76, base_cornering: 77, base_overtaking: 82, base_consistency: 73, base_tire_management: 72, base_wet_skill: 74, rarity: 'common' },
        { id: 'pilot_hulkenberg', name: 'Nico Hulkenberg', team: 'Haas', nationality: 'German', base_speed: 77, base_cornering: 78, base_overtaking: 76, base_consistency: 79, base_tire_management: 78, base_wet_skill: 75, rarity: 'common' },
        { id: 'pilot_tsunoda', name: 'Yuki Tsunoda', team: 'AlphaTauri', nationality: 'Japanese', base_speed: 78, base_cornering: 76, base_overtaking: 77, base_consistency: 72, base_tire_management: 71, base_wet_skill: 73, rarity: 'common' },
        { id: 'pilot_ricciardo', name: 'Daniel Ricciardo', team: 'AlphaTauri', nationality: 'Australian', base_speed: 81, base_cornering: 80, base_overtaking: 85, base_consistency: 78, base_tire_management: 79, base_wet_skill: 82, rarity: 'common' },
        { id: 'pilot_sargeant', name: 'Logan Sargeant', team: 'Williams', nationality: 'American', base_speed: 70, base_cornering: 69, base_overtaking: 68, base_consistency: 67, base_tire_management: 68, base_wet_skill: 66, rarity: 'common' },
    ];
    
    const stmt = db.prepare(`
        INSERT INTO pilots (id, name, team, nationality, base_speed, base_cornering, base_overtaking, base_consistency, base_tire_management, base_wet_skill, rarity)
        VALUES (@id, @name, @team, @nationality, @base_speed, @base_cornering, @base_overtaking, @base_consistency, @base_tire_management, @base_wet_skill, @rarity)
    `);
    
    for (const pilot of pilots) {
        stmt.run(pilot);
    }
    
    console.log('Seeded 20 pilots');
};

const seedCarParts = () => {
    const parts = [
        // Engines
        { id: 'part_engine_1', name: 'Basic Engine', part_type: 'engine', speed_bonus: 5, acceleration_bonus: 3, rarity: 'common' },
        { id: 'part_engine_2', name: 'Performance Engine', part_type: 'engine', speed_bonus: 10, acceleration_bonus: 7, rarity: 'rare' },
        { id: 'part_engine_3', name: 'Racing Engine', part_type: 'engine', speed_bonus: 15, acceleration_bonus: 12, rarity: 'epic' },
        { id: 'part_engine_4', name: 'Championship Engine', part_type: 'engine', speed_bonus: 22, acceleration_bonus: 18, rarity: 'legendary' },
        
        // Aero
        { id: 'part_aero_1', name: 'Basic Aero Package', part_type: 'aero', downforce_bonus: 5, speed_bonus: 2, rarity: 'common' },
        { id: 'part_aero_2', name: 'Advanced Aero Package', part_type: 'aero', downforce_bonus: 10, speed_bonus: 5, rarity: 'rare' },
        { id: 'part_aero_3', name: 'Pro Aero Package', part_type: 'aero', downforce_bonus: 16, speed_bonus: 8, rarity: 'epic' },
        { id: 'part_aero_4', name: 'Elite Aero Package', part_type: 'aero', downforce_bonus: 24, speed_bonus: 12, rarity: 'legendary' },
        
        // Chassis
        { id: 'part_chassis_1', name: 'Basic Chassis', part_type: 'chassis', reliability_bonus: 5, tire_wear_reduction: 3, rarity: 'common' },
        { id: 'part_chassis_2', name: 'Reinforced Chassis', part_type: 'chassis', reliability_bonus: 10, tire_wear_reduction: 7, rarity: 'rare' },
        { id: 'part_chassis_3', name: 'Carbon Chassis', part_type: 'chassis', reliability_bonus: 16, tire_wear_reduction: 12, rarity: 'epic' },
        { id: 'part_chassis_4', name: 'Ultra-Light Chassis', part_type: 'chassis', reliability_bonus: 24, tire_wear_reduction: 18, rarity: 'legendary' },
        
        // Gearbox
        { id: 'part_gearbox_1', name: 'Basic Gearbox', part_type: 'gearbox', acceleration_bonus: 4, reliability_bonus: 2, rarity: 'common' },
        { id: 'part_gearbox_2', name: 'Quick-Shift Gearbox', part_type: 'gearbox', acceleration_bonus: 8, reliability_bonus: 5, rarity: 'rare' },
        { id: 'part_gearbox_3', name: 'Seamless Gearbox', part_type: 'gearbox', acceleration_bonus: 14, reliability_bonus: 9, rarity: 'epic' },
        { id: 'part_gearbox_4', name: 'F1 Spec Gearbox', part_type: 'gearbox', acceleration_bonus: 20, reliability_bonus: 14, rarity: 'legendary' },
        
        // Brakes
        { id: 'part_brakes_1', name: 'Basic Brakes', part_type: 'brakes', pit_stop_bonus: 2, tire_wear_reduction: 2, rarity: 'common' },
        { id: 'part_brakes_2', name: 'Carbon Brakes', part_type: 'brakes', pit_stop_bonus: 5, tire_wear_reduction: 5, rarity: 'rare' },
        { id: 'part_brakes_3', name: 'Ceramic Brakes', part_type: 'brakes', pit_stop_bonus: 8, tire_wear_reduction: 9, rarity: 'epic' },
        { id: 'part_brakes_4', name: 'Racing Brakes', part_type: 'brakes', pit_stop_bonus: 12, tire_wear_reduction: 14, rarity: 'legendary' },
        
        // ERS
        { id: 'part_ers_1', name: 'Basic ERS', part_type: 'ers', ers_efficiency_bonus: 5, rarity: 'common' },
        { id: 'part_ers_2', name: 'Enhanced ERS', part_type: 'ers', ers_efficiency_bonus: 12, rarity: 'rare' },
        { id: 'part_ers_3', name: 'High-Capacity ERS', part_type: 'ers', ers_efficiency_bonus: 20, rarity: 'epic' },
        { id: 'part_ers_4', name: 'Ultimate ERS', part_type: 'ers', ers_efficiency_bonus: 30, rarity: 'legendary' },
    ];
    
    const stmt = db.prepare(`
        INSERT INTO car_parts (id, name, part_type, speed_bonus, acceleration_bonus, downforce_bonus, reliability_bonus, pit_stop_bonus, tire_wear_reduction, ers_efficiency_bonus, rarity)
        VALUES (@id, @name, @part_type, @speed_bonus, @acceleration_bonus, @downforce_bonus, @reliability_bonus, @pit_stop_bonus, @tire_wear_reduction, @ers_efficiency_bonus, @rarity)
    `);
    
    for (const part of parts) {
        stmt.run({
            ...part,
            speed_bonus: part.speed_bonus || 0,
            acceleration_bonus: part.acceleration_bonus || 0,
            downforce_bonus: part.downforce_bonus || 0,
            reliability_bonus: part.reliability_bonus || 0,
            pit_stop_bonus: part.pit_stop_bonus || 0,
            tire_wear_reduction: part.tire_wear_reduction || 0,
            ers_efficiency_bonus: part.ers_efficiency_bonus || 0,
        });
    }
    
    console.log('Seeded 24 car parts');
};

module.exports = {
    db,
    initialize
};