const db = require('../db/database');
const crypto = require('crypto');

let redgifsToken = null;

async function getRedgifsToken() {
    if (redgifsToken) return redgifsToken;
    try {
        const res = await fetch('https://api.redgifs.com/v2/auth/temporary');
        if (res.ok) {
            const data = await res.json();
            redgifsToken = data.token;
            return redgifsToken;
        }
    } catch (err) {
        db.addLog('error', `[Redgifs] Failed to get temporary token: ${err.message}`);
    }
    return null;
}

function getUrlHash(url) {
    return crypto.createHash('sha256').update(url).digest('hex');
}

async function processSingleFeed(feedConfig, client, isRunningFunc, guildId) {
    if (isRunningFunc && !isRunningFunc()) return;

    if (!feedConfig.active || !feedConfig.searchTerm || !feedConfig.channelId) {
        return;
    }

    let order = feedConfig.sort || 'trending'; // trending, top
    if (order === 'recent' || order === 'latest') order = 'trending';
    let feedType = feedConfig.feedType || 'search';
    let cleanSearchTerm = feedConfig.searchTerm.trim();

    // Support extracting from full URLs and prefixes
    const userUrlMatch = cleanSearchTerm.match(/redgifs\.com\/users\/([a-zA-Z0-9_-]+)/i);
    const tagUrlMatch = cleanSearchTerm.match(/redgifs\.com\/tags\/([a-zA-Z0-9_-]+)/i);

    if (userUrlMatch) {
        cleanSearchTerm = userUrlMatch[1];
        feedType = 'creator';
    } else if (tagUrlMatch) {
        cleanSearchTerm = tagUrlMatch[1];
        feedType = 'search';
    } else if (cleanSearchTerm.startsWith('@')) {
        cleanSearchTerm = cleanSearchTerm.substring(1);
        feedType = 'creator';
    } else if (cleanSearchTerm.startsWith('#')) {
        cleanSearchTerm = cleanSearchTerm.substring(1);
        feedType = 'search';
    }

    let feedUrl = '';
    let logTarget = '';

    if (feedType === 'creator') {
        feedUrl = `https://api.redgifs.com/v2/users/${encodeURIComponent(cleanSearchTerm)}/search?count=50&order=${order}`;
        logTarget = `creator: "${cleanSearchTerm}"`;
    } else {
        feedUrl = `https://api.redgifs.com/v2/gifs/search?search_text=${encodeURIComponent(cleanSearchTerm)}&count=50&order=${order}`;
        logTarget = `search: "${cleanSearchTerm}"`;
    }

    const channel = client.channels.cache.get(feedConfig.channelId);
    if (!channel) {
        db.addLog('error', `[Redgifs] Could not find Discord channel ${feedConfig.channelId} for ${logTarget}`, guildId);
        return;
    }

    const token = await getRedgifsToken();
    if (!token) return;

    db.addLog('info', `[Redgifs] Polling ${logTarget}...`, guildId);

    try {
        let response = await fetch(feedUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        // Fallback to global search if creator-specific endpoint is missing or fails
        if (!response.ok && feedType === 'creator') {
            db.addLog('info', `[Redgifs] User profile search failed for '${cleanSearchTerm}'. Falling back to global search...`, guildId);
            const fallbackUrl = `https://api.redgifs.com/v2/gifs/search?search_text=${encodeURIComponent(cleanSearchTerm)}&count=50&order=${order}`;
            response = await fetch(fallbackUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }

        if (!response.ok) {
            if (response.status === 401) {
                redgifsToken = null; // Token expired, reset it
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const json = await response.json();
        
        let newPostsCount = 0;
        const gifs = (json.gifs || []).reverse(); // Process oldest first

        for (const gif of gifs) {
            if (isRunningFunc && !isRunningFunc()) return;

            const postId = gif.id;
            
            const alreadyProcessed = await db.isRedgifsPostProcessed(postId);
            if (alreadyProcessed) continue;
            
            const mediaUrl = gif.urls?.hd || gif.urls?.sd;
            if (!mediaUrl) {
                await db.markRedgifsPostProcessed(postId, feedConfig.searchTerm);
                continue;
            }

            // Media Option Filtering (Videos vs Pics)
            const isVideo = gif.type === 1 || mediaUrl.includes('.mp4') || !!gif.urls?.mp4;
            const isImage = gif.type === 2 || (!isVideo && (mediaUrl.includes('.jpg') || mediaUrl.includes('.jpeg') || mediaUrl.includes('.png')));

            const mediaType = feedConfig.mediaType || 'all';
            if (mediaType === 'videos' && !isVideo) {
                await db.markRedgifsPostProcessed(postId, feedConfig.searchTerm);
                continue;
            }
            if (mediaType === 'images' && !isImage) {
                await db.markRedgifsPostProcessed(postId, feedConfig.searchTerm);
                continue;
            }

            // Duplicate Media URL Prevention Check
            const mediaHash = getUrlHash(mediaUrl);
            const alreadyPosted = await db.isFilePosted(mediaHash);
            if (alreadyPosted) {
                await db.markRedgifsPostProcessed(postId, feedConfig.searchTerm);
                continue;
            }

            try {
                await channel.send({ content: `[Watch Video](${mediaUrl})` });
                await db.markRedgifsPostProcessed(postId, feedConfig.searchTerm);
                await db.markFilePosted(mediaHash, mediaUrl);
                newPostsCount++;
                
                const delayMs = (feedConfig.postDelay || 2.5) * 1000;
                await new Promise(r => setTimeout(r, delayMs));
            } catch (discordErr) {
                db.addLog('error', `[Redgifs] Discord post failed: ${discordErr.message}`, guildId);
            }
        }
        
        if (newPostsCount > 0) {
            db.addLog('info', `[Redgifs] Found and posted ${newPostsCount} new items for ${logTarget}`, guildId);
        }
    } catch (feedErr) {
        db.addLog('error', `[Redgifs] API Error for ${logTarget}: ${feedErr.message}`, guildId);
    }
}

async function checkRedgifsFeed(client, isRunningFunc, guildId) {
    try {
        const config = guildId
            ? await db.getGuildConfig(guildId, 'redgifs_settings')
            : await db.getConfig('redgifs_settings');

        if (!config || !config.feeds || config.feeds.length === 0) {
            return;
        }
        
        const promises = config.feeds.map((feedConfig, index) => {
            if (index > 0) {
                return new Promise(r => setTimeout(r, index * 1500))
                    .then(() => processSingleFeed(feedConfig, client, isRunningFunc, guildId));
            }
            return processSingleFeed(feedConfig, client, isRunningFunc, guildId);
        });
        await promises;
    } catch (err) {
        db.addLog('error', `[Redgifs Job] Error: ${err.message}`, guildId);
    }
}

module.exports = {
    checkRedgifsFeed
};
