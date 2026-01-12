// backend/race-engine/QualifyingEngine.js

/**
 * Szerver oldali kvalifikációs szimulátor.
 *
 * VÁRT BEMENET:
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
 *       ]
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

        this.drivers = [];       // { name, team, owner, userId, pilotSlot, type, performance, lapTimeSeconds }
        this.gridPositions = []; // végső grid
    }

    run() {
        this.buildDrivers();
        this.computeLapTimes();
        this.sortByLapTime();
        this.buildGrid();
        return {
            grid: this.gridPositions
        };
    }

    // Összerakjuk a mezőnyt a játékosok + AI pilótákból
    buildDrivers() {
        const drivers = [];

        // Játékosok pilótái
        this.players.forEach((player, index) => {
            const ownerTag = index === 0 ? 'player1' : 'player2';

            for (const pilot of player.pilots) {
                const perf = this.calculatePerformance(pilot.stats);

                drivers.push({
                    name: pilot.name,
                    team: pilot.team || 'Player Team',
                    owner: ownerTag,            // 'player1' | 'player2'
                    userId: player.userId,
                    pilotSlot: pilot.slot || 1,
                    type: 'player',
                    performance: perf,
                    lapTimeSeconds: 0
                });
            }
        });

        // 16 AI pilóta
        const aiNames = [
            'Max Verstappen', 'Lewis Hamilton', 'Charles Leclerc', 'Lando Norris',
            'Carlos Sainz', 'George Russell', 'Sergio Perez', 'Fernando Alonso',
            'Oscar Piastri', 'Lance Stroll', 'Pierre Gasly', 'Esteban Ocon',
            'Alex Albon', 'Valtteri Bottas', 'Zhou Guanyu', 'Kevin Magnussen'
        ];

        for (let i = 0; i < aiNames.length; i++) {
            const base = 60 + Math.random() * 35; // 60–95 közötti „performance”

            drivers.push({
                name: aiNames[i],
                team: 'AI Team',
                owner: 'ai',
                userId: null,
                pilotSlot: null,
                type: 'ai',
                performance: base,
                lapTimeSeconds: 0
            });
        }

        this.drivers = drivers;
    }

    // Pilóta stat → teljesítmény (nagyobb = jobb)
    calculatePerformance(stats = {}) {
        const speed = stats.speed ?? 75;
        const cornering = stats.cornering ?? 75;
        const consistency = stats.consistency ?? 75;
        const wetSkill = stats.wetSkill ?? 75;

        let pilotPerf = (speed + cornering + consistency) / 3;

        // Időjárás hatás
        let weatherMod = 1.0;
        if (this.weather !== 'dry') {
            weatherMod = wetSkill / 100.0;
        }

        // Kis random ingadozás (±5%)
        const randomFactor = 0.95 + Math.random() * 0.10;

        return pilotPerf * weatherMod * randomFactor;
    }

    // Performance → köridő (mp). Nagyobb performance → kisebb idő.
    computeLapTimes() {
        const baseTime = 104.0; // alap köridő mp-ben (kb. 1:44.000)

        for (const driver of this.drivers) {
            const perf = driver.performance;

            // 60–100 közötti performance → kb. 0–5 mp eltérés
            const perfClamped = Math.max(60, Math.min(100, perf));
            const timeModifier = ((100 - perfClamped) / 100) * 5.0;

            // Kis random zaj ±0.25 mp, de továbbra is erős perf‑függés
            const jitter = (Math.random() * 0.5) - 0.25;

            const finalTime = baseTime + timeModifier + jitter;
            driver.lapTimeSeconds = Math.max(0, finalTime);
        }
    }

    // Rendezés tisztán köridő szerint – P1 = leggyorsabb
    sortByLapTime() {
        this.drivers.sort((a, b) => a.lapTimeSeconds - b.lapTimeSeconds);
    }

    // Grid felépítése a rendezett mezőnyből
    buildGrid() {
        const grid = [];

        for (let i = 0; i < this.drivers.length; i++) {
            const d = this.drivers[i];
            const position = i + 1;
            const t = d.lapTimeSeconds;

            const minutes = Math.floor(t / 60);
            const seconds = t - minutes * 60;
            // pl. 1:44.321
            const lapTimeStr = `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;

            grid.push({
                position,
                name: d.name,
                team: d.team,
                owner: d.owner,          // 'player1' | 'player2' | 'ai'
                userId: d.userId,
                pilotSlot: d.pilotSlot,
                type: d.type,
                lapTime: lapTimeStr,
                performance: d.performance
            });
        }

        this.gridPositions = grid;
    }
}

module.exports = QualifyingEngine;