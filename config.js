// Meme Karts Online Configuration
const GAME_CONFIG = {
    // Contract Information
    CONTRACT_ADDRESS: "5okYiUQ9XXDZHUtDyN7ZDtYkHdbGP2XbRvdTDcj1pump", // Update this when token launches
    CONTRACT_NAME: "MemeKarts Online",
    CONTRACT_SYMBOL: "MEMEKART",
    
    // Blockchain Network
    NETWORK: {
        name: "Solana",
        chainId: 101,
        explorerUrl: "https://solscan.io"
    },
    
    // Buy Button Configuration
    BUY_BUTTON: {
        enabled: true, // Set to true when token launches
        url: "https://pump.fun/coin/5okYiUQ9XXDZHUtDyN7ZDtYkHdbGP2XbRvdTDcj1pump", // Update with full URL when token launches
        text: "🚀 Buy on Pump.fun"
    },
    
    // Game Settings
    GAME: {
        maxLaps: 3,
        maxPlayers: 5,
        raceTimeout: 300000, // 5 minutes
        workerUrl: "https://gokarts-multiplayer-prod.stealthbundlebot.workers.dev"
    },
    
    // UI/Branding
    BRANDING: {
        gameTitle: "🏎️ Meme Karts Online",
        tagline: "Race to the Moon with Crypto Speed!",
        description: "The ultimate crypto racing game where speed meets DeFi. Race, win, and earn tokens!",
        
        // Social Links
        socials: {
            twitter: "https://twitter.com/memekartsonline",
            website: "https://memekarts.online"
        }
    },
    
    // Features
    FEATURES: [
        "🏁 Real-time multiplayer racing",
        "🎯 Precision checkpoint system", 
        "🏆 Competitive leaderboards",
        "💎 Launching on Pump.fun",
        "🗺️ New maps every 30 minutes",
        "📱 Mobile app coming soon"
    ],
    
    // Dynamic Content System
    DYNAMIC_CONTENT: {
        mapRotation: {
            enabled: true,
            interval: 30, // minutes
            description: "Experience fresh racing challenges with dynamically generated tracks that rotate every 30 minutes for endless variety!"
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
