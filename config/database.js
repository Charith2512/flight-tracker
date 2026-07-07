const mysql = require("mysql2/promise");
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const initDB = async () => {
  try {
    const connection = await pool.getConnection();

    // Create api_usage table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS api_usage (
            id INT AUTO_INCREMENT PRIMARY KEY,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            credits_left INT NOT NULL
        )
    `);

    // Create airlabs_usage table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS airlabs_usage (
            id INT AUTO_INCREMENT PRIMARY KEY,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            requests_made INT DEFAULT 1,
            credits_remaining INT
        )
    `);

    connection.release();
    console.log("Database initialized: Tables ready.");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
};

module.exports = { pool, initDB };
