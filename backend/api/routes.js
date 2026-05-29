const express = require('express');
const router = express.Router();
const db = require('../db/database');
const bot = require('../bot');

// Get configuration
router.get('/config', async (req, res) => {
    try {
        const token = await db.getConfig('discord_token');
        const settings = await db.getConfig('backup_settings') || {
            sourceGuild: '',
            sourceChannel: '',
            destGuild: '',
            destChannel: '',
            limit: 100,
            mediaTypes: { images: true, videos: true },
            deleteAfterSync: false,
            ignoreBots: true,
            dryRun: false,
            postDelay: 2.5
        };
        
        // Don't send the full token back for security, just whether it exists
        res.json({ 
            hasToken: !!token, 
            settings 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save configuration
router.post('/config', async (req, res) => {
    try {
        const { token, settings } = req.body;
        
        if (token) {
            await db.setConfig('discord_token', token);
            // Re-initialize bot with new token
            await bot.initializeIfConfigured();
        }
        
        if (settings) {
            await db.setConfig('backup_settings', settings);
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start backup job
router.post('/start', async (req, res) => {
    try {
        const isRunning = bot.isJobRunning();
        if (isRunning) {
            return res.status(400).json({ error: 'A backup job is already running' });
        }
        
        await bot.startBackupJob();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Stop backup job
router.post('/stop', async (req, res) => {
    try {
        bot.stopBackupJob();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get bot status
router.get('/status', (req, res) => {
    res.json({
        isReady: bot.isReady(),
        isRunning: bot.isJobRunning(),
        isRedditRunning: bot.isRedditPollerRunning(),
        isRedgifsRunning: bot.isRedgifsPollerRunning(),
        progress: bot.getProgress()
    });
});

// Get logs
router.get('/logs', async (req, res) => {
    try {
        const logs = await db.getLogs(100);
        res.json({ logs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get available channels
router.get('/channels', (req, res) => {
    try {
        const channels = bot.getChannels();
        res.json({ channels });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Reddit configuration
router.get('/reddit/config', async (req, res) => {
    try {
        const settings = await db.getConfig('reddit_settings') || {
            globalInterval: 10,
            feeds: []
        };
        
        res.json({ settings, hasCredentials: true }); // Mocking true so frontend doesn't complain if checked
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save Reddit configuration
router.post('/reddit/config', async (req, res) => {
    try {
        const { settings } = req.body;
        await db.setConfig('reddit_settings', settings);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Reddit poller
router.post('/reddit/start', async (req, res) => {
    try {
        if (bot.isRedditPollerRunning()) {
            return res.status(400).json({ error: 'Reddit poller is already running' });
        }
        await bot.startRedditPoller();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Stop Reddit poller
router.post('/reddit/stop', async (req, res) => {
    try {
        bot.stopRedditPoller();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Redgifs configuration
router.get('/redgifs/config', async (req, res) => {
    try {
        const settings = await db.getConfig('redgifs_settings') || {
            globalInterval: 10,
            feeds: []
        };
        
        res.json({ settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save Redgifs configuration
router.post('/redgifs/config', async (req, res) => {
    try {
        const { settings } = req.body;
        await db.setConfig('redgifs_settings', settings);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Redgifs poller
router.post('/redgifs/start', async (req, res) => {
    try {
        if (bot.isRedgifsPollerRunning()) {
            return res.status(400).json({ error: 'Redgifs poller is already running' });
        }
        await bot.startRedgifsPoller();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Stop Redgifs poller
router.post('/redgifs/stop', async (req, res) => {
    try {
        bot.stopRedgifsPoller();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
