const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'backend', 'data', 'airports.json');
try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const keys = Object.keys(data);
    console.log(`Total Airports: ${keys.length}`);
    if (keys.length > 0) {
        const sample = data[keys[0]];
        console.log('Sample Entry:', JSON.stringify(sample, null, 2));
    }
    // Check if IATA is a property
    const hasIata = Object.values(data).some(a => a.iata);
    console.log('Has IATA property:', hasIata);
} catch (e) {
    console.error(e.message);
}
