// Map Setup
let map;
const API_BASE = window.location.origin; // Dynamically resolve base URL in prod/dev

// State
let selectedFlight = null;
let flightMarker = null;
let activeMarkers = [];

// SVG Plane Icon (Neon Style)
const planeSvg = `
<svg viewBox="0 0 24 24" class="plane-svg" style="width: 100%; height: 100%; fill: #fbbf24; filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.8));">
    <path d="M21,16V14L13,9V3.5A1.5,1.5 0 0,0 11.5,2A1.5,1.5 0 0,0 10,3.5V9L2,14V16L10,13.5V19L8,20.5V22L11.5,21L15,20.5V22L13,19V13.5L21,16Z" />
</svg>
`;

// Create Custom DivIcon
const getPlaneIcon = (rotation) => {
    return L.divIcon({
        className: 'plane-marker-icon', // CSS handles transition
        html: `<div style="transform: rotate(${rotation}deg); width: 32px; height: 32px;">${planeSvg}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
};

// UI Elements Container
const els = {};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    console.log('Aero-Dark Flight Tracker Loaded');

    // 1. Initialize Map
    // Tile Layers
    const darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });

    const lightTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });

    // Init Map with Dark by default (logic will check storage later)
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        layers: [darkTiles]
    }).setView([20, 0], 2);

    // Make available globally for theme switcher
    window.darkTiles = darkTiles;
    window.lightTiles = lightTiles;

    // Add Zoom Control
    L.control.zoom({ position: 'topright' }).addTo(map);

    // 2. Cache DOM Elements
    els.searchBtn = document.getElementById('search-btn');
    els.inputFlight = document.getElementById('search-input');
    els.inputFrom = document.getElementById('search-from');
    els.inputTo = document.getElementById('search-to');
    els.groupFlight = document.getElementById('input-group-flight');
    els.groupRoute = document.getElementById('input-group-route');
    els.groupExplore = document.getElementById('input-group-explore');

    els.inputExplore = document.getElementById('search-explore');
    els.infoPanel = document.getElementById('flight-info');

    // Theme
    els.themeToggle = document.getElementById('theme-toggle');
    els.themeIcon = document.getElementById('theme-icon');

    // Info Panel Fields
    els.infoCallsign = document.getElementById('info-callsign');
    els.infoOriginCity = document.getElementById('info-origin-city');
    els.infoOriginAirport = document.getElementById('info-origin-airport');
    els.infoDestCity = document.getElementById('info-dest-city');
    els.infoDestAirport = document.getElementById('info-dest-airport');
    els.infoAlt = document.getElementById('info-alt');
    els.infoSpeed = document.getElementById('info-speed');
    els.infoCountry = document.getElementById('info-country');
    els.infoSource = document.getElementById('info-source');

    // Progress Bar Elements
    els.progressFill = document.getElementById('flight-progress-fill');
    els.progressPlane = document.getElementById('flight-progress-plane');

    // 3. Setup Interactions
    setupSearchLogic();
    setupMapInteractions();
    setupThemeLogic();

    // 4. Initial Credits Check
    updateCredits();
    setInterval(updateCredits, 60000);
});

// Notification Helper
function showNotification(message, type = 'normal') {
    let toast = document.getElementById('notification-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'notification-toast';
        toast.className = 'notification-toast';
        document.body.appendChild(toast);
    }

    // Icon based on type
    const icon = type === 'error' ? '⚠️' : 'ℹ️';

    toast.innerHTML = `<span class="notification-icon">${icon}</span> ${message}`;
    toast.className = `notification-toast ${type}`;

    // Trigger Reflow
    void toast.offsetWidth;

    toast.classList.add('active');

    // Hide after 4s
    setTimeout(() => {
        toast.classList.remove('active');
    }, 4000);
}

// Setup Interactions
function setupSearchLogic() {
    // Mode Toggle
    const radios = document.getElementsByName('searchMode');
    const updateSearchUI = () => {
        const mode = document.querySelector('input[name="searchMode"]:checked').value;
        if (mode === 'flight') {
            els.groupFlight.classList.remove('hidden');
            els.groupRoute.classList.add('hidden');
            els.groupExplore.classList.add('hidden');
        } else if (mode === 'route') {
            els.groupFlight.classList.add('hidden');
            els.groupRoute.classList.remove('hidden');
            els.groupExplore.classList.add('hidden');
        } else {
            // Explore
            els.groupFlight.classList.add('hidden');
            els.groupRoute.classList.add('hidden');
            els.groupExplore.classList.remove('hidden');
        }
    };
    radios.forEach(r => r.addEventListener('change', updateSearchUI));
    updateSearchUI();

    // Modal helpers
    const modal = document.getElementById('error-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMsg = document.getElementById('modal-message');
    const modalBtn = document.getElementById('modal-close-btn');

    window.showModal = (msg, title = 'Notice') => {
        if (!modal) return alert(msg); // Fallback
        modalTitle.textContent = title;
        modalMsg.textContent = msg;
        modal.classList.remove('hidden');
        requestAnimationFrame(() => modal.classList.add('active')); // Fade in
    };

    const hideModal = () => {
        if (!modal) return;
        modal.classList.remove('active');
        setTimeout(() => modal.classList.add('hidden'), 300);
    };

    if (modalBtn) modalBtn.addEventListener('click', hideModal);

    // Swap Route Inputs

    // Swap Route Inputs
    const swapBtn = document.getElementById('swap-route-btn');
    if (swapBtn) {
        swapBtn.addEventListener('click', () => {
            const temp = els.inputFrom.value;
            els.inputFrom.value = els.inputTo.value;
            els.inputTo.value = temp;

            // Optional: Animate rotation
            swapBtn.style.transform = 'rotate(180deg)';
            setTimeout(() => swapBtn.style.transform = 'rotate(0deg)', 300);
        });
    }

    // Search Button
    els.searchBtn.addEventListener('click', () => {
        const mode = document.querySelector('input[name="searchMode"]:checked').value;
        if (mode === 'flight') {
            const query = els.inputFlight.value.trim();
            if (query) searchFlight(query);
            else showNotification('Please enter a flight number.', 'error');
        } else if (mode === 'route') {
            const from = els.inputFrom.value.trim();
            const to = els.inputTo.value.trim();
            if (from && to) searchRoute(from, to, false); // false = not explore
            else showModal('Please enter both From and To locations.', 'Missing Input');
        } else {
            // Explore
            const from = els.inputExplore.value.trim();
            if (from) searchRoute(from, '', true); // true = is explore
            else showModal('Please enter a location to explore from.', 'Missing Input');
        }
    });

    // Enter Key
    [els.inputFlight, els.inputFrom, els.inputTo, els.inputExplore].forEach(input => {
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') els.searchBtn.click();
            });
        }
    });
}

function setupMapInteractions() {
    // Click map to close card
    map.on('click', () => {
        els.infoPanel.classList.remove('active');
    });
}

// --- CORE LOGIC ---

async function searchFlight(query) {
    clearMap(); // Clear immediately
    setLoading(true);
    // Reset UI Logic
    els.infoPanel.classList.remove('active');
    document.querySelectorAll('.leaflet-popup').forEach(p => p.remove());

    try {
        const response = await fetch(`${API_BASE}/api/search?q=${query}`);
        if (!response.ok) throw new Error((await response.json()).error || 'Flight not found');

        const flight = await response.json();
        renderFlight(flight);
    } catch (error) {
        showModal(error.message, 'Flight Not Found');
    } finally {
        setLoading(false);
    }
}

async function searchRoute(from, to, isExplore = false) {
    clearMap(); // Clear immediately
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 95000); // 95s client timeout

    try {
        const response = await fetch(`${API_BASE}/api/flights-by-route?from=${from}&to=${to}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error((await response.json()).error || 'No active flights found.');

        const flights = await response.json();

        if (flights.length === 0) showModal('No live flights found for this route.', 'No Active Flights');
        else renderMultipleFlights(flights);

    } catch (error) {
        if (error.name === 'AbortError') {
            showModal('Request timed out. API is busy, try specific airports (e.g., JFK -> LHR).', 'Timeout');
        } else {
            showModal(error.message, 'Route Error');
        }
    } finally {
        setLoading(false);
    }
}

function renderFlightData(flight) {
    // 1. Update Details Panel
    els.infoCallsign.textContent = flight.callsign || flight.icao24 || 'UNKNOWN';

    // Origin
    els.infoOriginCity.textContent = flight.origin_city || 'Unknown City';
    els.infoOriginAirport.textContent = flight.origin_airport || flight.origin || '---';

    // Dest
    els.infoDestCity.textContent = flight.destination_city || 'Unknown City';
    els.infoDestAirport.textContent = flight.destination_airport || flight.destination || '---';

    // Stats
    els.infoAlt.textContent = flight.baro_altitude || '-';
    els.infoSpeed.textContent = Math.round(flight.velocity || 0);
    els.infoCountry.textContent = flight.origin_country || '-';
    if (els.infoSource) {
        els.infoSource.textContent = flight.source === 'airlabs' ? 'AirLabs (Predicted)' : 'OpenSky (Live)';
    }

    // PROGRESS BAR LOGIC
    if (flight.origin_coords && flight.destination_coords) {
        const totalDist = haversine(
            flight.origin_coords.lat, flight.origin_coords.lon,
            flight.destination_coords.lat, flight.destination_coords.lon
        );

        const traveledDist = haversine(
            flight.origin_coords.lat, flight.origin_coords.lon,
            flight.latitude, flight.longitude
        );

        let percent = (traveledDist / totalDist) * 100;
        percent = Math.max(0, Math.min(100, percent)); // Clamp 0-100

        els.progressFill.style.width = `${percent}%`;
        els.progressPlane.style.left = `${percent}%`;
    } else {
        // Fallback if no coords
        els.progressFill.style.width = '0%';
        els.progressPlane.style.left = '0%';
    }
}

function renderFlight(flight) {
    // 1. Update Data
    renderFlightData(flight);

    // 2. Show Panel
    els.infoPanel.classList.add('active');

    // 3. Add Marker
    if (flightMarker) map.removeLayer(flightMarker);
    const icon = getPlaneIcon(flight.true_track);
    flightMarker = L.marker([flight.latitude, flight.longitude], { icon: icon })
        .addTo(map)
        .bindPopup(flight.callsign);

    // Re-open details on click
    flightMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e); // Prevent map click from closing it
        renderFlightData(flight); // Refresh data
        els.infoPanel.classList.add('active');
    });

    // 4. Center Map
    // Pan smoothly without jarring zoom out if already zoomed in closely
    map.flyTo([flight.latitude, flight.longitude], Math.max(map.getZoom(), 6), {
        animate: true,
        duration: 1.5
    });
}

