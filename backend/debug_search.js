const { getToken } = require('./auth');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

async function debugCallsignSearch(callsign) {
    console.log(`Debug Search for CallSign: ${callsign}`);
    try {
        const token = await getToken();
        console.log('Token acquired.');
        
        console.log('Fetching ALL global states (this is heavy)...');
        const start = Date.now();
        const response = await axios.get('https://opensky-network.org/api/states/all', {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000 // 10s timeout for debug
        });
        const duration = Date.now() - start;
        console.log(`Fetched ${response.data.states?.length} flights in ${duration}ms`);

        const searchCallsign = callsign.toUpperCase().trim();
        const match = (response.data.states || []).find(s => s[1].trim().toUpperCase() === searchCallsign);

        if (match) {
            console.log('FOUND MATCH!', match);
        } else {
            console.log('No exact match found.');
            // Print first 5 active callsigns
            console.log('Sample Active Callsigns:', (response.data.states || []).slice(0, 5).map(s => s[1].trim()));
        }

    } catch (error) {
        console.error('Debug Failed:', error.message);
    }
}

debugCallsignSearch('IGO067');
