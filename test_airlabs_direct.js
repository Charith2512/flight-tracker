const axios = require('axios');
require('dotenv').config();

async function testConnectivity() {
    console.log("Testing AirLabs Connectivity...");
    const key = process.env.AIRLABS_API_KEY;
    console.log(`Key present: ${!!key}`);

    try {
        const url = `https://airlabs.co/api/v9/ping?api_key=${key}`;
        console.log(`GET ${url.replace(key, '***')}`);

        const start = Date.now();
        const res = await axios.get(url, { timeout: 10000 });
        const time = Date.now() - start;

        console.log(`Success! Status: ${res.status}`);
        console.log(`Latency: ${time}ms`);
        console.log(`Data:`, res.data);

    } catch (e) {
        console.error(`Failed: ${e.message}`);
        if (e.response) {
            console.error(`Status: ${e.response.status}`);
            console.error(e.response.data);
        }
    }
}

testConnectivity();
