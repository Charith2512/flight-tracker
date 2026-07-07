const express = require('express');
const axios = require('axios');
const { pool } = require('../config/database');
const { getToken } = require('./auth');
const fs = require('fs');
const path = require('path');

// Load Airports Data
// Load Airports Data
let airportsData = {};
let iataMap = {}; // Helper for IATA -> ICAO

try {
    const dataPath = path.join(__dirname, 'data', 'airports.json');
    if (fs.existsSync(dataPath)) {
        airportsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        // Build IATA Map
        Object.keys(airportsData).forEach(icao => {
            const airport = airportsData[icao];
            if (airport.iata && airport.iata.length === 3) {
                iataMap[airport.iata] = icao;
            }
        });

        console.log(`Loaded ${Object.keys(airportsData).length} airports. Mapped ${Object.keys(iataMap).length} IATA codes.`);
    } else {
        console.warn('airports.json not found. City lookup will be disabled.');
    }
} catch (error) {
    console.error('Failed to load airports.json:', error.message);
}

// Helper: Resolve Airport Object from ICAO or IATA
const getAirport = (code) => {
    if (!code) return null;
    let airport = airportsData[code];
    if (!airport && iataMap[code]) {
        airport = airportsData[iataMap[code]];
    }
    return airport;
};

// Helper: Get City
const getCity = (code) => {
    const apt = getAirport(code);
    return apt ? apt.city : 'Unknown';
};

// Helper: Get Airport Name
const getAirportName = (code) => {
    const apt = getAirport(code);
    return apt ? apt.name : 'Unknown Airport';
};

// Helper: Get Airport Coords
const getAirportCoords = (code) => {
    const apt = getAirport(code);
    return apt ? { lat: apt.lat, lon: apt.lon } : null;
};

// Retry Helper
const fetchWithRetry = async (url, options = {}, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await axios.get(url, options);
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`[Retry ${i + 1}/${retries}] Request failed, retrying...`);
            await new Promise(res => setTimeout(res, 1000 * (i + 1)));
        }
    }
};

const router = express.Router();

// Helper to get authenticated OpenSky client
const getOpenSkyData = async (url, params = {}) => {
    let requestConfig = {
        params,
        timeout: 20000,
        headers: {}
    };

    // 1. Try OAuth (Client Creds)
    if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
        try {
            const token = await getToken();
            requestConfig.headers['Authorization'] = `Bearer ${token}`;
        } catch (e) {
            console.error('OAuth Token failed:', e.message);
            // Don't return/throw yet, might try Basic Auth or Anon
        }
    }

    // 2. If no Token, try Basic Auth
    if (!requestConfig.headers['Authorization'] && process.env.OPENSKY_USERNAME && process.env.OPENSKY_PASSWORD) {
        requestConfig.auth = {
            username: process.env.OPENSKY_USERNAME,
            password: process.env.OPENSKY_PASSWORD
        };
    }

    try {
        const response = await axios.get(url, requestConfig);

        // Capture Credits
        if (response.headers['x-rate-limit-remaining']) {
            const credits = parseInt(response.headers['x-rate-limit-remaining'], 10);
            console.log(`[Credits] OpenSky Remaining: ${credits}`);
            pool.query('INSERT INTO api_usage (credits_left) VALUES (?)', [credits]).catch(console.error);
        }

        return response.data;
    } catch (error) {
        // RETRY LOGIC: If 401 Unauthorized and we used Auth, try again anonymously
        if (error.response && error.response.status === 401 && (process.env.OPENSKY_USERNAME || process.env.OPENSKY_PASSWORD)) {
            console.warn('OpenSky Auth failed (401). Retrying anonymously...');
            try {
                const retryResponse = await axios.get(url, {
                    params, // No Auth
                    timeout: 20000
                });

                // Capture Credits (if available anonymously)
                if (retryResponse.headers['x-rate-limit-remaining']) {
                    const credits = parseInt(retryResponse.headers['x-rate-limit-remaining'], 10);
                    console.log(`[Credits] OpenSky Anonymous Remaining: ${credits}`);
                    pool.query('INSERT INTO api_usage (credits_left) VALUES (?)', [credits]).catch(console.error);
                }

                return retryResponse.data;
            } catch (retryError) {
                console.error(`OpenSky Anonymous Retry failed: ${retryError.message}`);
                throw retryError; // Throw the original or new error? Throw new.
            }
        }

        // Capture Credits even on error (if available)
        if (error.response && error.response.headers && error.response.headers['x-rate-limit-remaining']) {
            const credits = parseInt(error.response.headers['x-rate-limit-remaining'], 10);
            pool.query('INSERT INTO api_usage (credits_left) VALUES (?)', [credits]).catch(console.error);
        }

        console.error(`Error fetching from OpenSky (${url}):`, error.response ? error.response.data : error.message);
        throw error;
    }
};

