const express = require('express');
const router = express.Router();
const db = require('../db/database');
const bot = require('../bot');

// ── Bot Config (shared/global) ───────────────────────────────────────────────

router.get('/config', async (req, res) => {
    try {
        const token = await db.getConfig('discord_token');
        res.json({ hasToken: !!token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/config', async (req, res) => {
    try {
        const { token } = req.body;
        if (token) {
            await db.setConfig('discord_token', token);
            await bot.initializeIfConfigured();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// ── Status — per-guild ────────────────────────────────────────────────────────
// Pass ?guildId=xxx or include guildId in body

router.get('/status', (req, res) => {
    const guildId = req.query.guildId || null;
    res.json({
        isReady: bot.isReady(),
        isRedditRunning: guildId ? bot.isRedditPollerRunning(guildId) : false,
        isRedgifsRunning: guildId ? bot.isRedgifsPollerRunning(guildId) : false
    });
});

// ── Logs — per-guild ─────────────────────────────────────────────────────────

router.get('/logs', async (req, res) => {
    try {
        const guildId = req.query.guildId || null;
        const limit = parseInt(req.query.limit) || 100;
        const logs = await db.getLogs(limit, guildId);
        res.json({ logs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Channels / Guilds ────────────────────────────────────────────────────────

router.get('/channels', (req, res) => {
    try {
        const guildId = req.query.guildId || null;
        const channels = bot.getChannels(guildId);
        const guilds = bot.getGuilds();
        res.json({ channels, guilds });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Reddit config — per-guild ─────────────────────────────────────────────────

router.get('/reddit/config', async (req, res) => {
    try {
        const guildId = req.query.guildId;
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });

        const settings = await db.getGuildConfig(guildId, 'reddit_settings') || {
            globalInterval: 10,
            feeds: []
        };
        res.json({ settings, hasCredentials: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/reddit/config', async (req, res) => {
    try {
        const { guildId, settings } = req.body;
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });
        await db.setGuildConfig(guildId, 'reddit_settings', settings);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/reddit/start', async (req, res) => {
    try {
        const { guildId } = req.body;
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });
        if (bot.isRedditPollerRunning(guildId)) {
            return res.status(400).json({ error: 'Reddit poller is already running for this server' });
        }
        await bot.startRedditPoller(guildId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/reddit/stop', async (req, res) => {
    try {
        const { guildId } = req.body;
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });
        bot.stopRedditPoller(guildId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Redgifs config — per-guild ────────────────────────────────────────────────

router.get('/redgifs/config', async (req, res) => {
    try {
        const guildId = req.query.guildId;
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });

        const settings = await db.getGuildConfig(guildId, 'redgifs_settings') || {
            globalInterval: 10,
            feeds: []
        };
        res.json({ settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/redgifs/config', async (req, res) => {
    try {
        const { guildId, settings } = req.body;
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });
        await db.setGuildConfig(guildId, 'redgifs_settings', settings);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/redgifs/start', async (req, res) => {
    try {
        const { guildId } = req.body;
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });
        if (bot.isRedgifsPollerRunning(guildId)) {
            return res.status(400).json({ error: 'Redgifs poller is already running for this server' });
        }
        await bot.startRedgifsPoller(guildId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/redgifs/stop', async (req, res) => {
    try {
        const { guildId } = req.body;
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });
        bot.stopRedgifsPoller(guildId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
