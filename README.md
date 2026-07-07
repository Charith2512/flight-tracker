# ✈️ Aero | Professional Flight Tracker

Aero is a premium, real-time flight tracking application that provides live updates on aircraft positions, routes, and flight metadata. It leverages a hybrid data model combining high-precision live states from the **OpenSky Network** and rich flight metadata from **AirLabs**.

![Project Preview](https://via.placeholder.com/800x400?text=Aero+Flight+Tracker+Preview) <!-- Placeholder for actual screenshot -->

## 🌟 Features

- **Real-time Tracking**: Live aircraft positions updated on an interactive Leaflet map.
- **Multi-Mode Search**:
  - **Flight No**: Track specific aircraft by their callsign (e.g., UAE123).
  - **Route**: Search for all active flights between two airports (e.g., LHR to JFK).
  - **Explore**: Discover flights departing from a specific country or city.
- **Detailed Insights**: View altitude, velocity, true track, origin/destination airports, and flight progress.
- **Historical Path**: Follow the actual flight path of an aircraft across the map.
- **Glassmorphism UI**: Beautiful, modern "Bento Box" search panel with light and dark mode support.
- **Hybrid Data Engine**: Optimized API usage with smart fallbacks between OpenSky and AirLabs.

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (Glassmorphism), Leaflet.js
- **Backend**: Node.js, Express.js
- **Database**: MySQL (Sequelize ORM)
- **APIs**: [OpenSky Network](https://opensky-network.org/), [AirLabs](https://airlabs.co/)

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16+ recommended)
- [MySQL](https://www.mysql.com/) database
- [AirLabs API Key](https://airlabs.co/)

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd flight-tracker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory and add the following:
   ```env
   # Server Configuration
   PORT=3000

   # Database Configuration
   DB_HOST=localhost
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   DB_NAME=flight_tracker_db

   # API Keys
   AIRLABS_API_KEY=your_airlabs_api_key

   # Optional: OpenSky Credentials (for higher rate limits)
   OPENSKY_USERNAME=your_username
   OPENSKY_PASSWORD=your_password
   ```

4. **Initialize Database**:
   The application will automatically create the necessary tables on the first run. Ensure your MySQL server is running and the database specified in `DB_NAME` exists.

5. **Run the application**:
   ```bash
   # Production mode
   npm start

   # Development mode (with nodemon)
   npm run dev
   ```

## 📈 API Usage & Credits

The application includes an internal tracking system for API credits to help you monitor usage across OpenSky and AirLabs. You can view current credit balances directly in the UI.

## 📄 License

This project is licensed under the ISC License.

---
*Built with ❤️ for aviation enthusiasts.*