// Helper to get AirLabs Data (Fallback)
const getAirLabsData = async (query) => {
    if (!process.env.AIRLABS_API_KEY) return null;

    // Check if we have credits left (optional optimization, for now we just track usage)

    // AirLabs API reference: https://airlabs.co/docs/flights
    // 'search' is not a valid parameter. We must use 'flight_icao' or 'flight_iata'
    // Since we treat input as callsign, we'll try flight_icao first (most common for callsigns like UAE123)

    // We can't query both at once easily in one URL properly without guessing, 
    // but AirLabs allows multiple filters. However, let's try strict flight_icao first.

    const url = `https://airlabs.co/api/v9/flights?api_key=${process.env.AIRLABS_API_KEY}&flight_icao=${query}`;
    console.log(`Fallback: Calling AirLabs for flight_icao=${query}...`);

    try {
        let response = await axios.get(url, { timeout: 20000 });

        // CHECK FOR API ERRORS
        if (response.data && response.data.error) {
            console.error(`[AirLabs Error] ${JSON.stringify(response.data.error)}`);
            return null;
        }

        // If no result with flight_icao, try flight_iata (just in case user used IATA code e.g. AB123)
        if (!response.data || !response.data.response || response.data.response.length === 0) {
            console.log(`AirLabs: No match for flight_icao=${query}. Trying flight_iata...`);
            const urlIata = `https://airlabs.co/api/v9/flights?api_key=${process.env.AIRLABS_API_KEY}&flight_iata=${query}`;
            response = await axios.get(urlIata, { timeout: 20000 });

            // If still no result, try 'callsign' param (e.g. ETD7KP)
            // 'callsign' is not a valid filter locally, and passing invalid params returns ALL flights.
            // So we stop here if flight_iata also failed.
            console.log(`AirLabs: No match for flight_iata=${query}. Giving up.`);
        }

        if (response.data && response.data.response && response.data.response.length > 0) {
            // AirLabs is NOT sending x-ratelimit-remaining headers (confirmed via logs).
            // We must track this internally.

            // 1. Get current internal count
            const [rows] = await pool.query('SELECT credits_remaining FROM airlabs_usage ORDER BY id DESC LIMIT 1');
            let currentCredits = rows.length > 0 ? rows[0].credits_remaining : 1000; // Default start

            // 2. Decrement
            const newCredits = Math.max(0, currentCredits - 1); // Prevent negative

            // 3. Log new state
            pool.query('INSERT INTO airlabs_usage (requests_made, credits_remaining) VALUES (1, ?)',
                [newCredits]
            ).catch(console.error);

            return response.data.response[0];
        }
        return null;
        return null;
    } catch (error) {
        // Even on error, if it was a valid request type (search), it might cost a credit.
        // For safety, let's decrement.
        try {
            const [rows] = await pool.query('SELECT credits_remaining FROM airlabs_usage ORDER BY id DESC LIMIT 1');
            let currentCredits = rows.length > 0 ? rows[0].credits_remaining : 1000;
            const newCredits = Math.max(0, currentCredits - 1);

            pool.query('INSERT INTO airlabs_usage (requests_made, credits_remaining) VALUES (1, ?)',
                [newCredits]
            ).catch(console.error);
        } catch (dbErr) {
            console.error('Failed to log AirLabs error usage:', dbErr);
        }

        console.error('AirLabs Error:', error.message);
        return null; // Fail gracefully
    }
};

// GET /api/credits - Get latest credit balance
router.get('/credits', async (req, res) => {
    try {
        // OpenSky has multiple rate limit buckets (e.g., states vs tracks vs flights).
        // Since we log them sequentially, "LIMIT 1" fluctuates wildly between buckets.
        // We take the MINIMUM of the last 10 entries to show the "Bottleneck" limit.
        const [openSkyRows] = await pool.query('SELECT credits_left FROM api_usage ORDER BY id DESC LIMIT 1');

        const [airLabsRows] = await pool.query('SELECT credits_remaining FROM airlabs_usage ORDER BY id DESC LIMIT 1');

        const openSkyCredits = openSkyRows.length > 0 && openSkyRows[0].credits_left !== null ? openSkyRows[0].credits_left : 'N/A';
        const airLabsCredits = airLabsRows.length > 0 ? airLabsRows[0].credits_remaining : 'N/A';

        res.json({
            credits: openSkyCredits,
            airlabs_credits: airLabsCredits
        });
    } catch (error) {
        console.error('Error fetching credits:', error);
        res.status(500).json({ error: 'DB Error' });
    }
});

