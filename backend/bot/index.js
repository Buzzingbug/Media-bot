const { Client, GatewayIntentBits } = require('discord.js');
const db = require('../db/database');
const { checkRedditFeed } = require('./redditJob');
const { checkRedgifsFeed } = require('./redgifsJob');

let client = null;
let isBotReady = false;

// Per-guild poller state — keyed by guildId
const redditIntervals = new Map();   // guildId -> intervalId
const redditRunning   = new Map();   // guildId -> boolean

const redgifsIntervals = new Map();
const redgifsRunning   = new Map();

async function initializeIfConfigured() {
    let token = await db.getConfig('discord_token');
    if (!token && process.env.DISCORD_TOKEN) {
        token = process.env.DISCORD_TOKEN;
        db.addLog('info', 'Loaded Discord token from environment variable.');
    }
    if (token) {
        if (client) {
            client.destroy();
        }
        
        client = new Client({ 
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages
            ] 
        });

        client.once('ready', () => {
            isBotReady = true;
            console.log(`[Bot] Logged in as ${client.user.tag}`);
            db.addLog('info', `Bot logged in as ${client.user.tag}`);
        });

        client.on('error', (error) => {
            console.error('[Bot] Error:', error);
            db.addLog('error', `Discord client error: ${error.message}`);
        });

        try {
            await client.login(token);
        } catch (error) {
            console.error('[Bot] Failed to login:', error.message);
            db.addLog('error', `Failed to login: ${error.message}`);
        }
    }
}

function isReady() {
    return isBotReady && client && client.isReady();
}

// Backup Job removed per Option 2

// ── Per-guild Reddit poller ──────────────────────────────────────────────────

async function startRedditPoller(guildId) {
    if (!isReady()) throw new Error("Bot is not ready.");
    if (redditRunning.get(guildId)) throw new Error("Reddit poller is already running for this server.");
    
    const config = await db.getGuildConfig(guildId, 'reddit_settings');
    const intervalMinutes = config && config.globalInterval ? config.globalInterval : 10;
    
    redditRunning.set(guildId, true);
    db.addLog('info', `[Reddit] Started polling for guild ${guildId} every ${intervalMinutes} minutes.`, guildId);
    
    const runCheck = () => checkRedditFeed(client, () => redditRunning.get(guildId) === true, guildId);
    
    runCheck();
    const intervalId = setInterval(runCheck, intervalMinutes * 60 * 1000);
    redditIntervals.set(guildId, intervalId);
}

function stopRedditPoller(guildId) {
    if (redditRunning.get(guildId) && redditIntervals.has(guildId)) {
        clearInterval(redditIntervals.get(guildId));
        redditIntervals.delete(guildId);
        redditRunning.set(guildId, false);
        db.addLog('info', `[Reddit] Stopped polling for guild ${guildId}.`, guildId);
    }
}

function isRedditPollerRunning(guildId) {
    return redditRunning.get(guildId) === true;
}

// ── Per-guild Redgifs poller ─────────────────────────────────────────────────

async function startRedgifsPoller(guildId) {
    if (!isReady()) throw new Error("Bot is not ready.");
    if (redgifsRunning.get(guildId)) throw new Error("Redgifs poller is already running for this server.");
    
    const config = await db.getGuildConfig(guildId, 'redgifs_settings');
    const intervalMinutes = config && config.globalInterval ? config.globalInterval : 10;
    
    redgifsRunning.set(guildId, true);
    db.addLog('info', `[Redgifs] Started polling for guild ${guildId} every ${intervalMinutes} minutes.`, guildId);
    
    const runCheck = () => checkRedgifsFeed(client, () => redgifsRunning.get(guildId) === true, guildId);
    
    runCheck();
    const intervalId = setInterval(runCheck, intervalMinutes * 60 * 1000);
    redgifsIntervals.set(guildId, intervalId);
}

function stopRedgifsPoller(guildId) {
    if (redgifsRunning.get(guildId) && redgifsIntervals.has(guildId)) {
        clearInterval(redgifsIntervals.get(guildId));
        redgifsIntervals.delete(guildId);
        redgifsRunning.set(guildId, false);
        db.addLog('info', `[Redgifs] Stopped polling for guild ${guildId}.`, guildId);
    }
}

function isRedgifsPollerRunning(guildId) {
    return redgifsRunning.get(guildId) === true;
}

// ── Channel / Guild helpers ──────────────────────────────────────────────────

function getChannels(guildId) {
    if (!isReady()) return [];
    
    const channels = [];

    const processGuild = (guild) => {
        guild.channels.cache
            .filter(c => c.isTextBased())
            .forEach(c => {
                channels.push({
                    id: c.id,
                    name: `#${c.name}`,
                    guild: guild.name,
                    guildId: guild.id
                });
            });
    };

    if (guildId) {
        const guild = client.guilds.cache.get(guildId);
        if (guild) processGuild(guild);
    } else {
        client.guilds.cache.forEach(processGuild);
    }

    return channels;
}

function getGuilds() {
    if (!isReady()) return [];
    const guilds = [];
    client.guilds.cache.forEach(guild => {
        guilds.push({
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL({ size: 64, format: 'png' }) || null
        });
    });
    return guilds;
}

module.exports = {
    initializeIfConfigured,
    isReady,
    startRedditPoller,
    stopRedditPoller,
    isRedditPollerRunning,
    startRedgifsPoller,
    stopRedgifsPoller,
    isRedgifsPollerRunning,
    getChannels,
    getGuilds,
    getClient: () => client
};
