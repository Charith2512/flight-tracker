const path = require('path');
const dotenv = require('dotenv');
try { require('node:dns').setDefaultResultOrder('ipv4first'); } catch (e) { } // Node 17+
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const express = require('express');
const cors = require('cors');
// const path = require('path'); // Already required
// const dotenv = require('dotenv'); // Already required
const flightRoutes = require('./routes');


const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api', flightRoutes);


// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