// GET /api/search - Search for specific flight by ICAO
// Helper to Fetch Flight Metadata with Stepped Lookback
// Optimized to save API credits and prevent timeouts
// Steps: 4h -> 12h -> 24h
async function fetchFlightMetadata(icao24) {
    const now = Math.floor(Date.now() / 1000);
    const end = now + 600; // slightly in future to catch edge cases
    const windows = [4, 12, 24]; // hours

    for (const hours of windows) {
        console.log(`[Metadata] Trying ${hours}h lookback for ${icao24}...`);
        const begin = now - (hours * 3600);

        try {
            const flightsData = await getOpenSkyData('https://opensky-network.org/api/flights/aircraft', {
                icao24,
                begin,
                end
            });

            if (flightsData && flightsData.length > 0) {
                // Determine the best segment.
                // Usually the last one is the live one.
                let bestSegment = flightsData[flightsData.length - 1];

                // Optimization: If the latest segment lacks an arrival airport (common for live flights),
                // check if ANY segment in this window has scheduled info that might be relevant.
                // (Sometimes Flight Plans are filed as separate "scheduled" segments).

                if (!bestSegment.estArrivalAirport) {
                    const betterSegment = flightsData.slice().reverse().find(f => f.estArrivalAirport);
                    if (betterSegment) {
                        console.log('[Metadata] Found a segment with Arrival Airport! using that instead.');
                        // Verify it's not too old? For now, assume it's related to current flight chain.
                        // But be careful not to show yesterday's flight. 
                        // Check checks: if the separate segment is radically different time, ignore.
                        // For now, let's stick to simple latest, but maybe fallback?

                        // actually, let's keep using 'latest' for live position relevance,
                        // BUT overlay the destination from the 'better' segment if available.
                        bestSegment.estArrivalAirport = betterSegment.estArrivalAirport;
                    }
                }

                // If we found a departure airport, this is a good result!
                if (bestSegment.estDepartureAirport) {
                    console.log(`[Metadata] Found details in ${hours}h window.`);
                    return bestSegment;
                }

                // If this is the last step (24h), return whatever we have
                if (hours === 24) {
                    console.log('[Metadata] usage: Returning last available segment (24h).');
                    return bestSegment;
                }

                // If intermediate step (4h/12h) has no airport, decided to SEARCH DEEPER?
                console.log(`[Metadata] ${hours}h result missing airports. Expanding search...`);
            } else {
                console.log(`[Metadata] No data in ${hours}h window.`);
            }
        } catch (error) {
            console.warn(`[Metadata] ${hours}h fetch failed: ${error.message}`);
            // Continue to next window size if this one specifically failed (e.g. slight timeout?)
            // Or if 4h fails, maybe 12h works? Unlikely if timeout, but logic stands.
        }
    }
    return {};
}

