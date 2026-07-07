const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

let accessToken = null;
let tokenExpiry = null;

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

async function fetchToken() {
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', process.env.OPENSKY_CLIENT_ID);
        params.append('client_secret', process.env.OPENSKY_CLIENT_SECRET);

        const response = await axios.post(TOKEN_URL, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        accessToken = response.data.access_token;
        // Set expiry slightly before actual expiry (expires_in is usually seconds)
        const expiresIn = response.data.expires_in; 
        tokenExpiry = Date.now() + (expiresIn * 1000) - 60000; // Buffer of 1 minute

        console.log('New OpenSky API token acquired.');
        return accessToken;
    } catch (error) {
        console.error('Error fetching OpenSky token:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function getToken() {
    if (!accessToken || Date.now() >= tokenExpiry) {
        return await fetchToken();
    }
    return accessToken;
}

module.exports = { getToken };
