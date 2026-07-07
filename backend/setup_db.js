const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function setupDatabase() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
        });

        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
        console.log(`Database '${process.env.DB_NAME}' created or already exists.`);
        
        // Create flight_paths table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS flight_paths (
                id INT AUTO_INCREMENT PRIMARY KEY,
                icao24 VARCHAR(10) NOT NULL,
                latitude DOUBLE NOT NULL,
                longitude DOUBLE NOT NULL,
                true_track DOUBLE,
                timestamp INT NOT NULL,
                UNIQUE KEY unique_point (icao24, timestamp)
            )
        `);

        // Create api_usage table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS api_usage (
                id INT AUTO_INCREMENT PRIMARY KEY,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                credits_left INT NOT NULL
            )
        `);

        console.log('Database initialized: Tables ready.');
        process.exit(1);
    } catch (error) {
        console.error('Error setting up database:', error);
        process.exit(1);
    }
}

setupDatabase();