function renderMultipleFlights(flights) {
    const latlngs = [];
    flights.forEach(flight => {
        // Validation: Ensure coords exist
        if (!flight.latitude || !flight.longitude) return;

        const icon = getPlaneIcon(flight.true_track);
        const marker = L.marker([flight.latitude, flight.longitude], { icon: icon })
            .addTo(map)
            .bindPopup(`<strong>${flight.callsign}</strong>`); // Keep popup minimal

        // Click a fleet marker to focus
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e); // Prevent map click closing panel
            renderFlight(flight);
        });

        activeMarkers.push(marker);
        latlngs.push([flight.latitude, flight.longitude]);
    });

    if (latlngs.length > 0) map.fitBounds(latlngs, { padding: [100, 100] });
    els.infoPanel.classList.remove('active'); // Hide panel until specific selection
}


function setupThemeLogic() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);

    els.themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    // Icon
    els.themeIcon.textContent = theme === 'light' ? '🌙' : '☀️';

    // Map Tiles
    if (theme === 'light') {
        if (window.darkTiles) map.removeLayer(window.darkTiles);
        if (window.lightTiles) map.addLayer(window.lightTiles);
    } else {
        if (window.lightTiles) map.removeLayer(window.lightTiles);
        if (window.darkTiles) map.addLayer(window.darkTiles);
    }
}

// Utilities
function clearMap() {
    if (flightMarker) map.removeLayer(flightMarker);
    activeMarkers.forEach(m => map.removeLayer(m));
    activeMarkers = [];
    flightMarker = null;
}

function setLoading(isLoading) {
    els.searchBtn.textContent = isLoading ? '...' : 'Track Flight';
    els.searchBtn.disabled = isLoading;
}

async function updateCredits() {
    try {
        const res = await fetch(`${API_BASE}/api/credits`);
        const data = await res.json();
        const text = `OpenSky: ${data.credits || 'N/A'} | AirLabs: ${data.airlabs_credits || 'N/A'}`;
        document.getElementById('credits-count').textContent = text;
    } catch (e) {
        document.getElementById('credits-count').textContent = 'Server Unavailable';
    }
}
// Haversine Formula (Distance in Meters)
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}
