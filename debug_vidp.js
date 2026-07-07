const fs = require('fs');
const path = require('path');

function loadAirports() {
    try {
        const dataPath = path.join(__dirname, 'backend', 'data', 'airports.json');
        console.log("Loading path:", dataPath);

        const data = fs.readFileSync(dataPath, 'utf8');
        const airportsData = JSON.parse(data);
        console.log(`Loaded ${Object.keys(airportsData).length} airports.`);

        const vidp = airportsData['VIDP'];
        console.log('VIDP:', vidp);

        const lfpg = airportsData['LFPG'];
        console.log('LFPG:', lfpg);

    } catch (e) {
        console.log("JSON Load failed:", e.message);
    }
}

loadAirports();
