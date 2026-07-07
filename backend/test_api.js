const { getToken } = require('./auth');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

async function testFlightDetails() {
    console.log('Testing OpenSky Flight Details...');
    try {
        const token = await getToken();
        
        // 1. Get a live flight first to get a valid ICAO
        console.log('1. Fetching a live flight...');
        const statesUrl = 'https://opensky-network.org/api/states/all?lamin=45.8389&lomin=5.9962&lamax=47.8229&lomax=10.5226';
        const statesRes = await axios.get(statesUrl, { headers: { Authorization: `Bearer ${token}` } });
        
        const activeFlight = (statesRes.data.states || [])[0];
        if (!activeFlight) {
            console.log('No active flights found to test.');
            return;
        }
        
        const icao24 = activeFlight[0];
        console.log(`Found active flight: ${icao24} (${activeFlight[1].trim()})`);

        // 2. Fetch Flight Route/Metadata
        const now = Math.floor(Date.now() / 1000);
        const begin = now - 86400; // 24 hours ago
        const end = now + 4000;    // bit into future to catch current
        
        const flightsUrl = `https://opensky-network.org/api/flights/aircraft?icao24=${icao24}&begin=${begin}&end=${end}`;
        console.log(`2. Fetching details from: ${flightsUrl}`);
        
        const flightsRes = await axios.get(flightsUrl, { headers: { Authorization: `Bearer ${token}` } });
        
        console.log('Flight details fetched successfully!');
        if (flightsRes.data.length > 0) {
            const latest = flightsRes.data[flightsRes.data.length - 1];
            console.log('Latest Flight Segment:', latest);
            console.log(`Origin: ${latest.estDepartureAirport || 'Unknown'}`);
            console.log(`Destination: ${latest.estArrivalAirport || 'Unknown'}`);
        } else {
            console.log('No flight segments found for this aircraft in the last 24h.');
        }

    } catch (error) {
        console.error('API Test Failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

testFlightDetails();
