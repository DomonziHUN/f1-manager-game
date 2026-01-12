// backend/race-engine/RaceEngine.js
class RaceEngine {
    constructor(config) {
        this.raceId = config.raceId;
        this.track = config.track; // { id, name, laps }
        this.totalLaps = config.track.laps;
        this.currentTick = 0;
        this.tickRate = 20; // 20 ticks per second

        this.cars = new Map();
        this.events = [];
        this.finished = false;
        this.finishedCars = [];

        // Initialize player cars (2 játékos)
        this.initializePlayerCars(config.players);

        // Initialize AI cars (többi mező)
        this.initializeAICars();

        // Set starting grid
        this.setStartingGrid();
    }

    initializePlayerCars(players) {
        // players: [{ userId, username, pilots[], carStats }]
        players.forEach((player, playerIndex) => {
            const ownerTag = playerIndex === 0 ? 'player1' : 'player2';

            for (const pilot of player.pilots) {
                const carId = `${ownerTag}_car${pilot.slot}`;

                this.cars.set(carId, {
                    id: carId,
                    owner: ownerTag,          // 'player1' | 'player2'
                    userId: player.userId,    // fontos: ehhez kötjük a DB műveleteket
                    pilot: pilot,
                    carStats: player.carStats,

                    // Pozíció
                    trackPosition: 0,
                    currentLap: 0,
                    racePosition: 0,
                    totalDistance: 0,

                    // Gumi
                    tire: {
                        compound: 'medium',
                        wear: 100,
                        degradationRate: this.calculateTireDegradation(pilot, player.carStats, 'medium')
                    },

                    // ERS
                    ers: {
                        charge: 100,
                        mode: 'balanced'
                    },

                    // Állapot
                    isInPit: false,
                    pitProgress: 0,
                    pitCount: 0,
                    finished: false,
                    dnf: false,

                    // Sebesség
                    currentSpeed: 0,
                    baseSpeed: this.calculateBaseSpeed(pilot, player.carStats)
                });
            }
        });
    }

    initializeAICars() {
        const aiTeams = [
            { name: 'AI Team 1', color: '#FF0000', speedMod: 0.95 },
            { name: 'AI Team 2', color: '#00FF00', speedMod: 0.90 },
            { name: 'AI Team 3', color: '#0000FF', speedMod: 0.88 },
            { name: 'AI Team 4', color: '#FFFF00', speedMod: 0.85 },
            { name: 'AI Team 5', color: '#FF00FF', speedMod: 0.82 },
            { name: 'AI Team 6', color: '#00FFFF', speedMod: 0.80 },
            { name: 'AI Team 7', color: '#FFA500', speedMod: 0.78 },
            { name: 'AI Team 8', color: '#800080', speedMod: 0.75 }
        ];

        let aiIndex = 0;
        for (const team of aiTeams) {
            for (let i = 0; i < 2; i++) {
                const carId = `ai_car_${aiIndex}`;
                const baseSpeed = 70 + Math.random() * 20;

                this.cars.set(carId, {
                    id: carId,
                    owner: 'ai',
                    userId: null,
                    team: team.name,
                    pilot: {
                        name: `AI Driver ${aiIndex + 1}`,
                        stats: {
                            speed: baseSpeed * team.speedMod,
                            cornering: 70 + Math.random() * 20,
                            overtaking: 70 + Math.random() * 20,
                            consistency: 70 + Math.random() * 20,
                            tireManagement: 70 + Math.random() * 20
                        }
                    },
                    carStats: {
                        speed: 50 + Math.random() * 30,
                        acceleration: 50 + Math.random() * 30,
                        downforce: 50,
                        tireWearReduction: Math.random() * 10,
                        ersEfficiency: 50
                    },

                    trackPosition: 0,
                    currentLap: 0,
                    racePosition: 0,
                    totalDistance: 0,

                    tire: {
                        compound: ['soft', 'medium', 'hard'][Math.floor(Math.random() * 3)],
                        wear: 100,
                        degradationRate: 0.8 + Math.random() * 0.4
                    },

                    ers: {
                        charge: 100,
                        mode: 'balanced'
                    },

                    isInPit: false,
                    pitProgress: 0,
                    pitCount: 0,
                    finished: false,
                    dnf: false,

                    currentSpeed: 0,
                    baseSpeed: baseSpeed * team.speedMod
                });

                aiIndex++;
            }
        }
    }

    calculateBaseSpeed(pilot, carStats) {
        return (pilot.stats.speed + carStats.speed) / 2;
    }

