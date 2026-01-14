// backend/race-engine/TireModel.js

/**
 * Újrafelhasználható gumimodell kvalira és versenyre.
 *
 * - Kopás (wear) 0–100 skálán (100 = új gumi).
 * - computeWearAfterLaps: kopás N körön keresztül.
 * - computeGripModifier: aktuális grip multipliert ad vissza (verseny).
 * - computeQualiTireModifier: kvalin használt „brutálisabb” gumi szorzó.
 */

const COMPOUNDS = {
    soft: {
        name: 'Soft',
        baseGripDry: 1.05,
        baseGripWet: 0.70,
        baseWearPerLap: 6.0
    },
    medium: {
        name: 'Medium',
        baseGripDry: 1.00,
        baseGripWet: 0.65,
        baseWearPerLap: 4.0
    },
    hard: {
        name: 'Hard',
        baseGripDry: 0.96,
        baseGripWet: 0.60,
        baseWearPerLap: 2.5
    },
    intermediate: {
        name: 'Intermediate',
        baseGripDry: 0.90,
        baseGripWet: 1.05,
        baseWearPerLap: 5.0
    },
    wet: {
        name: 'Full Wet',
        baseGripDry: 0.85,
        baseGripWet: 1.00,
        baseWearPerLap: 3.5
    }
};

const WET_WEATHERS = new Set(['light_rain', 'heavy_rain', 'storm']);

function getCompoundDef(compound) {
    const key = (compound || 'medium').toLowerCase();
    return COMPOUNDS[key] || COMPOUNDS.medium;
}

/**
 * Kopás számítása N körre.
 */
function computeWearAfterLaps(compound, currentWear, params = {}) {
    const def = getCompoundDef(compound);

    const driverTireMgmt = clamp(params.driverTireMgmt ?? 75, 0, 100);
    const carTireWearReduction = clamp(params.carTireWearReduction ?? 0, 0, 100);
    const trackTireFactor = params.trackTireFactor ?? 1.0;
    const laps = params.laps ?? 1;
    const weather = params.weather || 'dry';

    let wearPerLap = def.baseWearPerLap;

    const driverMod = 1.5 - (driverTireMgmt / 100); // 0→1.5, 100→0.5
    wearPerLap *= driverMod;

    const carMod = 1.0 - (carTireWearReduction / 200); // 0→1.0, 100→0.5
    wearPerLap *= carMod;

    wearPerLap *= trackTireFactor;

    if (WET_WEATHERS.has(weather)) {
        wearPerLap *= 0.85;
    }

    const totalWearLoss = wearPerLap * laps;

    let newWear = currentWear - totalWearLoss;
    if (newWear < 0) newWear = 0;
    if (newWear > 100) newWear = 100;

    return newWear;
}

/**
 * Grip szorzó versenyre (minél nagyobb, annál gyorsabb).
 * Itt viszonylag „finom” büntetést adunk rossz gumiért,
 * hogy a futam ne boruljon szét brutálisan.
 */
function computeGripModifier(compound, wear, weather = 'dry') {
    const c = (compound || 'medium').toLowerCase();
    const isWet = WET_WEATHERS.has(weather);

    let baseGrip;

    if (!isWet) {
        // Száraz pálya
        if (c === 'soft') baseGrip = 1.03;
        else if (c === 'medium') baseGrip = 1.0;
        else if (c === 'hard') baseGrip = 0.97;
        else if (c === 'intermediate') baseGrip = 0.90;
        else if (c === 'wet') baseGrip = 0.85;
        else baseGrip = 1.0;
    } else if (weather === 'light_rain') {
        // Enyhe eső
        if (c === 'intermediate') baseGrip = 1.05;
        else if (c === 'wet') baseGrip = 1.0;
        else if (c === 'soft') baseGrip = 0.80;
        else if (c === 'medium') baseGrip = 0.78;
        else if (c === 'hard') baseGrip = 0.75;
        else baseGrip = 0.80;
    } else {
        // Heavy rain / storm
        if (c === 'wet') baseGrip = 1.05;
        else if (c === 'intermediate') baseGrip = 1.0;
        else if (c === 'soft') baseGrip = 0.75;
        else if (c === 'medium') baseGrip = 0.70;
        else if (c === 'hard') baseGrip = 0.65;
        else baseGrip = 0.70;
    }

    const wearNorm = clamp(wear, 0, 100) / 100;
    const wearFactor = 0.8 + wearNorm * 0.2;

    return baseGrip * wearFactor;
}

/**
 * Kvalifikációs gumi szorzó – itt lehetünk agresszívebbek,
 * mert csak egy gyorskörre vonatkozik, és nincs kopás.
 */
function computeQualiTireModifier(compound, weather = 'dry') {
    const c = (compound || 'medium').toLowerCase();
    const isWet = WET_WEATHERS.has(weather);

    // DRY
    if (!isWet) {
        // Soft = leggyorsabb, Wet = nagyon rossz
        if (c === 'soft') return 1.06;
        if (c === 'medium') return 1.0;
        if (c === 'hard') return 0.97;
        if (c === 'intermediate') return 0.80;
        if (c === 'wet') return 0.70;
        return 1.0;
    }

    // LIGHT RAIN
    if (weather === 'light_rain') {
        if (c === 'intermediate') return 1.06;
        if (c === 'wet') return 1.02;
        if (c === 'soft') return 0.80;
        if (c === 'medium') return 0.75;
        if (c === 'hard') return 0.72;
        return 0.78;
    }

    // HEAVY RAIN / STORM
    if (weather === 'heavy_rain' || weather === 'storm') {
        if (c === 'wet') return 1.06;
        if (c === 'intermediate') return 1.0;
        if (c === 'soft') return 0.70;
        if (c === 'medium') return 0.67;
        if (c === 'hard') return 0.65;
        return 0.70;
    }

    // Fallback
    const def = getCompoundDef(compound);
    return isWet ? def.baseGripWet : def.baseGripDry;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

module.exports = {
    COMPOUNDS,
    getCompoundDef,
    computeWearAfterLaps,
    computeGripModifier,
    computeQualiTireModifier
};