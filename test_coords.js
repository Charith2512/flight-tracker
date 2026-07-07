const fs = require('fs');
const path = require('path');

// Mocking the logic from routes.js
let airportsData = {};
let iataMap = {};

const loadData = () => {
    try {
        const dataPath = path.join(__dirname, 'backend', 'data', 'airports.json');
        console.log('Reading:', dataPath);
        airportsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        
        Object.keys(airportsData).forEach(icao => {
            const airport = airportsData[icao];
            if (airport.iata && airport.iata.length === 3) {
                iataMap[airport.iata] = icao;
            }
        });
        console.log(`Loaded ${Object.keys(airportsData).length} airports.`);
        console.log(`Mapped ${Object.keys(iataMap).length} IATA codes.`);
    } catch (e) {
        console.error(e);
    }
};

const getAirportCoords = (code) => {
    if (!code) return null;
    // Check ICAO first
    let airport = airportsData[code];
    // Check IATA if not found
    if (!airport && iataMap[code]) {
        console.log(`[Lookup] Found ICAO ${iataMap[code]} for IATA ${code}`);
        airport = airportsData[iataMap[code]];
    }
    return airport ? { lat: airport.lat, lon: airport.lon, name: airport.name } : null;
};

// RUN TEST
loadData();

const testCases = ['YYC', 'ATL', 'JFK', 'GIG', 'CYYC', 'KATL'];
console.log('\n--- TESTING COORDINATE LOOKUP ---');
testCases.forEach(code => {
    const result = getAirportCoords(code);
    console.log(`${code}: ${result ? 'FOUND' : 'MISSING'} -> ${result ? JSON.stringify(result) : ''}`);
});
