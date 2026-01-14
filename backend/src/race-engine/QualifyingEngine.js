// backend/race-engine/QualifyingEngine.js

const { computeQualiTireModifier } = require('./TireModel');

/**
 * Szerver oldali kvalifikációs szimulátor gumimodellel.
 *
 * Bemenet:
 * {
 *   track: { id, name, laps },
 *   weather: "dry" | "light_rain" | "heavy_rain" | "storm",
 *   players: [
 *     {
 *       userId,
 *       username,
 *       pilots: [
 *         {
 *           id,
 *           name,
 *           team,
 *           slot,         // 1 vagy 2
 *           stats: {
 *             speed,
 *             cornering,
 *             consistency,
 *             wetSkill
 *           }
 *         },
 *         ...
 *       ],
 *       selectedTires: { "1": "soft", "2": "medium" } // opcionális
 *     },
 *     ...
 *   ]
 * }
 */

class QualifyingEngine {
    constructor(config) {
        this.track = config.track;
        this.weather = config.weather || 'dry';
        this.players = config.players || [];

        this.drivers = [];       // { name, team, owner, userId, pilotSlot, type, performance, lapTimeSeconds, compound }
        this.gridPositions = [];
    }

    run() {
        this.buildDrivers();
        this.computeLapTimes();
        this.sortByLapTime();
        this.buildGrid();
        return { grid: this.gridPositions };
    }

    // ==============================
    // DRIVER LISTA ÖSSZEÁLLÍTÁSA
    // ==============================
    buildDrivers() {
        const drivers = [];

        // Játékos pilóták
        this.players.forEach((player, index) => {
            const ownerTag = index === 0 ? 'player1' : 'player2';
            const tireMap = player.selectedTires || {}; // { "1": "soft", "2": "medium" }

            for (const pilot of player.pilots) {
                const slot = pilot.slot || 1;
                const compound = (tireMap[String(slot)] || 'medium').toLowerCase();

                const perf = this.calculatePerformance(pilot.stats, compound);

                drivers.push({
                    name: pilot.name,
                    team: pilot.team || 'Player Team',
                    owner: ownerTag,
                    userId: player.userId,
                    pilotSlot: slot,
                    type: 'player',
                    compound,
                    performance: perf,
                    lapTimeSeconds: 0
                });
            }
        });

        // AI mezőny – mindig a legjobb kvali gumi az időjáráshoz mérten
        const aiNames = [
            'Max Verstappen', 'Lewis Hamilton', 'Charles Leclerc', 'Lando Norris',
            'Carlos Sainz', 'George Russell', 'Sergio Perez', 'Fernando Alonso',
            'Oscar Piastri', 'Lance Stroll', 'Pierre Gasly', 'Esteban Ocon',
            'Alex Albon', 'Valtteri Bottas', 'Zhou Guanyu', 'Kevin Magnussen'
        ];

        const aiCompound = this._bestQualiCompoundForWeather();

        for (let i = 0; i < aiNames.length; i++) {
            const base = 60 + Math.random() * 35; // 60–95

            const perf = this.calculatePerformance({
                speed: base,
                cornering: base,
                consistency: base,
                wetSkill: 75
            }, aiCompound);

            drivers.push({
                name: aiNames[i],
                team: 'AI Team',
                owner: 'ai',
                userId: null,
                pilotSlot: null,
                type: 'ai',
                compound: aiCompound,
                performance: perf,
                lapTimeSeconds: 0
            });
        }

        this.drivers = drivers;
    }

    /**
     * AI kvali gumi választása:
     * - dry  → soft
     * - light_rain → intermediate
     * - heavy_rain / storm → wet
     */
    _bestQualiCompoundForWeather() {
        const w = this.weather;
        if (w === 'dry') return 'soft';
        if (w === 'light_rain') return 'intermediate';
        if (w === 'heavy_rain' || w === 'storm') return 'wet';
        return 'medium';
    }

    // ==============================
    // TELJESÍTMÉNY + IDŐ SZÁMOLÁS
    // ==============================
    calculatePerformance(stats = {}, compound = 'medium') {
        const speed = stats.speed ?? 75;
        const cornering = stats.cornering ?? 75;
        const consistency = stats.consistency ?? 75;
        const wetSkill = stats.wetSkill ?? 75;

        let pilotPerf = (speed + cornering + consistency) / 3;

        const tireMod = computeQualiTireModifier(compound, this.weather);

        let weatherMod = 1.0;
        if (this.weather !== 'dry') {
            weatherMod = wetSkill / 100.0;
        }

        const randomFactor = 0.95 + Math.random() * 0.10;

        return pilotPerf * tireMod * weatherMod * randomFactor;
    }

    computeLapTimes() {
        const baseTime = 104.0; // ~1:44.000

        for (const driver of this.drivers) {
            const perf = driver.performance;

            const perfClamped = Math.max(40, Math.min(100, perf));
            const timeModifier = ((100 - perfClamped) / 100) * 8.0; // MAX ~8 mp különbség

            const jitter = (Math.random() * 0.6) - 0.3; // ±0.3 mp

            const finalTime = baseTime + timeModifier + jitter;
            driver.lapTimeSeconds = Math.max(0, finalTime);
        }
    }

    sortByLapTime() {
        this.drivers.sort((a, b) => a.lapTimeSeconds - b.lapTimeSeconds);
    }

    buildGrid() {
        const grid = [];

        for (let i = 0; i < this.drivers.length; i++) {
            const d = this.drivers[i];
            const position = i + 1;
            const t = d.lapTimeSeconds;

            const minutes = Math.floor(t / 60);
            const seconds = t - minutes * 60;
            const lapTimeStr = `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;

            grid.push({
                position,
                name: d.name,
                team: d.team,
                owner: d.owner,
                userId: d.userId,
                pilotSlot: d.pilotSlot,
                type: d.type,
                compound: d.compound,
                lapTime: lapTimeStr,
                lapSeconds: t,           // <<< EZ KELL A KLIENS ANIMÁCIÓHOZ
                performance: d.performance
            });
        }

        this.gridPositions = grid;
    }
}

module.exports = QualifyingEngine;