    calculateTireDegradation(pilot, carStats, compound) {
        const baseDeg = { soft: 1.5, medium: 1.0, hard: 0.6 };
        const skillMod = 1 - (pilot.stats.tireManagement / 200);
        const partMod = 1 - (carStats.tireWearReduction / 100);
        return baseDeg[compound] * skillMod * partMod;
    }

    setStartingGrid() {
        const sortedCars = Array.from(this.cars.values())
            .sort((a, b) => b.baseSpeed - a.baseSpeed);

        sortedCars.forEach((car, index) => {
            car.racePosition = index + 1;
            car.trackPosition = -0.01 * index;
        });
    }

    tick() {
        this.currentTick++;
        this.events = [];

        for (const car of this.cars.values()) {
            if (car.finished || car.dnf) continue;

            if (car.isInPit) {
                this.processPitStop(car);
            } else {
                this.processOnTrack(car);
            }
        }

        this.updatePositions();
        this.processAIDecisions();
        this.checkRaceEnd();

        return this.getStateSnapshot();
    }

    processOnTrack(car) {
        const tireModifier = this.getTireModifier(car);
        const ersModifier = this.getERSModifier(car);
        const consistencyVariation = this.getConsistencyVariation(car);

        car.currentSpeed = car.baseSpeed * tireModifier * ersModifier + consistencyVariation;

        const distancePerTick = car.currentSpeed / (this.tickRate * 5000);
        car.trackPosition += distancePerTick;

        if (car.trackPosition >= 1) {
            car.currentLap++;
            car.trackPosition -= 1;

            this.events.push({
                type: 'LAP_COMPLETE',
                carId: car.id,
                lap: car.currentLap
            });

            if (car.currentLap >= this.totalLaps) {
                car.finished = true;
                this.finishedCars.push(car.id);
                this.events.push({
                    type: 'CAR_FINISHED',
                    carId: car.id,
                    position: this.finishedCars.length
                });
            }
        }

        car.totalDistance = car.currentLap + car.trackPosition;

        car.tire.wear -= car.tire.degradationRate / this.tickRate;
        if (car.tire.wear < 0) car.tire.wear = 0;

        if (car.tire.wear < 15 && car.tire.wear > 14) {
            this.events.push({
                type: 'TIRE_CRITICAL',
                carId: car.id,
                wear: car.tire.wear
            });
        }

        this.processERS(car);
    }

    getTireModifier(car) {
        const wear = car.tire.wear;
        if (wear > 50) return 1.0;
        if (wear > 20) return 0.85 + (wear - 20) * 0.005;
        return 0.6 + wear * 0.0125;
    }

    getERSModifier(car) {
        switch (car.ers.mode) {
            case 'deploy':
                return car.ers.charge > 0 ? 1.08 : 1.0;
            case 'harvest':
                return 0.96;
            default:
                return 1.0;
        }
    }

    getConsistencyVariation(car) {
        const consistency = car.pilot.stats?.consistency || 80;
        const maxVariation = (100 - consistency) / 10;
        return (Math.random() - 0.5) * maxVariation;
    }

    processERS(car) {
        const efficiency = car.carStats?.ersEfficiency || 50;
        const efficiencyMod = efficiency / 50;

        switch (car.ers.mode) {
            case 'deploy':
                car.ers.charge -= (5 / this.tickRate);
                if (car.ers.charge < 0) car.ers.charge = 0;
                break;
            case 'harvest':
                car.ers.charge += (3 * efficiencyMod / this.tickRate);
                if (car.ers.charge > 100) car.ers.charge = 100;
                break;
            default:
                car.ers.charge += (1 * efficiencyMod / this.tickRate);
                if (car.ers.charge > 100) car.ers.charge = 100;
        }
    }

    processPitStop(car) {
        const basePitTime = 2.5 * this.tickRate;
        const pitBonus = car.carStats?.pitStopBonus || 0;
        const actualPitTime = basePitTime - pitBonus;

        car.pitProgress += (100 / actualPitTime);

        if (car.pitProgress >= 100) {
            car.isInPit = false;
            car.pitProgress = 0;
            car.pitCount++;
            car.tire.wear = 100;
            car.tire.degradationRate = this.calculateTireDegradation(
                car.pilot,
                car.carStats || {},
                car.tire.compound
            );

            this.events.push({
                type: 'PIT_EXIT',
                carId: car.id,
                compound: car.tire.compound,
                pitCount: car.pitCount
            });
        }
    }

