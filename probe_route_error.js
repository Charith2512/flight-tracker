const axios = require('axios');

async function testRoute() {
    console.log("Testing Route Search: India -> London");
    try {
        const url = 'http://localhost:3000/api/flights-by-route?from=India&to=London';
        console.log(`GET ${url}`);

        const start = Date.now();
        const res = await axios.get(url, { timeout: 30000 });
        const duration = Date.now() - start;

        console.log(`Status: ${res.status} ${res.statusText}`);
        console.log(`Duration: ${duration}ms`);
        console.log(`Flights Found: ${Array.isArray(res.data) ? res.data.length : 'Not Array'}`);

        if (Array.isArray(res.data) && res.data.length > 0) {
            const sample = res.data[0];
            console.log("Sample Flight:", {
                callsign: sample.callsign,
                coords: sample.origin_coords
            });
        } else {
            console.log("Response Body:", res.data);
        }

    } catch (e) {
        console.error("Request Failed:");
        if (e.response) {
            console.error(`Status: ${e.response.status}`);
            console.error(`Data: ${JSON.stringify(e.response.data)}`);
        } else {
            console.error(e.message);
        }
    }
}

testRoute();
