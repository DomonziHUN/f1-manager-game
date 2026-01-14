// backend/src/race-engine/RaceEngine.js

const TireModel = require('./TireModel');
const ERSModel = require('./ERSModel');

class RaceEngine {
    constructor(config) {
        this.raceId = config.raceId;
        this.track = config.track; // { id, name, laps, tire_wear_factor }
        this.totalLaps = config.track.laps;
        
        // ÚJ: 50 tick/sec = 20ms
        this.tickRate = 50;
        
        this.currentTick = 0;
        this.weather = config.weather || 'dry';
        
        // ÚJ: Időjárás rendszer
        this.weatherChangeProbability = 0.02; // 2% per lap
        this.nextWeatherCheck = 3; // 3 kör múlva első ellenőrzés

        this.cars = new Map();
        this.events = [];
        this.finished = false;
        this.finishedCars = [];

        this.initializePlayerCars(config.players || []);
        this.initializeAICars();
        this.setStartingGrid(config.qualifyingGrid || []);
    }

    initializePlayerCars(players) {
        players.forEach((player, playerIndex) => {
            const ownerTag = playerIndex === 0 ? 'player1' : 'player2';
            const tireMap = player.selectedTires || {}; // { "1": "soft", "2": "medium" }

            for (const pilot of player.pilots) {
                const slot = pilot.slot || 1;
                const carId = `${ownerTag}_car${slot}`;
                const compound = (tireMap[String(slot)] || 'medium').toLowerCase();

                this.cars.set(carId, {
                    id: carId,
                    owner: ownerTag,
                    userId: player.userId,
                    pilot: pilot,
                    carStats: player.carStats,

                    trackPosition: 0,
                    currentLap: 0,
                    racePosition: 0,
                    totalDistance: 0,

                    tire: {
                        compound,
                        wear: 100,
                        age: 0 // körök száma ezen a gumikompleten
                    },

                    ers: {
                        charge: 100,
                        mode: 'MEDIUM' // ÚJ: NONE, MEDIUM, HOTLAP, OVERTAKE
                    },

                    isInPit: false,
                    pitProgress: 0,
                    pitCount: 0,
                    pitScheduled: false, // ÚJ: pit stop kérés
                    newTireCompound: null, // ÚJ: mit kért boxban
                    
                    finished: false,
                    dnf: false,

                    currentSpeed: 0,
                    baseSpeed: this.calculateBaseSpeed(pilot, player.carStats),
                    
                    // ÚJ: Fuel system (opcionális, később)
                    fuel: 100,
                    
                    // ÚJ: Stratégia
                    strategy: 'normal' // normal, aggressive, conservative
                });
            }
        });
    }

