// GoKarts Game Configuration
const GAME_CONFIG = {
    // Contract Information
    CONTRACT_ADDRESS: "0x1234567890abcdef1234567890abcdef12345678", // Replace with your actual CA
    CONTRACT_NAME: "GoKarts Token",
    CONTRACT_SYMBOL: "GOKART",
    
    // Blockchain Network
    NETWORK: {
        name: "Ethereum",
        chainId: 1,
        explorerUrl: "https://etherscan.io"
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
            twitter: "https://twitter.com/gokarts",
            discord: "https://discord.gg/gokarts", 
            telegram: "https://t.me/gokarts",
            website: "https://gokarts.game"
        }
    },
    
    // Features
    FEATURES: [
        "🏁 Real-time multiplayer racing",
        "🎯 Precision checkpoint system", 
        "🏆 Competitive leaderboards",
        "💎 Crypto integration ready",
        "🚀 Fast-paced gameplay"
    ]
};

// Make config available globally
if (typeof window !== 'undefined') {
    window.GAME_CONFIG = GAME_CONFIG;
}

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GAME_CONFIG;
}