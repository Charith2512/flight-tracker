const axios = require('axios');

async function testRoute() {
    try {
        console.log('Fetching India -> Paris flights...');
        const res = await axios.get('http://localhost:3000/api/flights-by-route?from=India&to=Paris');
        const flights = res.data;

        console.log(`Found ${flights.length} flights.`);

        // Filter for the ones that failed in browser
        const targetCallsigns = ['AIC', 'SVA', 'SXS', 'AFR'];
        const problems = flights.filter(f => targetCallsigns.some(c => f.callsign.startsWith(c)));

        console.log('\n--- INSPECTION ---');
        problems.slice(0, 5).forEach(f => {
            console.log(`\nFlight: ${f.callsign} (${f.source})`);
            console.log(`Origin: ${f.origin} | City: ${f.origin_city} | Coords:`, f.origin_coords);
            console.log(`Dest:   ${f.destination} | City: ${f.destination_city} | Coords:`, f.destination_coords);
        });

    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) console.log(e.response.data);
    }
}

testRoute();
