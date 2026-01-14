// backend/src/race-engine/ERSModel.js

/**
 * ERS (Energy Recovery System) Model
 * 
 * Modes:
 * - NONE: +15% charge/lap, 0% speed bonus
 * - MEDIUM: 0% charge, +3% speed bonus
 * - HOTLAP: -10% charge/lap, +5% speed bonus
 * - OVERTAKE: -25% charge/lap, +8% speed bonus
 */

class ERSModel {
    static MODES = {
        NONE: {
            name: 'None',
            chargeRate: 15.0,      // % per lap
            speedBonus: 0.0,       // % speed increase
            deployRate: 0.0        // % per second
        },
        MEDIUM: {
            name: 'Medium',
            chargeRate: 0.0,
            speedBonus: 1.03,
            deployRate: 0.0
        },
        HOTLAP: {
            name: 'Hotlap',
            chargeRate: -10.0,
            speedBonus: 1.05,
            deployRate: 5.0        // % per second when active
        },
        OVERTAKE: {
            name: 'Overtake',
            chargeRate: -25.0,
            speedBonus: 1.08,
            deployRate: 12.5       // % per second when active
        }
    };

    /**
     * Calculate speed multiplier for current ERS mode
     */
    static getSpeedMultiplier(mode, charge) {
        const modeData = this.MODES[mode] || this.MODES.MEDIUM;
        
        // Ha nincs töltés és deployment módban van, nincs bonus
        if (charge <= 0 && (mode === 'HOTLAP' || mode === 'OVERTAKE')) {
            return 1.0;
        }
        
        return modeData.speedBonus;
    }

    /**
     * Update ERS charge based on mode and time
     * @param currentCharge - Current charge (0-100)
     * @param mode - Current ERS mode
     * @param deltaTime - Time elapsed in seconds
     * @param efficiency - Car ERS efficiency (50-100)
     * @returns New charge level
     */
    static updateCharge(currentCharge, mode, deltaTime, efficiency = 50) {
        const modeData = this.MODES[mode] || this.MODES.MEDIUM;
        const efficiencyMultiplier = efficiency / 50.0; // 50 = baseline
        
        let chargeChange = 0;
        
        if (mode === 'NONE') {
            // Töltés regenerálás
            chargeChange = modeData.chargeRate * efficiencyMultiplier * deltaTime;
        } else if (mode === 'HOTLAP' || mode === 'OVERTAKE') {
            // Deployment - csak ha van töltés
            if (currentCharge > 0) {
                chargeChange = -modeData.deployRate * deltaTime;
            }
        }
        // MEDIUM mode: nincs változás
        
        const newCharge = currentCharge + chargeChange;
        return Math.max(0, Math.min(100, newCharge));
    }

    /**
     * Calculate charge gained per lap completion
     */
    static getLapChargeBonus(mode, efficiency = 50) {
        const modeData = this.MODES[mode] || this.MODES.MEDIUM;
        const efficiencyMultiplier = efficiency / 50.0;
        
        // Körönként regenerálás (fékezésnél)
        if (mode === 'NONE') {
            return modeData.chargeRate * efficiencyMultiplier;
        }
        
        return 0;
    }

    /**
     * Check if mode is available based on charge
     */
    static isModeAvailable(mode, charge) {
        if (mode === 'HOTLAP' || mode === 'OVERTAKE') {
            return charge > 0;
        }
        return true;
    }

    /**
     * Get recommended mode based on situation
     */
    static getRecommendedMode(charge, position, gapToAhead, gapBehind) {
        // Ha nincs töltés, NONE
        if (charge < 10) {
            return 'NONE';
        }
        
        // Ha kevés a töltés, MEDIUM vagy NONE
        if (charge < 30) {
            return 'MEDIUM';
        }
        
        // Ha közel van előtte lévő (< 1s), OVERTAKE
        if (gapToAhead < 1.0 && charge > 50) {
            return 'OVERTAKE';
        }
        
        // Ha közel van hátulról (< 2s), HOTLAP vagy OVERTAKE
        if (gapBehind < 2.0 && charge > 40) {
            return 'HOTLAP';
        }
        
        // Alap: MEDIUM
        return 'MEDIUM';
    }
}

module.exports = ERSModel;