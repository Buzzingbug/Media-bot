require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./api/routes');
const bot = require('./bot');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Serve static frontend files in production
app.use(express.static(path.join(__dirname, '../frontend/dist')));

app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
    // Initialize bot if token is already present in DB
    bot.initializeIfConfigured();
});
