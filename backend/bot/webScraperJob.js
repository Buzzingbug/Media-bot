const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const crypto = require('crypto');
const cheerio = require('cheerio');

const FETCH_OPTIONS = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    }
};

function getUrlHash(url) {
    return crypto.createHash('sha256').update(url).digest('hex');
}

// Ensure the URL is absolute
function resolveUrl(base, relative) {
    try {
        return new URL(relative, base).href;
    } catch (e) {
        return relative;
    }
}

async function processSingleFeed(feedConfig, client, isRunningFunc, guildId) {
    if (isRunningFunc && !isRunningFunc()) return;

    if (!feedConfig.active || !feedConfig.url || !feedConfig.channelId) {
        return;
    }

    const channel = client.channels.cache.get(feedConfig.channelId);
    if (!channel) {
        db.addLog('error', `[Web Scraper] Could not find Discord channel ${feedConfig.channelId} for ${feedConfig.url}`, guildId);
        return;
    }

    db.addLog('info', `[Web Scraper] Fetching HTML from ${feedConfig.url}...`, guildId);
    
    try {
        const response = await fetch(feedConfig.url, FETCH_OPTIONS);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const selector = feedConfig.selector || 'img, a';
        const elements = $(selector);
        
        let newPostsCount = 0;
        
        // Convert Cheerio object to array so we can process sequentially and pause between posts
        const elsArray = elements.toArray();

        for (let el of elsArray) {
            if (isRunningFunc && !isRunningFunc()) break;
            
            let src = $(el).attr('src') || $(el).attr('href') || $(el).attr('data-src');
            if (!src) continue;

            const absoluteUrl = resolveUrl(feedConfig.url, src);
            
            // Strictly check for .gif
            if (!absoluteUrl.toLowerCase().includes('.gif')) {
                continue;
            }

            const mediaHash = getUrlHash(absoluteUrl);
            const alreadyPosted = await db.isFilePosted(mediaHash);

            if (!alreadyPosted) {
                try {
                    await channel.send({ content: absoluteUrl });
                    await db.markFilePosted(mediaHash, absoluteUrl);
                    newPostsCount++;
                    
                    const delayMs = (feedConfig.postDelay || 2.5) * 1000;
                    await new Promise(r => setTimeout(r, delayMs));
                } catch (discordErr) {
                    db.addLog('error', `[Web Scraper] Discord post failed for ${absoluteUrl}: ${discordErr.message}`, guildId);
                }
            }
        }
        
        if (newPostsCount > 0) {
            db.addLog('info', `[Web Scraper] Found and posted ${newPostsCount} new GIFs from ${feedConfig.url}`, guildId);
        } else {
            db.addLog('info', `[Web Scraper] No new GIFs found at ${feedConfig.url}`, guildId);
        }
    } catch (feedErr) {
        db.addLog('error', `[Web Scraper] Error scraping ${feedConfig.url}: ${feedErr.message}`, guildId);
    }
}

async function checkWebFeed(client, isRunningFunc, guildId) {
    try {
        const config = guildId
            ? await db.getGuildConfig(guildId, 'web_settings')
            : await db.getConfig('web_settings');

        if (!config || !config.feeds || config.feeds.length === 0) {
            return;
        }
        
        for (const feedConfig of config.feeds) {
            if (isRunningFunc && !isRunningFunc()) break;
            
            try {
                await processSingleFeed(feedConfig, client, isRunningFunc, guildId);
            } catch (feedErr) {
                db.addLog('error', `[Web Scraper] Error processing feed: ${feedErr.message}`, guildId);
            }
            
            // Wait 10 seconds between processing each feed to avoid aggressive scraping
            await new Promise(r => setTimeout(r, 10000));
        }
    } catch (err) {
        db.addLog('error', `[Web Scraper] General Error: ${err.message}`, guildId);
    }
}

module.exports = {
    checkWebFeed
};
