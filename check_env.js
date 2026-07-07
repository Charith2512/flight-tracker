const path = require('path');
const dotenv = require('dotenv');

// Mimic server.js path logic
dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log("Checking Environment Variables...");
const key = process.env.AIRLABS_API_KEY;

if (!key) {
    console.log("AIRLABS_API_KEY is missing!");
} else {
    console.log(`Length: ${key.length}`);
    console.log(`First 5: ${key.substring(0, 5)}`);
    console.log(`Last 5: ${key.substring(key.length - 5)}`);
    console.log(`Contains newline? ${key.includes('\n')}`);
    console.log(`Contains carriage return? ${key.includes('\r')}`);
    console.log(`Raw bytes: ${JSON.stringify(key)}`);
}