    processAIDecisions() {
        for (const car of this.cars.values()) {
            if (car.owner !== 'ai' || car.finished || car.isInPit) continue;

            if (car.tire.wear < 25 && car.currentLap < this.totalLaps - 1 && car.pitCount === 0) {
                if (this.isInPitZone(car) && Math.random() < 0.3) {
                    this.enterPit(car);
                }
            }

            if (car.ers.charge < 20) {
                car.ers.mode = 'harvest';
            } else if (car.ers.charge > 80 && car.racePosition > 1) {
                car.ers.mode = 'deploy';
            } else {
                car.ers.mode = 'balanced';
            }
        }
    }

    isInPitZone(car) {
        return car.trackPosition > 0.85 && car.trackPosition < 0.95;
    }

    enterPit(car) {
        car.isInPit = true;
        car.pitProgress = 0;

        this.events.push({
            type: 'PIT_ENTER',
            carId: car.id
        });
    }

    updatePositions() {
        const sortedCars = Array.from(this.cars.values())
            .filter(c => !c.dnf)
            .sort((a, b) => {
                if (a.finished !== b.finished) return a.finished ? -1 : 1;
                return b.totalDistance - a.totalDistance;
            });

        sortedCars.forEach((car, index) => {
            const oldPosition = car.racePosition;
            car.racePosition = index + 1;

            if (oldPosition !== car.racePosition && this.currentTick > 20) {
                if (car.racePosition < oldPosition) {
                    this.events.push({
                        type: 'POSITION_GAIN',
                        carId: car.id,
                        from: oldPosition,
                        to: car.racePosition
                    });
                }
            }
        });
    }

    handleCommand(carId, command) {
        const car = this.cars.get(carId);
        if (!car || car.owner === 'ai') return;

        switch (command.type) {
            case 'PIT':
                if (!car.isInPit && this.isInPitZone(car)) {
                    car.tire.compound = command.compound || 'medium';
                    this.enterPit(car);
                }
                break;

            case 'ERS_MODE':
                if (['harvest', 'balanced', 'deploy'].includes(command.mode)) {
                    car.ers.mode = command.mode;
                }
                break;
        }
    }

    checkRaceEnd() {
        const activeCars = Array.from(this.cars.values()).filter(c => !c.finished && !c.dnf);
        if (activeCars.length === 0) {
            this.finished = true;
        }
    }

    isFinished() {
        return this.finished;
    }

    getResults() {
        const F1Points = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        const standings = Array.from(this.cars.values())
            .sort((a, b) => a.racePosition - b.racePosition)
            .map((car, index) => ({
                position: index + 1,
                carId: car.id,
                owner: car.owner,        // 'player1' | 'player2' | 'ai'
                userId: car.userId || null,
                pilotName: car.pilot.name,
                points: F1Points[index] || 0,
                pitCount: car.pitCount
            }));

        const player1Points = standings
            .filter(s => s.owner === 'player1')
            .reduce((sum, s) => sum + s.points, 0);

        const player2Points = standings
            .filter(s => s.owner === 'player2')
            .reduce((sum, s) => sum + s.points, 0);

        const player1UserId = standings.find(s => s.owner === 'player1')?.userId || null;
        const player2UserId = standings.find(s => s.owner === 'player2')?.userId || null;

        let winnerOwner = 'draw';
        if (player1Points > player2Points) winnerOwner = 'player1';
        if (player2Points > player1Points) winnerOwner = 'player2';

        const raceTimeSeconds = this.currentTick / this.tickRate;

        return {
            standings,
            player1Points,
            player2Points,
            winnerOwner,
            player1UserId,
            player2UserId,
            raceTimeSeconds
        };
    }

    getStateSnapshot() {
        return {
            tick: this.currentTick,
            raceTime: this.currentTick / this.tickRate,
            cars: Array.from(this.cars.values()).map(car => ({
                id: car.id,
                owner: car.owner,
                userId: car.userId,
                pilotName: car.pilot.name,
                position: car.racePosition,
                lap: car.currentLap,
                trackPosition: car.trackPosition,
                speed: Math.round(car.currentSpeed * 3),
                tireWear: Math.round(car.tire.wear),
                tireCompound: car.tire.compound,
                ersCharge: Math.round(car.ers.charge),
                ersMode: car.ers.mode,
                isInPit: car.isInPit,
                pitProgress: car.pitProgress,
                finished: car.finished
            })),
            events: this.events
        };
    }
}

module.exports = RaceEngine;