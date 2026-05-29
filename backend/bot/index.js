const { Client, GatewayIntentBits } = require('discord.js');
const db = require('../db/database');
const { runJob } = require('./backupJob');
const { checkRedditFeed } = require('./redditJob');
const { checkRedgifsFeed } = require('./redgifsJob');

let client = null;
let isBotReady = false;
let jobRunning = false;
let currentProgress = { total: 0, processed: 0, skipped: 0, errors: 0 };
let abortController = null;

let redditIntervalId = null;
let isRedditRunning = false;

let redgifsIntervalId = null;
let isRedgifsRunning = false;

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
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
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

function isJobRunning() {
    return jobRunning;
}

function getProgress() {
    return currentProgress;
}

async function startBackupJob() {
    if (!isReady()) {
        throw new Error("Bot is not ready or not configured with a valid token.");
    }
    
    if (jobRunning) {
        throw new Error("Job is already running.");
    }
    
    const settings = await db.getConfig('backup_settings');
    if (!settings || !settings.sourceChannel || !settings.destChannel) {
        throw new Error("Source and destination channels are not fully configured.");
    }

    jobRunning = true;
    abortController = new AbortController();
    
    // Reset progress
    currentProgress = { total: 0, processed: 0, skipped: 0, errors: 0 };
    db.addLog('info', `Starting backup job with limit ${settings.limit}`);
    
    // Run asynchronously
    runJob(client, settings, currentProgress, abortController.signal)
        .then(() => {
            db.addLog('info', `Backup job completed successfully. Processed: ${currentProgress.processed}, Skipped: ${currentProgress.skipped}`);
        })
        .catch(err => {
            if (err.name === 'AbortError') {
                db.addLog('warning', 'Backup job was stopped manually.');
            } else {
                db.addLog('error', `Backup job failed: ${err.message}`);
            }
        })
        .finally(() => {
            jobRunning = false;
        });
}

function stopBackupJob() {
    if (jobRunning && abortController) {
        abortController.abort();
        jobRunning = false;
    }
}

async function startRedditPoller() {
    if (!isReady()) throw new Error("Bot is not ready.");
    if (isRedditRunning) throw new Error("Reddit poller is already running.");
    
    const config = await db.getConfig('reddit_settings');
    const intervalMinutes = config && config.globalInterval ? config.globalInterval : 10;
    
    isRedditRunning = true;
    db.addLog('info', `[Reddit] Started polling every ${intervalMinutes} minutes.`);
    
    // Run immediately once
    checkRedditFeed(client, isRedditPollerRunning);
    
    // Set interval
    redditIntervalId = setInterval(() => {
        checkRedditFeed(client, isRedditPollerRunning);
    }, intervalMinutes * 60 * 1000);
}

function stopRedditPoller() {
    if (isRedditRunning && redditIntervalId) {
        clearInterval(redditIntervalId);
        redditIntervalId = null;
        isRedditRunning = false;
        db.addLog('info', `[Reddit] Stopped polling.`);
    }
}

function isRedditPollerRunning() {
    return isRedditRunning;
}

async function startRedgifsPoller() {
    if (!isReady()) throw new Error("Bot is not ready.");
    if (isRedgifsRunning) throw new Error("Redgifs poller is already running.");
    
    const config = await db.getConfig('redgifs_settings');
    const intervalMinutes = config && config.globalInterval ? config.globalInterval : 10;
    
    isRedgifsRunning = true;
    db.addLog('info', `[Redgifs] Started polling every ${intervalMinutes} minutes.`);
    
    checkRedgifsFeed(client, isRedgifsPollerRunning);
    
    redgifsIntervalId = setInterval(() => {
        checkRedgifsFeed(client, isRedgifsPollerRunning);
    }, intervalMinutes * 60 * 1000);
}

function stopRedgifsPoller() {
    if (isRedgifsRunning && redgifsIntervalId) {
        clearInterval(redgifsIntervalId);
        redgifsIntervalId = null;
        isRedgifsRunning = false;
        db.addLog('info', `[Redgifs] Stopped polling.`);
    }
}

function isRedgifsPollerRunning() {
    return isRedgifsRunning;
}

function getChannels() {
    if (!isReady()) return [];
    
    const channels = [];
    client.guilds.cache.forEach(guild => {
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
    });
    return channels;
}

function getGuilds() {
    if (!isReady()) return [];
    const guilds = [];
    client.guilds.cache.forEach(guild => {
        guilds.push({
            id: guild.id,
            name: guild.name
        });
    });
    return guilds;
}

module.exports = {
    initializeIfConfigured,
    isReady,
    isJobRunning,
    getProgress,
    startBackupJob,
    stopBackupJob,
    startRedditPoller,
    stopRedditPoller,
    isRedditPollerRunning,
    startRedgifsPoller,
    stopRedgifsPoller,
    isRedgifsPollerRunning,
    getChannels,
    getGuilds
};