    initializeAICars() {
        const aiTeams = [
            { name: 'AI Team 1', speedMod: 0.95 },
            { name: 'AI Team 2', speedMod: 0.90 },
            { name: 'AI Team 3', speedMod: 0.88 },
            { name: 'AI Team 4', speedMod: 0.85 },
            { name: 'AI Team 5', speedMod: 0.82 },
            { name: 'AI Team 6', speedMod: 0.80 },
            { name: 'AI Team 7', speedMod: 0.78 },
            { name: 'AI Team 8', speedMod: 0.75 }
        ];

        const aiCompound = this._bestRaceCompoundForWeather();

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
                            tireManagement: 70 + Math.random() * 20,
                            wetSkill: 75
                        }
                    },
                    carStats: {
                        speed: 50 + Math.random() * 30,
                        acceleration: 50 + Math.random() * 30,
                        downforce: 50,
                        tireWearReduction: Math.random() * 10,
                        ersEfficiency: 50 + Math.random() * 30,
                        pitStopBonus: 0
                    },

                    trackPosition: 0,
                    currentLap: 0,
                    racePosition: 0,
                    totalDistance: 0,

                    tire: {
                        compound: aiCompound,
                        wear: 100,
                        age: 0
                    },

                    ers: {
                        charge: 100,
                        mode: 'MEDIUM'
                    },

                    isInPit: false,
                    pitProgress: 0,
                    pitCount: 0,
                    pitScheduled: false,
                    newTireCompound: null,
                    finished: false,
                    dnf: false,

                    currentSpeed: 0,
                    baseSpeed: baseSpeed * team.speedMod,
                    fuel: 100,
                    strategy: 'normal'
                });

                aiIndex++;
            }
        }
    }

    _bestRaceCompoundForWeather() {
        const w = this.weather;
        if (w === 'dry' || w === 'cloudy') return 'medium';
        if (w === 'light_rain') return 'intermediate';
        if (w === 'rain' || w === 'storm') return 'wet';
        return 'medium';
    }

    calculateBaseSpeed(pilot, carStats) {
        const s = pilot.stats.speed ?? 80;
        const car = carStats.speed ?? 50;
        return (s + car) / 2;
    }

    setStartingGrid(qualifyingGrid) {
        if (!qualifyingGrid || qualifyingGrid.length === 0) {
            // Fallback: base speed alapján
            const sortedCars = Array.from(this.cars.values())
                .sort((a, b) => b.baseSpeed - a.baseSpeed);

            sortedCars.forEach((car, index) => {
                car.racePosition = index + 1;
                car.trackPosition = -0.01 * index; // Rajtpozíció offset
            });
        } else {
            // Qualifying eredmény alapján
            qualifyingGrid.forEach((gridPos, index) => {
                const carId = this._findCarIdFromQualifying(gridPos);
                const car = this.cars.get(carId);
                if (car) {
                    car.racePosition = index + 1;
                    car.trackPosition = -0.01 * index;
                }
            });
        }
    }

    _findCarIdFromQualifying(gridPos) {
        // gridPos: { owner, userId, pilotSlot }
        if (gridPos.owner === 'ai') {
            return `ai_car_${gridPos.aiIndex || 0}`;
        }
        return `${gridPos.owner}_car${gridPos.pilotSlot || 1}`;
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
        this.checkWeatherChange();
        this.checkRaceEnd();

        return this.getStateSnapshot();
    }

    processOnTrack(car) {
        // Gumi grip
        const grip = TireModel.computeGripModifier(
            car.tire.compound,
            car.tire.wear,
            this.weather
        );

        // ERS modifier
        const ersModifier = ERSModel.getSpeedMultiplier(car.ers.mode, car.ers.charge);

        // Consistency variation
        const consistencyVariation = this.getConsistencyVariation(car);

        // Fuel weight (opcionális)
        const fuelModifier = 1.0 - (car.fuel / 100.0) * 0.02; // Max 2% gyorsulás üresen

        // Aktuális sebesség
        car.currentSpeed = car.baseSpeed * grip * ersModifier * fuelModifier + consistencyVariation;

        // Távolság növelés
        const distancePerTick = car.currentSpeed / (this.tickRate * 5000);
        car.trackPosition += distancePerTick;

        // Kör vége
        if (car.trackPosition >= 1.0) {
            car.currentLap++;
            car.trackPosition -= 1.0;
            car.tire.age++;

            this.events.push({
                type: 'LAP_COMPLETE',
                carId: car.id,
                lap: car.currentLap,
                lapTime: this.calculateLapTime(car)
            });

            // Gumi kopás
            const tireMgmt = car.pilot.stats?.tireManagement ?? 75;
            const wearRed = car.carStats?.tireWearReduction ?? 0;
            const trackFactor = this.track.tire_wear_factor ?? 1.0;

            car.tire.wear = TireModel.computeWearAfterLaps(
                car.tire.compound,
                car.tire.wear,
                {
                    driverTireMgmt: tireMgmt,
                    carTireWearReduction: wearRed,
                    trackTireFactor: trackFactor,
                    weather: this.weather,
                    laps: 1
                }
            );

            // ERS lap bonus
            const ersEfficiency = car.carStats?.ersEfficiency ?? 50;
            const lapBonus = ERSModel.getLapChargeBonus(car.ers.mode, ersEfficiency);
            car.ers.charge = Math.min(100, car.ers.charge + lapBonus);

            // Gumi warning
            if (car.tire.wear < 15 && car.tire.wear > 10) {
                this.events.push({
                    type: 'TIRE_CRITICAL',
                    carId: car.id,
                    wear: car.tire.wear
                });
            }

            // Verseny vége
            if (car.currentLap >= this.totalLaps) {
                car.finished = true;
                car.trackPosition = 1.0;
                this.finishedCars.push(car.id);
                this.events.push({
                    type: 'CAR_FINISHED',
                    carId: car.id,
                    position: this.finishedCars.length
                });
            }

            // AI pit stop döntés
            if (car.owner === 'ai' && !car.pitScheduled) {
                this.checkAIPitStop(car);
            }
        }

        car.totalDistance = car.currentLap + car.trackPosition;

        // ERS update (tick-based)
        this.processERS(car);

        // Üzemanyag fogyás (opcionális)
        car.fuel = Math.max(0, car.fuel - 0.001);
    }

    getConsistencyVariation(car) {
        const consistency = car.pilot.stats?.consistency || 80;
        const maxVariation = (100 - consistency) / 10;
        return (Math.random() - 0.5) * maxVariation;
    }

    processERS(car) {
        const efficiency = car.carStats?.ersEfficiency || 50;
        const deltaTime = 1.0 / this.tickRate; // másodperc

        car.ers.charge = ERSModel.updateCharge(
            car.ers.charge,
            car.ers.mode,
            deltaTime,
            efficiency
        );

        // Ha elfogy az ERS, automatic fallback MEDIUM-ra
        if (car.ers.charge <= 0 && (car.ers.mode === 'HOTLAP' || car.ers.mode === 'OVERTAKE')) {
            car.ers.mode = 'MEDIUM';
            this.events.push({
                type: 'ERS_DEPLETED',
                carId: car.id
            });
        }
    }

    processPitStop(car) {
        const basePitTime = 2.5 * this.tickRate; // 2.5 másodperc
        const pitBonus = car.carStats?.pitStopBonus || 0;
        const actualPitTime = basePitTime - pitBonus;

        car.pitProgress += (100 / actualPitTime);

        if (car.pitProgress >= 100) {
            car.isInPit = false;
            car.pitProgress = 0;
            car.pitCount++;
            car.pitScheduled = false;
            
            // Új gumi
            if (car.newTireCompound) {
                car.tire.compound = car.newTireCompound;
                car.newTireCompound = null;
            }
            car.tire.wear = 100;
            car.tire.age = 0;

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

            // ERS stratégia
            const gapToAhead = this.getGapToAhead(car);
            const gapBehind = this.getGapBehind(car);
            
            const recommendedMode = ERSModel.getRecommendedMode(
                car.ers.charge,
                car.racePosition,
                gapToAhead,
                gapBehind
            );
            
            if (ERSModel.isModeAvailable(recommendedMode, car.ers.charge)) {
                car.ers.mode = recommendedMode;
            }
        }
    }

    checkAIPitStop(car) {
        // AI pit stop logika
        if (car.tire.wear < 25 && car.currentLap < this.totalLaps - 2 && car.pitCount === 0) {
            if (this.isInPitZone(car) && Math.random() < 0.4) {
                this.schedulePitStop(car, this._bestRaceCompoundForWeather());
            }
        }
    }

    schedulePitStop(car, newCompound) {
        car.pitScheduled = true;
        car.newTireCompound = newCompound;
        
        if (this.isInPitZone(car)) {
            this.enterPit(car);
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

    getGapToAhead(car) {
        const sortedCars = Array.from(this.cars.values())
            .filter(c => !c.dnf && !c.finished)
            .sort((a, b) => b.totalDistance - a.totalDistance);
        
        const index = sortedCars.findIndex(c => c.id === car.id);
        if (index <= 0) return 999;
        
        const ahead = sortedCars[index - 1];
        const distGap = ahead.totalDistance - car.totalDistance;
        return distGap / (car.currentSpeed / this.tickRate);
    }

    getGapBehind(car) {
        const sortedCars = Array.from(this.cars.values())
            .filter(c => !c.dnf && !c.finished)
            .sort((a, b) => b.totalDistance - a.totalDistance);
        
        const index = sortedCars.findIndex(c => c.id === car.id);
        if (index >= sortedCars.length - 1) return 999;
        
        const behind = sortedCars[index + 1];
        const distGap = car.totalDistance - behind.totalDistance;
        return distGap / (behind.currentSpeed / this.tickRate);
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
                        type: 'OVERTAKE',
                        carId: car.id,
                        from: oldPosition,
                        to: car.racePosition
                    });
                }
            }
        });
    }

    checkWeatherChange() {
        // Egyszerű időjárás változás (később WeatherEngine)
        if (this.currentLap >= this.nextWeatherCheck) {
            if (Math.random() < this.weatherChangeProbability) {
                const oldWeather = this.weather;
                this.weather = this._getNextWeather();
                
                if (this.weather !== oldWeather) {
                    this.events.push({
                        type: 'WEATHER_CHANGE',
                        from: oldWeather,
                        to: this.weather
                    });
                }
            }
            this.nextWeatherCheck += 3;
        }
    }

    _getNextWeather() {
        const transitions = {
            'dry': ['dry', 'cloudy'],
            'cloudy': ['dry', 'cloudy', 'light_rain'],
            'light_rain': ['cloudy', 'light_rain', 'rain'],
            'rain': ['light_rain', 'rain', 'storm'],
            'storm': ['rain', 'storm']
        };
        const options = transitions[this.weather] || ['dry'];
        return options[Math.floor(Math.random() * options.length)];
    }

    get currentLap() {
        const maxLap = Math.max(...Array.from(this.cars.values()).map(c => c.currentLap));
        return maxLap;
    }

    handleCommand(carId, command) {
        const car = this.cars.get(carId);
        if (!car || car.owner === 'ai') return;

        switch (command.type) {
            case 'PIT':
                if (!car.isInPit && !car.pitScheduled) {
                    const compound = command.compound || this._bestRaceCompoundForWeather();
                    this.schedulePitStop(car, compound);
                }
                break;

            case 'ERS_MODE':
                if (['NONE', 'MEDIUM', 'HOTLAP', 'OVERTAKE'].includes(command.mode)) {
                    if (ERSModel.isModeAvailable(command.mode, car.ers.charge)) {
                        car.ers.mode = command.mode;
                    }
                }
                break;
        }
    }

    calculateLapTime(car) {
        // Egyszerű lap time kalkuláció
        const baseTime = 90.0; // másodperc
        const speedFactor = car.baseSpeed / 100.0;
        const gripFactor = TireModel.computeGripModifier(car.tire.compound, car.tire.wear, this.weather);
        
        return baseTime / (speedFactor * gripFactor);
    }

    checkRaceEnd() {
        const activeCars = Array.from(this.cars.values()).filter(c => !c.finished && !c.dnf);
        if (activeCars.length === 0) this.finished = true;
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
                owner: car.owner,
                userId: car.userId || null,
                pilotName: car.pilot.name,
                points: F1Points[index] || 0,
                pitCount: car.pitCount,
                fastestLap: null // TODO
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
        const sortedCars = Array.from(this.cars.values())
            .filter(c => !c.dnf)
            .sort((a, b) => b.totalDistance - a.totalDistance);

        const leader = sortedCars[0];
        const leaderDistance = leader ? leader.totalDistance : 0;

        return {
            tick: this.currentTick,
            raceTime: this.currentTick / this.tickRate,
            currentLap: this.currentLap,
            totalLaps: this.totalLaps,
            weather: this.weather,
            cars: sortedCars.map((car, index) => {
                const gapToLeader = leaderDistance - car.totalDistance;
                const gapInSeconds = index === 0 ? 0 : gapToLeader / (car.currentSpeed / this.tickRate);
                
                const gapToAhead = index === 0 ? 0 : this.getGapToAhead(car);

                return {
                    id: car.id,
                    owner: car.owner,
                    userId: car.userId,
                    pilotName: car.pilot.name,
                    team: car.team || car.pilot.team || '',
                    position: index + 1,
                    lap: car.currentLap,
                    trackPosition: car.trackPosition,
                    totalDistance: car.totalDistance,
                    speed: Math.round(car.currentSpeed * 3),
                    
                    gapToLeader: gapInSeconds,
                    gapToAhead: gapToAhead,
                    
                    tireWear: Math.round(car.tire.wear),
                    tireCompound: car.tire.compound,
                    tireAge: car.tire.age,
                    
                    ersCharge: Math.round(car.ers.charge),
                    ersMode: car.ers.mode,
                    
                    isInPit: car.isInPit,
                    pitProgress: Math.round(car.pitProgress),
                    pitCount: car.pitCount,
                    
                    fuel: Math.round(car.fuel),
                    finished: car.finished
                };
            }),
            events: this.events
        };
    }
}

module.exports = RaceEngine;