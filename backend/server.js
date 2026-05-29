require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./api/routes');
const bot = require('./bot');

const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Healthcheck endpoint for Railway
app.get('/healthz', async (req, res) => {
    try {
        // Query config table to test DB health
        await db.getConfig('discord_token');
        res.status(200).json({ status: 'OK', database: 'connected', botReady: bot.isReady() });
    } catch (err) {
        res.status(500).json({ status: 'ERROR', error: err.message });
    }
});

// API Routes
app.use('/api', apiRoutes);

// Serve static frontend files in production
app.use(express.static(path.join(__dirname, '../frontend/dist')));

app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
});

// Start server
app.listen(PORT, async () => {
    console.log(`[Server] Running on port ${PORT}`);
    
    // Wait for the database connection and tables to successfully initialize
    console.log('[Server] Awaiting database setup...');
    await db.waitDb;
    console.log('[Server] Database setup ready. Initializing bot if configured...');
    
    // Initialize bot if token is already present in DB
    bot.initializeIfConfigured();
});