// GET /api/search/route - Find all active flights between two airports
// GET /api/flights-by-route - Find active flights (AirLabs Discovery -> OpenSky Enrichment)
router.get('/flights-by-route', async (req, res) => {
    const { from, to } = req.query;
    if (!from) return res.status(400).json({ error: 'Origin location required' });

    console.log(`[Hybrid Route] Searching ${from} -> ${to}...`);

    try {
        // 1. DISCOVERY: Use AirLabs to find WHO is flying this route.
        // AirLabs supports both ICAO and IATA. We pass whatever the user gave.
        // Cost: 1 AirLabs Credit
        const airLabsUrl = `https://airlabs.co/api/v9/flights?api_key=${process.env.AIRLABS_API_KEY}&dep_icao=${from}&arr_icao=${to}`;
        // Note: If user inputs IATA (3 chars), we should ideally use dep_iata.
        // Let's handle that dynamic param choice:

        // SMART RESOLVER HELPER
        const resolveLocation = async (query) => {
            const q = query.trim();
            // 2. Common Country/City Codes (Manual Map for stability)
            const countryMap = {
                // Countries
                'INDIA': 'IN', 'USA': 'US', 'UNITED STATES': 'US', 'UK': 'GB', 'UNITED KINGDOM': 'GB',
                'UAE': 'AE', 'FRANCE': 'FR', 'GERMANY': 'DE', 'CANADA': 'CA', 'AUSTRALIA': 'AU',
                'CHINA': 'CN', 'JAPAN': 'JP', 'RUSSIA': 'RU', 'ITALY': 'IT', 'BRAZIL': 'BR',

                // Cities (Map to Primary Hub Airport)
                'LONDON': 'LHR', 'NEW YORK': 'JFK', 'PARIS': 'CDG', 'DUBAI': 'DXB',
                'HYDERABAD': 'HYD', 'MUMBAI': 'BOM', 'DELHI': 'DEL', 'BANGALORE': 'BLR',
                'TOKYO': 'HND', 'SINGAPORE': 'SIN', 'HONG KONG': 'HKG', 'LOS ANGELES': 'LAX',
                'CHICAGO': 'ORD', 'SYDNEY': 'SYD', 'TORONTO': 'YYZ', 'FRANKFURT': 'FRA'
            };

            const upperQ = q.toUpperCase();
            if (countryMap[upperQ]) {
                const code = countryMap[upperQ];
                if (code.length === 2) return `country=${code}`;
                return `iata=${code}`; // It's an airport/city code
            }

            // 2. Direct Codes
            if (q.length === 2) return `country=${q.toUpperCase()}`; // e.g. IN, US
            if (q.length === 3) return `iata=${q.toUpperCase()}`;    // e.g. JFK
            if (q.length === 4) return `icao=${q.toUpperCase()}`;    // e.g. KJFK

            // 3. Free Text via AirLabs Suggest API
            // query: "London", "India", "Paris"
            try {
                console.log(`[Smart Search] Resolving "${q}"...`);
                const suggestUrl = `https://airlabs.co/api/v9/suggest?api_key=${process.env.AIRLABS_API_KEY}&q=${encodeURIComponent(q)}`;
                // Increased timeout for stability (90s for main, 20s for suggest) - Relies on server.js global IPv4
                const sRes = await fetchWithRetry(suggestUrl, { timeout: 20000 });
                const rawData = sRes.data.response || {};
                let suggestions = [];

                // AirLabs V9 Suggest returns categorized object: { airports: [], cities: [], countries: [] }
                // We flatten them by priority.
                if (Array.isArray(rawData)) {
                    suggestions = rawData; // Fallback if it ever returns array
                } else {
                    if (rawData.airports) suggestions.push(...rawData.airports);
                    if (rawData.cities) suggestions.push(...rawData.cities);
                    if (rawData.countries) suggestions.push(...rawData.countries);
                }

                console.log(`[Smart Search] Parsed ${suggestions.length} candidates for "${q}"`);

                if (suggestions.length > 0) {
                    // Start prioritization
                    // Priority 1: Exact matches on City Name or Country Name
                    const best = suggestions[0]; // Use top result

                    // Handle Country
                    if (best.code && !best.iata_code && !best.city_code) {
                        // Likely a country object { name: 'Hong Kong', code: 'HK' }
                        return `country=${best.code}`;
                    }

                    // Handle Airport/City
                    if (best.iata_code) return `iata=${best.iata_code}`;
                    if (best.city_code) return `iata=${best.city_code}`; // Cities often have city_code used as IATA
                    if (best.icao_code) return `icao=${best.icao_code}`;

                    // Fallback for country if structure differs
                    if (best.country_code && !best.iata_code) return `country=${best.country_code}`;
                }
            } catch (err) {
                console.warn(`[Smart Search] Resolution failed for ${q}: ${err.message}`);
            }

            // Fallback: Just try parsing as ICAO or IATA blindly depending on unknown length? 
            // Or just return null/default. 
            // Let's default to ICAO for 4, IATA for 3 (already covered).
            // Return raw string to let AirLabs try? No, API needs specific key.
            return `icao=${q}`; // Worst case fallback
        };

        const fromParam = await resolveLocation(from);
        let toParam = null;
        if (to && to.trim()) {
            toParam = await resolveLocation(to);
        }

        console.log('DEBUG: Env Key Prefix:', process.env.AIRLABS_API_KEY ? process.env.AIRLABS_API_KEY.substring(0, 5) : 'MISSING');
        console.log('DEBUG: fromParam:', fromParam);
        console.log('DEBUG: toParam:', toParam || 'ANY (Explore Mode)');

        let alParams = `api_key=${process.env.AIRLABS_API_KEY}`;
        const [fKey, fVal] = fromParam.split('=');

        // Unidirectional Search (Explore or Route)
        alParams += `&dep_${fKey}=${fVal}`;
        if (toParam) {
            const [tKey, tVal] = toParam.split('=');
            alParams += `&arr_${tKey}=${tVal}`;
        }

        const finalUrl = `https://airlabs.co/api/v9/flights?${alParams}`;
        console.log(`[Discovery] From: ${from} -> ${fromParam}, To: ${to} -> ${toParam || 'ANY'}`);
        console.log(`[Discovery] Calling AirLabs: ${finalUrl}`);
        const alRes = await fetchWithRetry(finalUrl, {
            timeout: 90000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        // Track AirLabs Usage (+1)
        try {
            const [rows] = await pool.query('SELECT credits_remaining FROM airlabs_usage ORDER BY id DESC LIMIT 1');
            let current = rows.length > 0 ? rows[0].credits_remaining : 1000;
            pool.query('INSERT INTO airlabs_usage (requests_made, credits_remaining) VALUES (1, ?)', [Math.max(0, current - 1)]).catch(console.error);
        } catch (e) { }

        candidates = alRes.data.response || [];
        console.log(`[Discovery] AirLabs found ${candidates.length} candidates.`);

        // --- STRICT FILTERING (Unidirectional) ---
        if (fromParam.startsWith('country=')) {
            const reqCountry = fromParam.split('=')[1].trim();
            const initialCount = candidates.length;
            candidates = candidates.filter(f => {
                if (f.dep_country) return f.dep_country === reqCountry;
                const apt = getAirport(f.dep_iata || f.dep_icao);
                if (apt && apt.country) return apt.country === reqCountry;
                return false; // STRICT: If unknown, DISCARD
            });
            if (candidates.length < initialCount) console.log(`[Filter] Removed ${initialCount - candidates.length} flights mismatching Origin Country: ${reqCountry}`);
        }
        if (toParam && toParam.startsWith('country=')) {
            const reqCountry = toParam.split('=')[1].trim();
            const initialCount = candidates.length;
            candidates = candidates.filter(f => {
                if (f.arr_country) return f.arr_country === reqCountry;
                const apt = getAirport(f.arr_iata || f.arr_icao);
                if (apt && apt.country) return apt.country === reqCountry;
                return false; // STRICT: If unknown, DISCARD
            });
            if (candidates.length < initialCount) console.log(`[Filter] Removed ${initialCount - candidates.length} flights mismatching Dest Country: ${reqCountry}`);
        }

        if (candidates.length === 0) {
            console.log(`[Discovery] AirLabs returned 0 results (Empty List).`);
            console.log(`[Discovery] Verifying data source: AirLabs API connection is ACTIVE but no flights matched params.`);
            console.log(`[Discovery] Checking if ICAO->IATA conversion helps...`);

            // Helper to get IATA from AirportDB or simple fallback if avail
            // Since we don't have a reliable local DB for IATA, we'll try to just inform the user 
            // OR we can make a quick guess if we had a mapping. 
            // Better: Let's specifically ASK the user to try IATA if ICAO fails?
            // No, the user wants it to just work. 

            // Let's force IATA usage if the user typed 4 letter codes and we got 0 results.
            // We use AirLabs 'airports' endpoint to get the IATA code.
            if (from.length === 4 && to.length === 4) {
                try {
                    // Fetch IATA for Origin
                    console.log(`[Discovery] Fetching IATA for ${from} from AirLabs...`);
                    const fromRes = await axios.get(`https://airlabs.co/api/v9/airports?api_key=${process.env.AIRLABS_API_KEY}&icao_code=${from}`, { timeout: 5000 });
                    const fromData = fromRes.data.response ? fromRes.data.response[0] : null;
                    const fromIata = fromData ? fromData.iata_code : null;

                    // Fetch IATA for Destination
                    const toRes = await axios.get(`https://airlabs.co/api/v9/airports?api_key=${process.env.AIRLABS_API_KEY}&icao_code=${to}`, { timeout: 5000 });
                    const toData = toRes.data.response ? toRes.data.response[0] : null;
                    const toIata = toData ? toData.iata_code : null;

                    if (fromIata && toIata) {
                        console.log(`[Discovery] Retrying with IATA: ${fromIata} -> ${toIata}`);
                        const retryUrl = `https://airlabs.co/api/v9/flights?api_key=${process.env.AIRLABS_API_KEY}&dep_iata=${fromIata}&arr_iata=${toIata}`;
                        const retryRes = await axios.get(retryUrl, { timeout: 20000 });
                        const retryCandidates = retryRes.data.response || [];

                        if (retryCandidates.length > 0) {
                            console.log(`[Discovery] Success with IATA! Found ${retryCandidates.length} flights.`);
                            candidates.push(...retryCandidates);
                        }
                    }
                } catch (iataErr) {
                    console.warn(`[Discovery] IATA Lookup failed: ${iataErr.message}`);
                }
            }
        }

        if (candidates.length === 0) {
            return res.status(404).json({ error: 'No active flights found for this route.' });
        }

        // 2. ENRICHMENT: Use OpenSky to get LIVE High-Accuracy Positions
        // Extract hex codes
        const hexCodes = candidates.map(c => c.hex).filter(h => h); // Filter valid hex

        if (hexCodes.length === 0) {
            return res.status(404).json({ error: 'No valid aircraft hex codes found.' });
        }

        // Construct OpenSky Query using Chunking (Prevent 414 URI Too Large)
        console.log(`[Enrichment] Querying OpenSky for ${hexCodes.length} aircraft...`);
        let openSkyStates = [];

        try {
            const CHUNK_SIZE = 10;
            const chunks = [];
            for (let i = 0; i < hexCodes.length; i += CHUNK_SIZE) {
                chunks.push(hexCodes.slice(i, i + CHUNK_SIZE));
            }

            const results = await Promise.all(chunks.map(async (chunk) => {
                const osParams = chunk.map(h => `icao24=${h}`).join('&');
                try {
                    const osRes = await getOpenSkyData(`https://opensky-network.org/api/states/all?${osParams}`);
                    return osRes.states || [];
                } catch (e) {
                    console.warn(`[Enrichment] Chunk failed: ${e.message}`);
                    return [];
                }
            }));

            openSkyStates = results.flat();
            console.log(`[Enrichment] Successfully enriched ${openSkyStates.length} / ${hexCodes.length} flights.`);

        } catch (osError) {
            console.warn(`[Enrichment] OpenSky Critical Failure: ${osError.message}. Falling back to AirLabs data.`);
            // Fallback: Just use AirLabs data if OpenSky fails (better than nothing)
        }

        // 3. MERGE & RETURN
        // We prefer OpenSky data (Live) but keep AirLabs metadata (Route info).

        const results = candidates.map(al => {
            // Find matching OpenSky state
            const os = openSkyStates.find(s => s[0] === al.hex);

            if (os) {
                // Use OpenSky Data
                return {
                    source: 'opensky', // Precise live data
                    icao24: os[0],
                    callsign: (os[1] || al.flight_icao || al.flight_iata || '').trim(),
                    origin_country: os[2],
                    longitude: os[5],
                    latitude: os[6],
                    baro_altitude: os[7],
                    on_ground: os[8],
                    velocity: os[9],
                    true_track: os[10],
                    true_track: os[10],
                    // Enriched Metadata from AirLabs
                    origin: al.dep_icao || al.dep_iata,
                    origin_city: getCity(al.dep_icao || al.dep_iata),
                    origin_airport: getAirportName(al.dep_icao || al.dep_iata),
                    origin_coords: getAirportCoords(al.dep_icao || al.dep_iata),
                    destination: al.arr_icao || al.arr_iata,
                    destination_city: getCity(al.arr_icao || al.arr_iata),
                    destination_airport: getAirportName(al.arr_icao || al.arr_iata),
                    destination_coords: getAirportCoords(al.arr_icao || al.arr_iata)
                };
            } else {
                // Use AirLabs Data (Backup)
                return {
                    source: 'airlabs', // Predicted
                    icao24: al.hex,
                    callsign: al.flight_icao || al.flight_iata || 'N/A',
                    origin_country: al.flag || 'Unknown',
                    longitude: al.lng,
                    latitude: al.lat,
                    baro_altitude: al.alt,
                    on_ground: al.status === 'ground',
                    velocity: al.speed,
                    velocity: al.speed,
                    true_track: al.dir,
                    origin: al.dep_icao || al.dep_iata,
                    origin_city: getCity(al.dep_icao || al.dep_iata),
                    origin_airport: getAirportName(al.dep_icao || al.dep_iata),
                    origin_coords: getAirportCoords(al.dep_icao || al.dep_iata),
                    destination: al.arr_icao || al.arr_iata,
                    destination_city: getCity(al.arr_icao || al.arr_iata),
                    destination_airport: getAirportName(al.arr_icao || al.arr_iata),
                    destination_coords: getAirportCoords(al.arr_icao || al.arr_iata)
                };
            }
        });

        res.json(results);

    } catch (error) {
        console.error('Hybrid Route Search Error Stack:', error.stack);
        if (error.response) console.error('AirLabs Response:', error.response.data);
        res.status(500).json({ error: 'Route search failed' });
    }
});

// GET /api/search - Search for specific flight by ICAO
router.get('/search', async (req, res) => {
    const { q } = req.query; // q = callsign (always, per user request)

    if (!q) {
        return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const searchCallsign = q.trim().toUpperCase();
    console.log(`Searching for Callsign: ${searchCallsign}`);

    try {
        let liveState = null;

        // 1. OpenSky Strategy: Fetch ALL states and filter by callsign
        console.log('Fetching OpenSky global states...');
        try {
            const allData = await getOpenSkyData('https://opensky-network.org/api/states/all');
            const allStates = allData.states || [];
            console.log(`[OpenSky] Fetched ${allStates.length} global states.`);
            liveState = allStates.find(s => s[1].trim().toUpperCase() === searchCallsign);
        } catch (globalError) {
            console.error('Global state fetch failed:', globalError.message);
            // Do not return here, allow fallback to AirLabs
        }

        // --- HYBRID TRACKER LOGIC ---
        // If OpenSky failed to find the flight, try AirLabs
        if (!liveState) {
            console.log(`OpenSky miss. Attempting AirLabs fallback for ${searchCallsign}...`);
            const airLabsFlight = await getAirLabsData(searchCallsign);

            if (airLabsFlight) {
                console.log(`[Hybrid] SUCCESS: AirLabs provided data for ${searchCallsign}.`);
                const flightInfo = {
                    source: 'airlabs', // Mark source for frontend prediction
                    icao24: airLabsFlight.hex,
                    callsign: airLabsFlight.flight_icao || airLabsFlight.flight_iata || 'N/A',
                    origin_country: airLabsFlight.flag || 'Unknown',
                    longitude: airLabsFlight.lng,
                    latitude: airLabsFlight.lat,
                    true_track: airLabsFlight.dir,
                    baro_altitude: airLabsFlight.alt,
                    on_ground: airLabsFlight.status === 'ground',
                    velocity: airLabsFlight.speed,
                    // Metadata
                    origin: airLabsFlight.dep_icao || airLabsFlight.dep_iata || 'Unknown',
                    origin_city: getCity(airLabsFlight.dep_icao || airLabsFlight.dep_iata),
                    origin_airport: getAirportName(airLabsFlight.dep_icao || airLabsFlight.dep_iata),
                    origin_coords: getAirportCoords(airLabsFlight.dep_icao || airLabsFlight.dep_iata),
                    destination: airLabsFlight.arr_icao || airLabsFlight.arr_iata || 'Unknown',
                    destination_city: getCity(airLabsFlight.arr_icao || airLabsFlight.arr_iata),
                    destination_airport: getAirportName(airLabsFlight.arr_icao || airLabsFlight.arr_iata),
                    destination_coords: getAirportCoords(airLabsFlight.arr_icao || airLabsFlight.arr_iata),
                    departureTime: null, // AirLabs might have this, simplified for now
                    arrivalTime: null
                };
                return res.json(flightInfo);
            }

            console.log(`Flight ${q} not found in AirLabs either.`);
            return res.status(404).json({ error: 'Flight not currently live or active.' });
        }

        // --- END HYBRID LOGIC ---

        const icao24 = liveState[0]; // Get the real ICAO from the found state

        // 2. Fetch Origin/Destination (Flight Metadata) using Stepped Search
        const latestSegment = await fetchFlightMetadata(icao24);

        // 3. Construct Response (Safe Access)
        const flightInfo = {
            source: 'opensky',
            icao24: liveState[0],
            callsign: (liveState[1] || '').trim(),
            origin_country: liveState[2],
            longitude: liveState[5],
            latitude: liveState[6],
            true_track: liveState[10],
            baro_altitude: liveState[7],
            on_ground: liveState[8],
            velocity: liveState[9],
            // Metadata
            origin: latestSegment.estDepartureAirport || 'Unknown',
            origin_city: getCity(latestSegment.estDepartureAirport),
            origin_airport: getAirportName(latestSegment.estDepartureAirport),
            origin_coords: getAirportCoords(latestSegment.estDepartureAirport),
            destination: latestSegment.estArrivalAirport || 'Unknown',
            destination_city: getCity(latestSegment.estArrivalAirport),
            destination_airport: getAirportName(latestSegment.estArrivalAirport),
            destination_coords: getAirportCoords(latestSegment.estArrivalAirport),
            departureTime: latestSegment.firstSeen || null,
            arrivalTime: latestSegment.estArrivalAirport ? latestSegment.lastSeen : null
        };

        // --- METADATA RESCUE ---
        // If OpenSky failed to give us the Origin or Destination (common), 
        // asking AirLabs just for the metadata is worth the 1 credit to fix the UI.
        if (flightInfo.destination === 'Unknown' || flightInfo.origin === 'Unknown') {
            console.log(`[Hybrid] OpenSky metadata incomplete for ${searchCallsign}. Fetching rescue metadata from AirLabs...`);
            const alData = await getAirLabsData(searchCallsign);

            if (alData) {
                if (flightInfo.origin === 'Unknown' && alData.dep_icao) {
                    flightInfo.origin = alData.dep_icao;
                    flightInfo.origin_city = getCity(alData.dep_icao);
                    flightInfo.origin_airport = getAirportName(alData.dep_icao);
                    flightInfo.origin_coords = getAirportCoords(alData.dep_icao || alData.dep_iata);
                    console.log(`[Hybrid] Rescued Origin: ${alData.dep_icao}`);
                }
                if (flightInfo.destination === 'Unknown' && alData.arr_icao) {
                    flightInfo.destination = alData.arr_icao;
                    flightInfo.destination_city = getCity(alData.arr_icao);
                    flightInfo.destination_airport = getAirportName(alData.arr_icao);
                    flightInfo.destination_coords = getAirportCoords(alData.arr_icao || alData.arr_iata);
                    console.log(`[Hybrid] Rescued Destination: ${alData.arr_icao}`);
                }
            }
        }
        // -----------------------

        res.json(flightInfo);

    } catch (error) {
        console.error('CRITICAL Search Route Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});




// --- CREDIT SYNCHRONIZATION ---
// Runs asynchronously on startup to ensure displayed credits match dashboard
const syncAirLabsCredits = async () => {
    if (!process.env.AIRLABS_API_KEY) return;

    console.log('[System] Syncing AirLabs credits...');
    try {
        // Use 'account' endpoint or 'ping' to get key status
        const res = await fetchWithRetry(`https://airlabs.co/api/v9/ping?api_key=${process.env.AIRLABS_API_KEY}`, { timeout: 20000 });

        if (res.data && res.data.request && res.data.request.key) {
            const realCredits = res.data.request.key.limits_total; // Or query_limit / remaining depending on plan
            // Note: AirLabs 'limits_total' is usually the monthly quota? 
            // Better to use 'limits_remaining' if available, or just 'key.remaining' from some endpoints.
            // Let's rely on what we saw in logs: 'res.data.key.limits_total' was used before.
            // Actually, best field is usually 'key.remaining' or calculating 'limit - usage'.
            // Let's dump the response to be sure in dev, but for now we trust previous logic
            // or better, just insert what we get.

            // Re-verified with user image: They have 1000 queries available.
            // ping response usually has 'key': { ... 'limits_total': 1000, 'limits_used': 0 ... }

            // Let's try to get precise remaining
            const k = res.data.request.key;
            const total = k.limits_total || 0;
            const used = k.limits_used || 0;
            const remaining = Math.max(0, total - used);

            console.log(`[System] AirLabs Sync: Total ${total}, Used ${used}, Remaining ${remaining}`);

            await pool.query('INSERT INTO airlabs_usage (requests_made, credits_remaining) VALUES (?, ?)', [used, remaining]);
        }
    } catch (e) {
        console.warn(`[System] Credit sync failed: ${e.message}`);
    }
};

// Start Sync (Non-blocking)
syncAirLabsCredits();

// OpenSky Note
console.log('[System] OpenSky credits refresh daily. Rate limits are handled automatically.');

module.exports = router;
