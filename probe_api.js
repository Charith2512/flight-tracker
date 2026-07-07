const axios = require('axios');

async function test() {
    try {
        console.log('Fetching WJA1590...');
        const res = await axios.get('http://localhost:3000/api/search?q=WJA1590');
        const f = res.data;
        console.log('--- FLIGHT DATA ---');
        console.log('Callsign:', f.callsign);
        console.log('Origin:', f.origin, f.origin_coords);
        console.log('Dest:', f.destination, f.destination_coords);
        console.log('Source:', f.source);
    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) console.log(e.response.data);
    }
}
test();
