const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

async function testRouteSearch() {
    const apiKey = process.env.AIRLABS_API_KEY;
    if (!apiKey) {
        console.error('No API Key found in .env');
        return;
    }

    // specific test case: India -> Dubai
    // Based on logic: dep_country=IN & arr_iata=DXB (mapped from Dubai)
    const url = `https://airlabs.co/api/v9/flights?api_key=${apiKey}&dep_country=IN&arr_iata=DXB`;

    console.log(`Testing URL: ${url}`);

    try {
        const res = await axios.get(url);
        const flights = res.data.response || [];
        console.log(`Found ${flights.length} flights.`);

        flights.forEach(f => {
            console.log(`Flight ${f.flight_icao || f.flight_iata}: ${f.dep_icao} -> ${f.arr_icao} (Origin Country: ${f.flag})`);
        });

        // specific check: Are there non-IN flags?
        const bad = flights.filter(f => f.flag !== 'IN'); // Assuming 'flag' is country code (it usually is ISO2)
        // Wait, 'flag' in AirLabs is usually the country of the airline registry?? 
        // No, docs say 'flag': "Country ISO2 code of the aircraft". 
        // THAT IS NOT THE DEPARTURE COUNTRY.

        // We need to check if AirLabs PROPERLY filtered by DEPARTURE country despite returning aircraft flags.
        // Actually, let's look at the output. 

    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) console.log(e.response.data);
    }
}

testRouteSearch();
