const fs = require('fs');
const content = fs.readFileSync('game.js', 'utf8');
const fixed = content.replace(/\n/g, '\n');
fs.writeFileSync('game.js', fixed);
console.log('Fixed newlines in game.js');
