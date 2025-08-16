// GoKarts Game Configuration
const GAME_CONFIG = {
    // Contract Information
    CONTRACT_ADDRESS: "TBD_PUMP_FUN_ADDRESS", // Will be updated after Pump.fun launch
    CONTRACT_NAME: "GoKarts Token",
    CONTRACT_SYMBOL: "GOKART",
    
    // Blockchain Network
    NETWORK: {
        name: "Solana",
        chainId: 101,
        explorerUrl: "https://solscan.io"
    },
    
    // Buy Button Configuration
    BUY_BUTTON: {
        enabled: true,
        url: "https://pump.fun/TBD_PUMP_FUN_ADDRESS", // Will be updated after launch
        text: "🚀 Buy on Pump.fun"
    },
    
    // Game Settings
    GAME: {
        maxLaps: 3,
        maxPlayers: 5,
        raceTimeout: 300000, // 5 minutes
    },
    
    // UI/Branding
    BRANDING: {
        gameTitle: "🏎️ GoKarts Racing",
        tagline: "Race to the Moon with Crypto Speed!",
        description: "The ultimate crypto racing game where speed meets DeFi. Race, win, and earn tokens!",
        
        // Social Links
        socials: {
            twitter: "https://twitter.com/gokartsonline_",
            website: "https://gokarts.online"
        }
    },
    
    // Features
    FEATURES: [
        "🏁 Real-time multiplayer racing",
        "🎯 Precision checkpoint system", 
        "🏆 Competitive leaderboards",
        "💎 Launching on Pump.fun",
        "⛽ Verifiable gas fee rewards",
        "📱 Mobile app coming soon"
    ],
    
    // Rewards System
    REWARDS: {
        gasFeeGiveaway: {
            enabled: true,
            interval: 30, // minutes
            description: "Top leaderboard player receives gas fee rewards from token treasury every 30 minutes with verifiable on-chain transactions!"
        }
    }
};

// Make config available globally
if (typeof window !== 'undefined') {
    window.GAME_CONFIG = GAME_CONFIG;
}

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GAME_CONFIG;
}
